import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AdminPlatformService } from './admin-platform.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { AdminActionsService } from './admin-actions.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as admin.service.spec.ts — results consumed per `.from()`. */
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
      'update',
      'eq',
      'neq',
      'is',
      'not',
      'order',
    ]) {
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

  const authAdmin = {
    createUser: jest.fn((attrs: Record<string, unknown>) => {
      void attrs;
      return Promise.resolve({ data: { user: { id: 'new-1' } }, error: null });
    }),
  };
  const resetPasswordForEmail = jest.fn(() => Promise.resolve({ error: null }));

  return {
    supabase: {
      admin: { from, auth: { admin: authAdmin } },
      anon: { auth: { resetPasswordForEmail } },
    } as unknown as SupabaseService,
    calls,
    authAdmin,
    resetPasswordForEmail,
  };
}

function createAdminActionsMock() {
  const record = jest.fn().mockResolvedValue(undefined);
  return { mock: { record } as unknown as AdminActionsService, record };
}

const admin = { id: 'a1', role: 'admin' } as Profile;

describe('AdminPlatformService', () => {
  describe('categories', () => {
    it('reports a duplicate name as a conflict rather than a raw constraint error', async () => {
      const { supabase } = createSupabaseMock({
        service_categories: [
          { data: null, error: { message: 'duplicate key', code: '23505' } },
        ],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.createCategory(admin, { name: 'Plumbing' }),
      ).rejects.toThrow(ConflictException);
    });

    it('deactivates rather than deletes', async () => {
      // Jobs, provider profiles and the ML feature set all reference a category
      // by id. Deleting one either cascades real history away or fails.
      const { supabase, calls } = createSupabaseMock({
        service_categories: [
          { data: { id: 3, is_active: false }, error: null },
        ],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.updateCategory(admin, 3, { is_active: false });

      expect(calls.some((c) => c.method === 'delete')).toBe(false);
      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({ is_active: false });
    });

    it('refuses an empty patch instead of issuing a no-op UPDATE', async () => {
      const { supabase, calls } = createSupabaseMock({});
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(service.updateCategory(admin, 3, {})).rejects.toThrow(
        BadRequestException,
      );
      expect(calls).toEqual([]);
    });
  });

  describe('createAdmin', () => {
    it('creates the account without a password and mails a setup link', async () => {
      // An endpoint that took a password would mean one admin knowing
      // another's, which makes the audit trail a guess about who was typing.
      const { supabase, authAdmin, resetPasswordForEmail } = createSupabaseMock(
        {
          admin_user_overview: [{ data: null, error: null }],
          profiles: [{ data: { id: 'new-1', role: 'admin' }, error: null }],
        },
      );
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.createAdmin(admin, {
        email: 'Ops@TaskBuddy.com',
        full_name: 'Ops Two',
      });

      expect(authAdmin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ops@taskbuddy.com' }),
      );
      expect(authAdmin.createUser.mock.calls[0][0].password).toBeUndefined();
      expect(resetPasswordForEmail).toHaveBeenCalledWith('ops@taskbuddy.com');
    });

    it('promotes an existing account rather than trying to duplicate it', async () => {
      // Supabase keys accounts by email; a second signup on the same address
      // cannot happen anyway.
      const { supabase, authAdmin } = createSupabaseMock({
        admin_user_overview: [
          { data: { id: 'u9', role: 'provider' }, error: null },
        ],
        profiles: [{ data: { id: 'u9', role: 'admin' }, error: null }],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.createAdmin(admin, {
          email: 'sp@taskbuddy.com',
          full_name: 'SP',
        }),
      ).resolves.toMatchObject({ role: 'admin' });
      expect(authAdmin.createUser).not.toHaveBeenCalled();
    });

    it('refuses when the account is already an admin', async () => {
      const { supabase } = createSupabaseMock({
        admin_user_overview: [
          { data: { id: 'a2', role: 'admin' }, error: null },
        ],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.createAdmin(admin, {
          email: 'a2@taskbuddy.com',
          full_name: 'A2',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('revokeAdmin', () => {
    it('refuses to demote the caller', async () => {
      const { supabase } = createSupabaseMock({});
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(service.revokeAdmin(admin, 'a1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses to demote the last admin', async () => {
      // A console nobody can get into is not recoverable from inside itself.
      const { supabase, calls } = createSupabaseMock({
        profiles: [
          { data: { id: 'a2', role: 'admin' }, error: null }, // findProfile
          { data: null, error: null, count: 1 }, // admin count
        ],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(service.revokeAdmin(admin, 'a2')).rejects.toThrow(
        ForbiddenException,
      );
      expect(calls.some((c) => c.method === 'update')).toBe(false);
    });

    it('demotes to client when another admin remains', async () => {
      const { supabase, calls } = createSupabaseMock({
        profiles: [
          { data: { id: 'a2', role: 'admin' }, error: null },
          { data: null, error: null, count: 2 },
          { data: { id: 'a2', role: 'client' }, error: null },
        ],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.revokeAdmin(admin, 'a2');

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toEqual({ role: 'client' });
    });
  });

  describe('broadcast', () => {
    it('writes one row per recipient and reports what landed', async () => {
      const recipients = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
      const { supabase, calls } = createSupabaseMock({
        profiles: [{ data: recipients, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.broadcast(admin, {
          title: 'Scheduled maintenance',
          body: 'The app will be unavailable on Sunday.',
          audience: 'all',
        }),
      ).resolves.toEqual({ sent: 3, failed: 0, audience: 'all' });

      const insert = calls.find((c) => c.method === 'insert');
      const rows = insert?.args[0] as Record<string, unknown>[];
      expect(rows).toHaveLength(3);
      // Not 'job_update' — nothing about a broadcast is about a job.
      expect(rows[0]).toMatchObject({
        recipient_id: 'u1',
        type: 'announcement',
      });
    });

    it('excludes admins, suspended and deleted accounts', async () => {
      const { supabase, calls } = createSupabaseMock({
        profiles: [{ data: [], error: null }],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.broadcast(admin, {
        title: 'x',
        body: 'y',
        audience: 'providers',
      });

      expect(
        calls.some((c) => c.method === 'neq' && c.args[0] === 'role'),
      ).toBe(true);
      const isFilters = calls
        .filter((c) => c.method === 'is')
        .map((c) => c.args[0]);
      expect(isFilters).toEqual(
        expect.arrayContaining(['deleted_at', 'deactivated_at']),
      );
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' &&
            c.args[0] === 'role' &&
            c.args[1] === 'provider',
        ),
      ).toBe(true);
    });

    it('keeps going after a failed chunk and reports the shortfall', async () => {
      // A broadcast that reached most of the platform and says so beats one
      // that stops at the first problem and reports nothing.
      const { supabase } = createSupabaseMock({
        profiles: [{ data: [{ id: 'u1' }], error: null }],
        notifications: [{ data: null, error: { message: 'boom' } }],
      });
      const service = new AdminPlatformService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.broadcast(admin, { title: 'x', body: 'y', audience: 'all' }),
      ).resolves.toEqual({ sent: 0, failed: 1, audience: 'all' });
    });
  });

  describe('setCommission', () => {
    it('records the change in the audit trail with both rates', async () => {
      const { supabase } = createSupabaseMock({
        platform_settings: [
          { data: { commission_rate: 0 }, error: null }, // previous
          { data: { commission_rate: 0.12 }, error: null }, // updated
        ],
      });
      const actions = createAdminActionsMock();
      const service = new AdminPlatformService(supabase, actions.mock);

      await service.setCommission(admin, { commission_rate: 0.12 });

      expect(actions.record).toHaveBeenCalledWith(
        admin,
        'platform.commission_change',
        'platform_settings',
        'a1',
        { from: 0, to: 0.12 },
      );
    });
  });
});
