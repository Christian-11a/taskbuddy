import { BadRequestException } from '@nestjs/common';
import { AdminActionsService } from './admin-actions.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as admin.service.spec.ts. */
function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table]?.shift() ?? {
      data: null,
      error: { message: `no mock result for table '${table}'` },
    };
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    for (const method of [
      'select',
      'insert',
      'eq',
      'gte',
      'lte',
      'order',
      'range',
    ]) {
      builder[method] = chain(method);
    }
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
}

const admin = { id: 'a1', role: 'admin' } as Profile;

describe('AdminActionsService', () => {
  describe('record', () => {
    it('inserts an audit row for the actor, action, and target', async () => {
      const { supabase, calls } = createSupabaseMock({
        admin_actions: [{ data: null, error: null }],
      });
      const service = new AdminActionsService(supabase);

      await service.record(admin, 'user.suspend', 'profiles', 'u1', {
        reason: 'Spam',
      });

      const insertCall = calls.find(
        (c) => c.table === 'admin_actions' && c.method === 'insert',
      );
      expect(insertCall?.args[0]).toEqual({
        actor_id: 'a1',
        action: 'user.suspend',
        target_type: 'profiles',
        target_id: 'u1',
        metadata: { reason: 'Spam' },
      });
    });

    it('defaults metadata to an empty object', async () => {
      const { supabase, calls } = createSupabaseMock({
        admin_actions: [{ data: null, error: null }],
      });
      const service = new AdminActionsService(supabase);

      await service.record(admin, 'user.reinstate', 'profiles', 'u1');

      const insertCall = calls.find(
        (c) => c.table === 'admin_actions' && c.method === 'insert',
      );
      expect((insertCall?.args[0] as { metadata: unknown }).metadata).toEqual(
        {},
      );
    });

    it('surfaces a write failure rather than swallowing it', async () => {
      const { supabase } = createSupabaseMock({
        admin_actions: [{ data: null, error: { message: 'boom' } }],
      });
      const service = new AdminActionsService(supabase);

      await expect(
        service.record(admin, 'user.suspend', 'profiles', 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('filters by action, actor, and date range, returning total', async () => {
      const rows = [{ id: 'aa1', action: 'user.suspend' }];
      const { supabase, calls } = createSupabaseMock({
        admin_actions: [{ data: rows, error: null, count: 1 }],
      });
      const service = new AdminActionsService(supabase);

      const result = await service.list({
        action: 'user.suspend',
        actor_id: 'a1',
        from: '2026-07-01T00:00:00Z',
        to: '2026-07-31T00:00:00Z',
      });

      expect(result).toEqual({ actions: rows, total: 1 });
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' &&
            c.args[0] === 'action' &&
            c.args[1] === 'user.suspend',
        ),
      ).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' && c.args[0] === 'actor_id' && c.args[1] === 'a1',
        ),
      ).toBe(true);
      expect(
        calls.some((c) => c.method === 'gte' && c.args[0] === 'created_at'),
      ).toBe(true);
      expect(
        calls.some((c) => c.method === 'lte' && c.args[0] === 'created_at'),
      ).toBe(true);
    });

    it('throws BadRequestException on query error', async () => {
      const { supabase } = createSupabaseMock({
        admin_actions: [{ data: null, error: { message: 'boom' } }],
      });
      const service = new AdminActionsService(supabase);

      await expect(service.list({})).rejects.toThrow(BadRequestException);
    });
  });
});
