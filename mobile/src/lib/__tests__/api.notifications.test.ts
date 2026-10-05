import EventSource from 'react-native-sse';
import { api, configureApiAuth, type NotificationSnapshot } from '../api';
import { subscribeNotificationChanges } from '../notificationEvents';
jest.mock('react-native-sse', () => jest.fn());
const snapshot: NotificationSnapshot = { notifications: [], unreadCount: 4 };
const response = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as Response;
let handlers: Record<string, (event: { data?: string }) => void>;
let close: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  handlers = {};
  close = jest.fn();
  (EventSource as unknown as jest.Mock).mockClear().mockImplementation(() => ({
    close,
    addEventListener: (
      name: string,
      listener: (event: { data?: string }) => void,
    ) => {
      handlers[name] = listener;
    },
  }));
  configureApiAuth(() => 'token-a', jest.fn());
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
const flush = async () => {
  await jest.advanceTimersByTimeAsync(0);
};
it('reconciles before opening an authenticated stream, then closes and ignores late events', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, snapshot));
  const update = jest.fn();
  const stop = api.streamNotifications(update, jest.fn());
  await flush();
  expect(update).toHaveBeenCalledWith(snapshot);
  expect(EventSource).toHaveBeenCalledWith(
    expect.stringContaining('/notifications/stream'),
    { headers: { Authorization: 'Bearer token-a' } },
  );
  handlers.message({
    data: JSON.stringify({ notifications: [], unreadCount: 9 }),
  });
  expect(update).toHaveBeenCalledTimes(2);
  stop();
  handlers.message({ data: JSON.stringify(snapshot) });
  expect(close).toHaveBeenCalled();
  expect(update).toHaveBeenCalledTimes(2);
});
it('reconnects after a failure, reconciling and refreshing expired auth first', async () => {
  let token = 'expired';
  const refresh = jest.fn(async () => {
    token = 'fresh';
    return token;
  });
  configureApiAuth(() => token, refresh);
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(response(401, { message: 'Expired' }))
    .mockResolvedValue(response(200, snapshot));
  const error = jest.fn();
  const stop = api.streamNotifications(jest.fn(), error);
  await flush();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(EventSource).toHaveBeenCalledWith(expect.any(String), {
    headers: { Authorization: 'Bearer fresh' },
  });
  handlers.error({});
  expect(error).toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(5000);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(EventSource).toHaveBeenCalledTimes(2);
  stop();
  await jest.advanceTimersByTimeAsync(10000);
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('does not open a stream when disposed during its initial fetch', async () => {
  let finish: (response: Response) => void = () => {};
  jest.spyOn(globalThis, 'fetch').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const update = jest.fn();
  const stop = api.streamNotifications(update, jest.fn());
  stop();
  finish(response(200, snapshot));
  await flush();
  expect(EventSource).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
it('does not endlessly retry a rejected session', async () => {
  configureApiAuth(() => 'rejected', jest.fn().mockResolvedValue(null));
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response(401, { message: 'Sign in again' }));
  const error = jest.fn();
  const stop = api.streamNotifications(jest.fn(), error);
  await flush();
  await jest.advanceTimersByTimeAsync(10000);
  expect(error).toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(EventSource).not.toHaveBeenCalled();
  stop();
});
it('publishes successful mutations but leaves shared state intact on server refusal', async () => {
  const listener = jest.fn();
  const unsubscribe = subscribeNotificationChanges(listener);
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response(200, { success: true }));
  await api.markNotificationRead('n1');
  expect(listener).toHaveBeenCalledWith({ kind: 'read', id: 'n1' });
  listener.mockClear();
  fetch.mockResolvedValue(response(500, { message: 'Write failed' }));
  await expect(api.clearNotifications()).rejects.toThrow('Write failed');
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});
it('does not publish an old-account mutation after the account token changes', async () => {
  let token = 'account-a';
  configureApiAuth(() => token, jest.fn());
  let finish: (response: Response) => void = () => {};
  jest.spyOn(globalThis, 'fetch').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const listener = jest.fn();
  const unsubscribe = subscribeNotificationChanges(listener);
  const pending = api.clearNotifications();
  token = 'account-b';
  finish(response(200, { success: true }));
  await pending;
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});
