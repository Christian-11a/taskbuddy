import { SettingsService } from './settings.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

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
    for (const method of ['select', 'upsert', 'eq', 'in']) {
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

const user = { id: 'u1', role: 'client' } as Profile;

describe('SettingsService', () => {
  describe('get', () => {
    it('creates the row on first access using the DDL defaults', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: null, error: null }, // no row yet
        { data: { profile_id: 'u1', push_enabled: true }, error: null },
      ]);
      const service = new SettingsService(supabase);

      await service.get(user);

      // Only the key is written — the defaults must come from the table
      // definition, not be duplicated here where they can drift.
      const upsert = calls.find((c) => c.method === 'upsert');
      expect(upsert?.args[0]).toEqual({ profile_id: 'u1' });
    });
  });

  describe('pushEnabledAmong', () => {
    it('treats a user with no settings row as opted in', async () => {
      // Most users never open Settings. Requiring a row to receive push would
      // silently mute almost everyone.
      const { supabase } = createSupabaseMock([{ data: [], error: null }]);
      const service = new SettingsService(supabase);

      const result = await service.pushEnabledAmong(['u1', 'u2']);

      expect([...result].sort()).toEqual(['u1', 'u2']);
    });

    it('excludes users who switched push off', async () => {
      const { supabase } = createSupabaseMock([
        { data: [{ profile_id: 'u2', push_enabled: false }], error: null },
      ]);
      const service = new SettingsService(supabase);

      const result = await service.pushEnabledAmong(['u1', 'u2', 'u3']);

      expect([...result].sort()).toEqual(['u1', 'u3']);
    });

    it('does not query at all for an empty recipient list', async () => {
      const { supabase, calls } = createSupabaseMock([]);
      const service = new SettingsService(supabase);

      expect((await service.pushEnabledAmong([])).size).toBe(0);
      expect(calls).toHaveLength(0);
    });
  });
});
