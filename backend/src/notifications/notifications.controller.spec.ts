import { NotificationsController } from './notifications.controller';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

function createSupabaseMock() {
  const eq = jest.fn();
  const builder = {
    delete: jest.fn(() => builder),
    eq,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve),
  };
  eq.mockImplementation(() => builder);
  const from = jest.fn(() => builder);
  const supabase = { admin: { from } } as unknown as SupabaseService;
  return { supabase, from, builder, eq };
}

const user = { id: 'user-1' } as Profile;

describe('NotificationsController delete', () => {
  it('deletes one notification scoped to the caller', async () => {
    const { supabase, from, builder, eq } = createSupabaseMock();
    const controller = new NotificationsController(supabase);

    await controller.remove(user, 'n-1');

    expect(from).toHaveBeenCalledWith('notifications');
    expect(builder.delete).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'n-1');
    // Without this a caller could delete someone else's notification by id.
    expect(eq).toHaveBeenCalledWith('recipient_id', 'user-1');
  });

  it('clears only the caller’s notifications', async () => {
    const { supabase, eq } = createSupabaseMock();
    const controller = new NotificationsController(supabase);

    await controller.removeAll(user);

    expect(eq).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('recipient_id', 'user-1');
  });
});

function queryMock(result: {
  data?: unknown;
  count?: number;
  error: { message: string } | null;
}) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    'select',
    'update',
    'delete',
    'eq',
    'is',
    'order',
    'limit',
  ])
    builder[method] = jest.fn(() => builder);
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return {
    controller: new NotificationsController({
      admin: {
        from: jest.fn(() => builder),
        rpc: jest.fn().mockResolvedValue({
          data: {
            notifications: result.data ?? [],
            unreadCount: result.count ?? 0,
          },
          error: result.error,
        }),
      },
    } as unknown as SupabaseService),
    builder,
  };
}
describe('Notification persistence failures', () => {
  it.each([
    'list',
    'unreadCount',
    'markAllRead',
    'removeAll',
    'snapshot',
  ] as const)('surfaces %s failures', async (method) => {
    const { controller } = queryMock({
      error: { message: 'database unavailable' },
    });
    await expect(controller[method](user)).rejects.toThrow(
      'database unavailable',
    );
  });
  it.each(['markRead', 'remove'] as const)(
    'surfaces %s failures',
    async (method) => {
      const { controller } = queryMock({ error: { message: 'write failed' } });
      await expect(controller[method](user, 'n1')).rejects.toThrow(
        'write failed',
      );
    },
  );
  it('keeps unread counts above the list limit', async () => {
    const { controller } = queryMock({
      data: [{ id: 'n1' }],
      count: 100,
      error: null,
    });
    await expect(controller.snapshot(user)).resolves.toEqual({
      notifications: [{ id: 'n1' }],
      unreadCount: 100,
    });
  });
});

describe('Notification stream', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('emits snapshots, pings unchanged rows, never overlaps queries and stops after unsubscribe', async () => {
    const { controller } = queryMock({ error: null });
    let finish: (snapshot: {
      notifications: never[];
      unreadCount: number;
    }) => void = () => {};
    const snapshot = jest.spyOn(controller, 'snapshot').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const events: unknown[] = [];
    const sub = controller
      .stream(user)
      .subscribe((event) => events.push(event));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(10000);
    expect(snapshot).toHaveBeenCalledTimes(1);
    finish({ notifications: [], unreadCount: 0 });
    await jest.advanceTimersByTimeAsync(0);
    expect(events).toEqual([
      { type: 'message', data: { notifications: [], unreadCount: 0 } },
    ]);
    await jest.advanceTimersByTimeAsync(5000);
    finish({ notifications: [], unreadCount: 0 });
    await jest.advanceTimersByTimeAsync(0);
    expect(events[1]).toEqual({ type: 'ping', data: {} });
    sub.unsubscribe();
    await jest.advanceTimersByTimeAsync(10000);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });
  it('surfaces a database failure instead of emitting an empty snapshot', async () => {
    const { controller } = queryMock({ error: null });
    jest
      .spyOn(controller, 'snapshot')
      .mockRejectedValue(new Error('Read failed'));
    const error = jest.fn();
    controller.stream(user).subscribe({ error });
    await jest.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Read failed' }),
    );
  });
});
