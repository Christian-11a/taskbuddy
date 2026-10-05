import React from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import {
  NotificationsProvider,
  useNotifications,
} from '../NotificationsContext';
import { api, type NotificationSnapshot } from '../../lib/api';
import { notifyNotificationChange } from '../../lib/notificationEvents';
import { useAuth } from '../AuthContext';
jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/api', () => ({
  api: { notificationSnapshot: jest.fn(), streamNotifications: jest.fn() },
}));
const row = {
  id: 'n1',
  type: 'message',
  title: 'Hello',
  body: '',
  created_at: '2026-10-04',
  read_at: null,
  data: null,
};
const snapshot = { notifications: [row], unreadCount: 73 };
let streams: {
  update: (data: NotificationSnapshot) => void;
  error: (error: Error) => void;
  close: jest.Mock;
}[];
let changeState: (next: AppStateStatus) => void;
const remove = jest.fn();
function Probe() {
  const state = useNotifications();
  return (
    <>
      <Text testID="count">{state.unreadCount}</Text>
      <Text testID="rows">
        {state.notifications.map((r) => r.id).join(',')}
      </Text>
      <Text testID="error">{state.error}</Text>
      <Text onPress={state.reload}>Refresh</Text>
    </>
  );
}
function App() {
  return (
    <NotificationsProvider>
      <Probe />
      <Probe />
    </NotificationsProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  streams = [];
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    writable: true,
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, cb) => {
    changeState = cb;
    return { remove };
  });
  (useAuth as jest.Mock).mockReturnValue({
    profile: { id: 'a1' },
    isAuthenticated: true,
  });
  (api.notificationSnapshot as jest.Mock).mockImplementation(
    () => new Promise(() => {}),
  );
  (api.streamNotifications as jest.Mock).mockImplementation((update, error) => {
    const close = jest.fn();
    streams.push({ update, error, close });
    return close;
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});
it('shares one stream across consumers and preserves an unread count above the list limit', () => {
  render(<App />);
  expect(streams).toHaveLength(1);
  act(() => streams[0].update(snapshot));
  expect(screen.getAllByTestId('count')[0].props.children).toBe(73);
});
it('read, delete and clear update every consumer and new arrivals remain visible', () => {
  render(<App />);
  act(() => streams[0].update(snapshot));
  act(() => notifyNotificationChange({ kind: 'read', id: 'n1' }));
  expect(screen.getAllByTestId('count')[0].props.children).toBe(72);
  act(() => notifyNotificationChange({ kind: 'read', id: 'n1' }));
  expect(screen.getAllByTestId('count')[0].props.children).toBe(72);
  act(() => notifyNotificationChange({ kind: 'delete', id: 'n1' }));
  expect(screen.getAllByTestId('rows')[0].props.children).toBe('');
  act(() => notifyNotificationChange({ kind: 'clear' }));
  act(() =>
    streams[streams.length - 1].update({
      notifications: [{ ...row, id: 'new' }],
      unreadCount: 1,
    }),
  );
  expect(screen.getAllByTestId('rows')[0].props.children).toBe('new');
});
it('closes in background, reconnects once and ignores the old connection', () => {
  render(<App />);
  act(() => {
    AppState.currentState = 'background';
    changeState('background');
  });
  expect(streams[0].close).toHaveBeenCalledTimes(1);
  act(() => {
    AppState.currentState = 'active';
    changeState('active');
  });
  act(() => streams[1].update({ notifications: [], unreadCount: 2 }));
  act(() => streams[0].update(snapshot));
  expect(screen.getAllByTestId('count')[0].props.children).toBe(2);
});
it('clears on account switch and logout, ignoring late old-account data', () => {
  const view = render(<App />);
  act(() => streams[0].update(snapshot));
  (useAuth as jest.Mock).mockReturnValue({
    profile: { id: 'a2' },
    isAuthenticated: true,
  });
  view.rerender(<App />);
  expect(streams[0].close).toHaveBeenCalled();
  act(() => streams[0].update(snapshot));
  expect(screen.getAllByTestId('count')[0].props.children).toBe(0);
  (useAuth as jest.Mock).mockReturnValue({
    profile: null,
    isAuthenticated: false,
  });
  view.rerender(<App />);
  expect(streams[1].close).toHaveBeenCalled();
  expect(streams).toHaveLength(2);
});
it('a late REST refresh cannot overwrite a newer streamed snapshot', async () => {
  let finish: (value: NotificationSnapshot) => void = () => {};
  (api.notificationSnapshot as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<App />);
  fireEvent.press(screen.getAllByText('Refresh')[0]);
  act(() => streams[0].update(snapshot));
  await act(async () => {
    finish({ notifications: [], unreadCount: 0 });
  });
  expect(screen.getAllByTestId('count')[0].props.children).toBe(73);
});
it('surfaces connection errors and clears them after reconciliation', () => {
  render(<App />);
  act(() => streams[0].error(new Error('Offline')));
  expect(screen.getAllByTestId('error')[0].props.children).toBe('Offline');
  act(() => streams[0].update(snapshot));
  expect(screen.getAllByTestId('error')[0].props.children).toBeNull();
});
it('cleans up listeners and connections on unmount', () => {
  const view = render(<App />);
  view.unmount();
  expect(streams[0].close).toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
});

it('ignores a snapshot started before a successful mutation', () => {
  render(<App />);
  act(() => streams[0].update(snapshot));
  act(() => notifyNotificationChange({ kind: 'read', id: 'n1' }));
  act(() => streams[0].update(snapshot));
  expect(screen.getAllByTestId('count')[0].props.children).toBe(72);
  expect(streams[0].close).toHaveBeenCalled();
  act(() => streams[1].update({ notifications: [{ ...row, read_at: '2026-10-04' }], unreadCount: 72 }));
  expect(screen.getAllByTestId('count')[0].props.children).toBe(72);
});
it('refreshes provider services once per new service notice and on foreground return', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'a1' }, isAuthenticated: true, role: 'provider', refreshProfile: refresh });
  const handlers: ((next: AppStateStatus) => void)[] = [];
  (AppState.addEventListener as jest.Mock).mockImplementation((_name, handler) => { handlers.push(handler); return { remove }; });
  render(<App />);
  const decision = { ...row, data: { request_id: 'r1' } };
  await act(async () => streams[0].update({ notifications: [decision], unreadCount: 1 }));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => streams[0].update({ notifications: [{ ...decision, read_at: '2026-10-04' }], unreadCount: 0 }));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => { AppState.currentState = 'background'; handlers.forEach((handler) => handler('background')); });
  await act(async () => { AppState.currentState = 'active'; handlers.forEach((handler) => handler('active')); });
  expect(refresh).toHaveBeenCalledTimes(2);
});
