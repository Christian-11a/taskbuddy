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
beforeEach(() => {
  jest.clearAllMocks();
  (useNotifications as jest.Mock).mockReturnValue({
    notifications: [row],
    unreadCount: 1,
    loading: false,
    error: null,
    reload: jest.fn(),
  });
  (api.markNotificationRead as jest.Mock).mockResolvedValue({ success: true });
  (api.markAllNotificationsRead as jest.Mock).mockResolvedValue({
    success: true,
  });
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
