import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import type { SupabaseService } from '../supabase/supabase.service';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

/**
 * Chainable stand-in for the supabase-js query builder: every filter method
 * returns itself, and awaiting it resolves with the queued result. Results
 * are consumed per `.from()` call in order.
 */
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
      'update',
      'insert',
      'eq',
      'or',
      'is',
      'not',
      'in',
      'order',
      'range',
      'limit',
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
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
}

describe('AdminService', () => {
  describe('listUsers', () => {
    it('returns rows and total from the admin view', async () => {
      const rows = [{ id: 'u1', email: 'a@b.c', full_name: 'Alice' }];
      const { supabase, calls } = createSupabaseMock({
        admin_user_overview: [{ data: rows, error: null, count: 1 }],
      });
      const service = new AdminService(supabase);

      const result = await service.listUsers({ search: 'ali' });

      expect(result).toEqual({ users: rows, total: 1 });
      const orCall = calls.find((c) => c.method === 'or');
      expect(orCall?.args[0]).toBe('full_name.ilike.%ali%,email.ilike.%ali%');
    });

    it('filters suspended users via deactivated_at', async () => {
      const { supabase, calls } = createSupabaseMock({
        admin_user_overview: [{ data: [], error: null, count: 0 }],
      });
      const service = new AdminService(supabase);

      await service.listUsers({ status: 'suspended' });

      expect(
        calls.some(
          (c) =>
            c.method === 'not' &&
            c.args[0] === 'deactivated_at' &&
            c.args[1] === 'is',
        ),
      ).toBe(true);
    });

    it('throws BadRequestException on query error', async () => {
      const { supabase } = createSupabaseMock({
        admin_user_overview: [
          { data: null, error: { message: 'boom' }, count: null },
        ],
      });
      const service = new AdminService(supabase);

      await expect(service.listUsers({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('suspend', () => {
    it('sets deactivated_at on an active client', async () => {
      const updated = { id: 'u1', deactivated_at: '2026-07-17T00:00:00Z' };
      const { supabase, calls } = createSupabaseMock({
        profiles: [
          {
            data: { id: 'u1', role: 'client', deactivated_at: null },
            error: null,
          },
          { data: updated, error: null },
        ],
      });
      const service = new AdminService(supabase);

      const result = await service.suspend('u1');

      expect(result).toEqual(updated);
      const updateCall = calls.find((c) => c.method === 'update');
      expect(
        (updateCall?.args[0] as { deactivated_at: string }).deactivated_at,
      ).toBeTruthy();
    });

    it('refuses to suspend an admin', async () => {
      const { supabase } = createSupabaseMock({
        profiles: [
          {
            data: { id: 'u1', role: 'admin', deactivated_at: null },
            error: null,
          },
        ],
      });
      const service = new AdminService(supabase);

      await expect(service.suspend('u1')).rejects.toThrow(ForbiddenException);
    });

    it('refuses to suspend an already-suspended account', async () => {
      const { supabase } = createSupabaseMock({
        profiles: [
          {
            data: {
              id: 'u1',
              role: 'client',
              deactivated_at: '2026-07-01T00:00:00Z',
            },
            error: null,
          },
        ],
      });
      const service = new AdminService(supabase);

      await expect(service.suspend('u1')).rejects.toThrow(BadRequestException);
    });

    it('404s on unknown user', async () => {
      const { supabase } = createSupabaseMock({
        profiles: [{ data: null, error: null }],
      });
      const service = new AdminService(supabase);

      await expect(service.suspend('u404')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reinstate', () => {
    it('clears deactivated_at on a suspended account', async () => {
      const updated = { id: 'u1', deactivated_at: null };
      const { supabase, calls } = createSupabaseMock({
        profiles: [
          {
            data: {
              id: 'u1',
              role: 'client',
              deactivated_at: '2026-07-01T00:00:00Z',
            },
            error: null,
          },
          { data: updated, error: null },
        ],
      });
      const service = new AdminService(supabase);

      const result = await service.reinstate('u1');

      expect(result).toEqual(updated);
      const updateCall = calls.find((c) => c.method === 'update');
      expect(updateCall?.args[0]).toEqual({ deactivated_at: null });
    });

    it('rejects reinstating an account that is not suspended', async () => {
      const { supabase } = createSupabaseMock({
        profiles: [
          {
            data: { id: 'u1', role: 'client', deactivated_at: null },
            error: null,
          },
        ],
      });
      const service = new AdminService(supabase);

      await expect(service.reinstate('u1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listBookings', () => {
    it('filters by status and returns total', async () => {
      const rows = [{ id: 'j1', status: 'completed' }];
      const { supabase, calls } = createSupabaseMock({
        jobs: [{ data: rows, error: null, count: 1 }],
      });
      const service = new AdminService(supabase);

      const result = await service.listBookings({ status: 'completed' });

      expect(result).toEqual({ bookings: rows, total: 1 });
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' &&
            c.args[0] === 'status' &&
            c.args[1] === 'completed',
        ),
      ).toBe(true);
    });
  });

  describe('analyticsSummary', () => {
    it('aggregates totals, statuses, categories, and trend', async () => {
      const jobs = [
        {
          id: 'j1',
          status: 'completed',
          posted_at: '2026-07-10T08:00:00Z',
          category_id: 1,
          service_categories: { name: 'Plumbing' },
        },
        {
          id: 'j2',
          status: 'open',
          posted_at: '2026-07-10T09:00:00Z',
          category_id: 1,
          service_categories: { name: 'Plumbing' },
        },
        {
          id: 'j3',
          status: 'open',
          posted_at: '2026-07-11T10:00:00Z',
          category_id: 2,
          service_categories: { name: 'Cleaning' },
        },
      ];
      const users = [
        { id: 'u1', role: 'client', created_at: '', deactivated_at: null },
        { id: 'u2', role: 'provider', created_at: '', deactivated_at: null },
        {
          id: 'u3',
          role: 'client',
          created_at: '',
          deactivated_at: '2026-07-01T00:00:00Z',
        },
      ];
      const providers = [{ profile_id: 'u2', cached_completed_jobs: 5 }];
      const ratedProviders = [
        { cached_avg_rating: 4 },
        { cached_avg_rating: 5 },
      ];
      const currentMonth = new Date().toISOString().slice(0, 7);
      const revenueTxns = [
        { amount: 100, created_at: '2026-06-15T00:00:00Z' },
        { amount: 50.5, created_at: `${currentMonth}-01T00:00:00Z` },
      ];
      const { supabase } = createSupabaseMock({
        jobs: [{ data: jobs, error: null }],
        profiles: [{ data: users, error: null }],
        provider_profiles: [
          { data: providers, error: null },
          { data: ratedProviders, error: null },
        ],
        wallet_transactions: [{ data: revenueTxns, error: null }],
        provider_verifications: [{ data: null, error: null, count: 2 }],
      });
      const service = new AdminService(supabase);

      const result = await service.analyticsSummary();

      expect(result.totals).toEqual({
        users: 3,
        clients: 2,
        providers: 1,
        suspended: 1,
        bookings: 3,
        avg_rating: 4.5,
        total_revenue: 150.5,
        monthly_revenue: 50.5,
        pending_verifications: 2,
      });
      expect(result.bookings_by_status).toEqual({ completed: 1, open: 2 });
      expect(result.bookings_by_category).toEqual({
        Plumbing: 2,
        Cleaning: 1,
      });
      expect(result.booking_trend).toEqual([
        { date: '2026-07-10', count: 2 },
        { date: '2026-07-11', count: 1 },
      ]);
      expect(result.revenue_trend).toEqual(
        [
          { month: '2026-06', amount: 100 },
          { month: currentMonth, amount: 50.5 },
        ].sort((a, b) => a.month.localeCompare(b.month)),
      );
      expect(result.top_providers).toEqual(providers);
    });
  });

  describe('recentActivity', () => {
    it('returns job_status_history rows ordered by most recent', async () => {
      const rows = [
        {
          id: 1,
          old_status: 'open',
          new_status: 'cancelled',
          changed_at: '2026-07-26T10:00:00Z',
          jobs: { title: '3 bedroom clean' },
          changed_by: { full_name: 'Georgina Ramos' },
        },
      ];
      const { supabase, calls } = createSupabaseMock({
        job_status_history: [{ data: rows, error: null }],
      });
      const service = new AdminService(supabase);

      const result = await service.recentActivity();

      expect(result).toEqual(rows);
      expect(calls.some((c) => c.method === 'limit' && c.args[0] === 20)).toBe(
        true,
      );
    });

    it('throws BadRequestException on query error', async () => {
      const { supabase } = createSupabaseMock({
        job_status_history: [{ data: null, error: { message: 'boom' } }],
      });
      const service = new AdminService(supabase);

      await expect(service.recentActivity()).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancelBooking', () => {
    it('cancels an open booking', async () => {
      const updated = { id: 'j1', status: 'cancelled' };
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          { data: { id: 'j1', status: 'open' }, error: null },
          { data: updated, error: null },
        ],
      });
      const service = new AdminService(supabase);

      const result = await service.cancelBooking('j1');

      expect(result).toEqual(updated);
      const updateCall = calls.find((c) => c.method === 'update');
      expect(updateCall?.args[0]).toEqual({ status: 'cancelled' });
    });

    it('refuses to cancel an already-completed booking', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [{ data: { id: 'j1', status: 'completed' }, error: null }],
      });
      const service = new AdminService(supabase);

      await expect(service.cancelBooking('j1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s on an unknown booking', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [{ data: null, error: null }],
      });
      const service = new AdminService(supabase);

      await expect(service.cancelBooking('j404')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
