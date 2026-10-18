import { findUnnamedControls } from '../../testing/a11yAudit';
import React from 'react';
import { Ban, ShieldAlert, UserPlus } from 'lucide-react-native';
import { ScrollView } from 'react-native';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react-native';
import HONotificationsScreen from '../../../app/(homeowner)/screens/HONotificationsScreen';
import SPNotificationsScreen from '../../../app/(provider)/screens/SPNotificationsScreen';
import NotificationCard from '../../components/ui/NotificationCard';
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
function openMenu() {
  fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
}
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
  target?: { screen: string };
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
it('opens verification for a verification_update row whose target is the verification screen', async () => {
  const onOpenVerification = jest.fn();
  setNotifications([
    {
      ...row,
      id: 'n5',
      type: 'verification_update',
      title: 'Verification approved',
      body: 'Your ID has been verified. Your profile now shows a verified badge.',
      data: {},
      target: { screen: 'verification' },
    },
  ]);
  render(<SPNotificationsScreen {...callbacks} onOpenVerification={onOpenVerification} />);
  await act(async () => {
    fireEvent.press(screen.getByText('Verification approved'));
  });
  expect(onOpenVerification).toHaveBeenCalledTimes(1);
  expect(callbacks.onOpenJob).not.toHaveBeenCalled();
  expect(callbacks.onOpenChat).not.toHaveBeenCalled();
  expect(callbacks.onOpenServices).not.toHaveBeenCalled();
});
it('shows provider read failures instead of leaving an unhandled rejection', async () => {
  (api.markAllNotificationsRead as jest.Mock).mockRejectedValue(
    new Error('Write failed'),
  );
  render(<SPNotificationsScreen {...callbacks} />);
  openMenu();
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Mark all read' }));
  });
  expect(showToast).toHaveBeenCalledWith('Write failed', 'error');
});

describe('notification list layout', () => {
  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'splits the rows into Today, This week and Earlier',
    (Screen) => {
      const old = { ...older, id: 'n9', title: 'Month-old offer', created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() };
      setNotifications([row, older, old]);
      render(<Screen {...callbacks} />);
      expect(screen.getByText('Today')).toBeTruthy();
      expect(screen.getByText('This week')).toBeTruthy();
      expect(screen.getByText('Earlier')).toBeTruthy();
      expect(screen.getByText('Old offer')).toBeTruthy();
      expect(screen.getByText('Month-old offer')).toBeTruthy();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'leaves out a group that has no rows',
    (Screen) => {
      setNotifications([row]);
      render(<Screen {...callbacks} />);
      expect(screen.getByText('Today')).toBeTruthy();
      expect(screen.queryByText('This week')).toBeNull();
      expect(screen.queryByText('Earlier')).toBeNull();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'keeps the unread count and moves Mark all read into the header menu',
    async (Screen) => {
      setNotifications([row, older]);
      render(<Screen {...callbacks} />);
      expect(screen.getByText('1 unread')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull();
      openMenu();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Mark all read' }));
      });
      expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'the menu offers only Clear all once everything is read',
    (Screen) => {
      setNotifications([older]);
      render(<Screen {...callbacks} />);
      openMenu();
      expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Clear all notifications' }));
      expect(screen.getByText('Clear all notifications?')).toBeTruthy();
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

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'puts the caught-up state inside the card, like the other empty states',
    (Screen) => {
      setNotifications([]);
      render(<Screen {...callbacks} />);
      expect(within(screen.getByTestId('empty-card')).getByText("You're all caught up")).toBeTruthy();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'a failed load with nothing to show is a card whose Try again reloads the notifications',
    (Screen) => {
      const reload = jest.fn();
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [], unreadCount: 0, loading: false, error: 'Notifications unavailable', reload,
      });
      render(<Screen {...callbacks} />);
      const card = screen.getByTestId('error-card');
      expect(within(card).getByText("Couldn't load notifications")).toBeTruthy();
      expect(within(card).getByText('Notifications unavailable')).toBeTruthy();
      fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));
      expect(reload).toHaveBeenCalledTimes(1);
    },
  );
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

it.each([HONotificationsScreen, SPNotificationsScreen])(
  'every control has an accessible name: back, the notification rows and their delete buttons',
  async (Screen) => {
    render(<Screen {...callbacks} />);
    expect(await screen.findByText('New message')).toBeTruthy();
    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  },
);

it.each([HONotificationsScreen, SPNotificationsScreen])(
  'shows the icon for what happened: an applicant for a new application, a ban for a cancellation, never the alert shield',
  (Screen) => {
    setNotifications([
      { ...row, id: 'n3', type: 'application_update', title: 'New application', body: 'Ana applied to "Fix sink".', data: { job_id: 'j1' } },
      {
        ...row,
        id: 'n4',
        type: 'dispute_update',
        title: 'Cancellation agreed',
        body: 'Cancellation agreed. Any unsettled escrow was refunded to the client.',
        data: { job_id: 'j1', dispute_id: 'd1' },
      },
    ]);
    render(<Screen {...callbacks} />);
    expect(screen.UNSAFE_getByType(UserPlus)).toBeTruthy();
    expect(screen.UNSAFE_getByType(Ban)).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ShieldAlert)).toBeNull();
  },
);

