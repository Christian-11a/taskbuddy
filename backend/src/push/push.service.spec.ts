import { PushService, type PushMessage } from './push.service';
import type { SupabaseService } from '../supabase/supabase.service';

type QueryResult = { data: unknown; error: { message: string } | null };

/** Same chainable stand-in as wallet.service.spec.ts — results consumed per `.from()`. */
function createSupabaseMock(results: QueryResult[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const from = jest.fn(() => {
    const result = results.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    for (const method of ['select', 'upsert', 'delete', 'eq', 'in']) {
      builder[method] = chain(method);
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
}

function message(to: string): PushMessage {
  return { to, title: 'Job update', body: 'Your job was accepted' };
}

describe('PushService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('send', () => {
    it('deletes only the tokens Expo reports as unregistered', async () => {
      // Tickets come back positionally aligned with the batch. Getting this
      // wrong deletes a live device and leaves a dead one in place.
      const { supabase, calls } = createSupabaseMock([
        { data: null, error: null },
      ]);
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { status: 'ok' },
              { status: 'error', details: { error: 'DeviceNotRegistered' } },
              { status: 'ok' },
            ],
          }),
      } as unknown as Response);
      const service = new PushService(supabase);

      await service.send([
        message('ExponentPushToken[alive]'),
        message('ExponentPushToken[dead]'),
        message('ExponentPushToken[also-alive]'),
      ]);

      const deleted = calls.find((c) => c.method === 'in');
      expect(deleted?.args[1]).toEqual(['ExponentPushToken[dead]']);
    });

    it('leaves tokens alone when the error is not DeviceNotRegistered', async () => {
      // A rate-limit or message-too-big error says nothing about the device.
      const { supabase, calls } = createSupabaseMock([]);
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { status: 'error', details: { error: 'MessageRateExceeded' } },
            ],
          }),
      } as unknown as Response);
      const service = new PushService(supabase);

      await service.send([message('ExponentPushToken[busy]')]);

      expect(calls.some((c) => c.method === 'delete')).toBe(false);
    });

    it('splits large sends into Expo-sized batches', async () => {
      const { supabase } = createSupabaseMock([]);
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response);
      const service = new PushService(supabase);

      await service.send(
        Array.from({ length: 250 }, (_, i) =>
          message(`ExponentPushToken[${i}]`),
        ),
      );

      expect(fetchMock).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    });

    it('swallows a transport failure rather than breaking the scheduler tick', async () => {
      // The caller is a cron tick with no user waiting; a push outage must not
      // stop the next batch from being claimed.
      const { supabase } = createSupabaseMock([]);
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
      const service = new PushService(supabase);

      await expect(
        service.send([message('ExponentPushToken[x]')]),
      ).resolves.toBeUndefined();
    });
  });

  describe('unregisterDevice', () => {
    it('scopes the delete to the caller so one user cannot mute another', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: null, error: null },
      ]);
      const service = new PushService(supabase);

      await service.unregisterDevice(
        { id: 'u1' } as never,
        'ExponentPushToken[victim]',
      );

      const eqCalls = calls.filter((c) => c.method === 'eq');
      expect(eqCalls.map((c) => c.args)).toEqual([
        ['token', 'ExponentPushToken[victim]'],
        ['profile_id', 'u1'],
      ]);
    });
  });
});
