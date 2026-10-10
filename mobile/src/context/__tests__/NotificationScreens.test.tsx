import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import HONotificationsScreen from '../../../app/(homeowner)/screens/HONotificationsScreen';
import SPNotificationsScreen from '../../../app/(provider)/screens/SPNotificationsScreen';
import { api } from '../../lib/api';
import { useNotifications } from '../NotificationsContext';
import { showToast } from '../../components/Toast';
jest.mock('../NotificationsContext', () => ({ useNotifications: jest.fn() }));
jest.mock('../../lib/api', () => ({
  api: {
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
    deleteNotification: jest.fn(),
    clearNotifications: jest.fn(),
  },
}));
jest.mock('../../components/Toast', () => ({ showToast: jest.fn() }));
const callbacks = {
  onBack: jest.fn(),
  onOpenJob: jest.fn(),
  onOpenProposals: jest.fn(),
  onOpenChat: jest.fn(),
  onOpenDispute: jest.fn(),
  onOpenServices: jest.fn(),
};
const row = {
  id: 'n1',
  type: 'message',
  title: 'New message',
  body: 'Hello',
  read_at: null,
  created_at: new Date().toISOString(),
  data: { job_id: 'j1', conversation_id: 'c1' },
};
const older = {
  ...row,
  id: 'n2',
  type: 'job_update',
  title: 'Old offer',
  body: 'From last week',
  read_at: '2026-10-01T00:00:00.000Z',
  // 26 hours ago is always on an earlier calendar day than today.
  created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  data: { job_id: 'j2' },
};
type TestRow = Omit<typeof row, 'read_at' | 'data'> & {
  read_at: string | null;
  data: Record<string, string> | null;
};

function setNotifications(notifications: TestRow[], unreadCount = notifications.filter((n) => !n.read_at).length) {
  (useNotifications as jest.Mock).mockReturnValue({
    notifications,
    unreadCount,
    loading: false,
    error: null,
    reload: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setNotifications([row]);
  (api.markNotificationRead as jest.Mock).mockResolvedValue({ success: true });
  (api.markAllNotificationsRead as jest.Mock).mockResolvedValue({
    success: true,
  });
  (api.deleteNotification as jest.Mock).mockResolvedValue(undefined);
});
it.each([HONotificationsScreen, SPNotificationsScreen])(
  'opens chat for message rows in either role',
  async (Screen) => {
    render(<Screen {...callbacks} />);
    await act(async () => {
      fireEvent.press(screen.getByText('New message'));
    });
    expect(callbacks.onOpenChat).toHaveBeenCalledWith('j1');
    expect(callbacks.onOpenJob).not.toHaveBeenCalled();
  },
);
it('opens My Services for a provider request decision', async () => {
  (useNotifications as jest.Mock).mockReturnValue({
    notifications: [{ ...row, data: { request_id: 'r1' } }],
    unreadCount: 1,
    loading: false,
    error: null,
    reload: jest.fn(),
  });
  render(<SPNotificationsScreen {...callbacks} />);
  await act(async () => {
    fireEvent.press(screen.getByText('New message'));
  });
  expect(callbacks.onOpenServices).toHaveBeenCalled();
});
it('shows provider read failures instead of leaving an unhandled rejection', async () => {
  (api.markAllNotificationsRead as jest.Mock).mockRejectedValue(
    new Error('Write failed'),
  );
  render(<SPNotificationsScreen {...callbacks} />);
  await act(async () => {
    fireEvent.press(screen.getByText('Mark all read'));
  });
  expect(showToast).toHaveBeenCalledWith('Write failed', 'error');
});

describe('notification list layout', () => {
  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'splits the rows into Today and Earlier',
    (Screen) => {
      setNotifications([row, older]);
      render(<Screen {...callbacks} />);
      expect(screen.getByText('Today')).toBeTruthy();
      expect(screen.getByText('Earlier')).toBeTruthy();
      expect(screen.getByText('Old offer')).toBeTruthy();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'shows the unread count beside Mark all read',
    (Screen) => {
      setNotifications([row, older]);
      render(<Screen {...callbacks} />);
      expect(screen.getByText('1 unread')).toBeTruthy();
      expect(screen.getByText('Mark all read')).toBeTruthy();
    },
  );

  it.each<[React.ComponentType<any>, string]>([
    [HONotificationsScreen, 'New proposals, bookings and messages will show up here.'],
    [SPNotificationsScreen, 'Job invites, proposal updates, bookings and messages will show up here.'],
  ])('says what will show up when there is nothing yet', (Screen, body) => {
    setNotifications([]);
    render(<Screen {...callbacks} />);
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
  });
});

describe('deleting a notification', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(async () => {
    // Commit anything still waiting out its Undo window so the next test starts clean.
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const undoAction = () => {
    const call = (showToast as jest.Mock).mock.calls.filter((c) => c[0] === 'Notification deleted').at(-1);
    return call?.[2]?.onPress as (() => void) | undefined;
  };

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'hides the row, offers Undo and sends the delete only after the window',
    async (Screen) => {
      render(<Screen {...callbacks} />);
      fireEvent.press(screen.getByLabelText('Delete notification: New message'));

      expect(screen.queryByText('Delete notification?')).toBeNull();
      expect(screen.queryByText('New message')).toBeNull();
      expect(showToast).toHaveBeenCalledWith('Notification deleted', 'info', expect.objectContaining({ label: 'Undo' }));
      expect(api.deleteNotification).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(4999);
      });
      expect(api.deleteNotification).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(api.deleteNotification).toHaveBeenCalledTimes(1);
      expect(api.deleteNotification).toHaveBeenCalledWith('n1');
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'Undo brings the row back and never sends the delete',
    async (Screen) => {
      render(<Screen {...callbacks} />);
      fireEvent.press(screen.getByLabelText('Delete notification: New message'));

      const undo = undoAction();
      expect(undo).toBeDefined();
      act(() => undo?.());

      expect(screen.getByText('New message')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(api.deleteNotification).not.toHaveBeenCalled();
    },
  );

  it('keeps the row back and reports the error when the delete fails', async () => {
    (api.deleteNotification as jest.Mock).mockRejectedValueOnce(new Error('Server said no'));
    render(<HONotificationsScreen {...callbacks} />);
    fireEvent.press(screen.getByLabelText('Delete notification: New message'));

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(showToast).toHaveBeenCalledWith('Could not delete that notification.', 'error');
    expect(screen.getByText('New message')).toBeTruthy();
  });
});