describe('notification pull to refresh', () => {
  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'pulling reloads the list and spins until a fresh list arrives',
    async (Screen) => {
      const reload = jest.fn();
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [row], unreadCount: 1, loading: false, error: null, reload,
      });
      const view = render(<Screen {...callbacks} />);
      const scroll = screen.UNSAFE_getByType(ScrollView);

      act(() => {
        scroll.props.refreshControl.props.onRefresh();
      });
      expect(reload).toHaveBeenCalledTimes(1);
      expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(true);

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [{ ...row }], unreadCount: 1, loading: false, error: null, reload,
      });
      view.rerender(<Screen {...callbacks} />);
      await waitFor(() =>
        expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(false),
      );
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'the spinner stops after a failed pull and the error state shows',
    async (Screen) => {
      let fail: () => void = () => {};
      const reload = jest.fn(() => new Promise<void>((resolve) => { fail = resolve; }));
      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [], unreadCount: 0, loading: false, error: null, reload,
      });
      const view = render(<Screen {...callbacks} />);
      act(() => {
        screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
      });
      expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(true);

      (useNotifications as jest.Mock).mockReturnValue({
        notifications: [], unreadCount: 0, loading: false, error: 'Network request failed', reload,
      });
      await act(async () => {
        fail();
      });
      view.rerender(<Screen {...callbacks} />);
      expect(screen.UNSAFE_getByType(ScrollView).props.refreshControl.props.refreshing).toBe(false);
      expect(screen.getByText('Network request failed')).toBeTruthy();
    },
  );
});

describe('notification select and delete', () => {
  /** The confirm button of the delete dialog (the header's Delete button is also named Delete). */
  const confirmButton = () =>
    screen.getAllByRole('button', { name: 'Delete' }).find((el) => el.props.accessibilityLabel === 'Delete')!;

  const second = { ...row, id: 'n3', title: 'Second message', body: 'Again', read_at: '2026-10-01T00:00:00.000Z' };
  const third = { ...older, id: 'n4', title: 'Third message' };

  /** The row's card button: the press opens the notification, the long press starts select mode. */
  const rowCard = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}\\. `) });

  /** Long-presses a row, as the platform does on a device. */
  function longPress(title: string) {
    fireEvent(rowCard(title), 'longPress');
  }

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'a long press starts select mode with that row chosen, without opening it, and taps toggle the other rows',
    (Screen) => {
      setNotifications([row, second]);
      render(<Screen {...callbacks} />);
      longPress('New message');

      expect(screen.getByText('1 selected')).toBeTruthy();
      expect(callbacks.onOpenChat).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
      fireEvent.press(screen.getByRole('checkbox', { name: 'Second message' }));
      expect(screen.getByText('2 selected')).toBeTruthy();
      fireEvent.press(screen.getByRole('checkbox', { name: 'New message' }));
      expect(screen.getByText('1 selected')).toBeTruthy();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'a normal press still opens the notification and does not enter select mode',
    (Screen) => {
      setNotifications([row]);
      render(<Screen {...callbacks} />);
      fireEvent.press(rowCard('New message'));

      expect(callbacks.onOpenChat).toHaveBeenCalledWith('j1');
      expect(screen.queryByText(/selected$/)).toBeNull();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'in select mode the row has no trash button, and a long press there keeps the chosen rows',
    (Screen) => {
      setNotifications([row, second]);
      render(<Screen {...callbacks} />);
      expect(screen.getByLabelText('Delete notification: New message')).toBeTruthy();

      longPress('New message');
      fireEvent.press(screen.getByRole('checkbox', { name: 'Second message' }));
      // The long press stays wired while selecting, so the release of a hold that started select mode does not open the row.
      const cards = screen.UNSAFE_getAllByType(NotificationCard);
      expect(cards.map((c) => c.props.onLongPress)).toEqual([expect.any(Function), expect.any(Function)]);
      expect(screen.queryByLabelText('Delete notification: New message', { includeHiddenElements: true })).toBeNull();
      expect(screen.queryByLabelText('Delete notification: Second message', { includeHiddenElements: true })).toBeNull();

      fireEvent(screen.getByText('Second message', { includeHiddenElements: true }), 'longPress');
      expect(screen.getByText('2 selected')).toBeTruthy();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'Select all chooses every row, and Cancel or clearing the last tick leaves select mode',
    (Screen) => {
      setNotifications([row, second, older]);
      render(<Screen {...callbacks} />);
      longPress('New message');

      fireEvent.press(screen.getByRole('button', { name: 'Select all' }));
      expect(screen.getByText('3 selected')).toBeTruthy();

      fireEvent.press(screen.getByRole('button', { name: 'Cancel selection' }));
      expect(screen.queryByText(/selected$/)).toBeNull();
      expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy();

      longPress('New message');
      fireEvent.press(screen.getByRole('checkbox', { name: 'New message' }));
      expect(screen.queryByText(/selected$/)).toBeNull();
      expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'Delete asks first, then deletes each chosen notification and says how many went',
    async (Screen) => {
      setNotifications([row, second]);
      render(<Screen {...callbacks} />);
      longPress('New message');
      fireEvent.press(screen.getByRole('checkbox', { name: 'Second message' }));

      fireEvent.press(screen.getByRole('button', { name: 'Delete selected notifications' }));
      expect(screen.getByText('Delete 2 notifications?')).toBeTruthy();
      expect(api.deleteNotification).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(confirmButton());
      });

      expect(api.deleteNotification).toHaveBeenCalledWith('n1');
      expect(api.deleteNotification).toHaveBeenCalledWith('n3');
      expect(showToast).toHaveBeenCalledWith('Deleted 2 notifications', 'success');
      expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy();
    },
  );

  it.each([HONotificationsScreen, SPNotificationsScreen])(
    'when one delete fails the rest still go, and the toast says how many could not be removed',
    async (Screen) => {
      (api.deleteNotification as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Server error'))
        .mockResolvedValueOnce(undefined);
      setNotifications([row, second, third]);
      render(<Screen {...callbacks} />);
      longPress('New message');
      fireEvent.press(screen.getByRole('button', { name: 'Select all' }));

      fireEvent.press(screen.getByRole('button', { name: 'Delete selected notifications' }));
      expect(screen.getByText('Delete 3 notifications?')).toBeTruthy();
      await act(async () => {
        fireEvent.press(confirmButton());
      });

      expect(api.deleteNotification).toHaveBeenCalledTimes(3);
      expect(showToast).toHaveBeenCalledWith("Deleted 2 of 3 — 1 couldn't be removed", 'error');
      expect(screen.queryByText(/selected$/)).toBeNull();
    },
  );
});
