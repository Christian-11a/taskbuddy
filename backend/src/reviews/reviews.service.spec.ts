import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

/** Same chainable stand-in as the other service specs — results per `.from()`. */
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
    for (const method of ['select', 'insert', 'update', 'eq', 'order']) {
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

const client = { id: 'c1', role: 'client', full_name: 'Ana Cruz' } as Profile;

const completedJob = {
  id: 'j1',
  title: 'Fix sink',
  status: 'completed',
  client_id: 'c1',
  assigned_provider_id: 'p1',
};

function writesTo(
  calls: { table: string; method: string; args: unknown[] }[],
  table: string,
) {
  return calls
    .filter((c) => c.table === table && c.method === 'insert')
    .map((c) => c.args[0] as Record<string, unknown>);
}

describe('ReviewsService', () => {
  describe('create', () => {
    it('records the review against the job’s assigned provider', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [{ data: completedJob, error: null }],
        reviews: [{ data: { id: 'r1', rating: 5 }, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const service = new ReviewsService(supabase);

      const result = await service.create(client, 'j1', {
        rating: 5,
        comment: 'Ang bilis, salamat!',
      });

      expect(result).toMatchObject({ id: 'r1' });
      expect(writesTo(calls, 'reviews')[0]).toMatchObject({
        job_id: 'j1',
        client_id: 'c1',
        // Never taken from the request: the reviewer does not get to choose
        // whose rating they are moving.
        provider_id: 'p1',
        rating: 5,
        comment: 'Ang bilis, salamat!',
      });
    });

    it('tells the provider their rating changed', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [{ data: completedJob, error: null }],
        reviews: [{ data: { id: 'r1' }, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const service = new ReviewsService(supabase);

      await service.create(client, 'j1', { rating: 4 });

      expect(writesTo(calls, 'notifications')[0]).toMatchObject({
        recipient_id: 'p1',
        title: 'You received a review',
      });
    });

    it('stores no comment when none was written', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [{ data: completedJob, error: null }],
        reviews: [{ data: { id: 'r1' }, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const service = new ReviewsService(supabase);

      await service.create(client, 'j1', { rating: 3 });

      expect(writesTo(calls, 'reviews')[0]).toMatchObject({ comment: null });
    });

    it('refuses a job the caller does not own', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          { data: { ...completedJob, client_id: 'someone-else' }, error: null },
        ],
      });
      const service = new ReviewsService(supabase);

      await expect(service.create(client, 'j1', { rating: 5 })).rejects.toThrow(
        ForbiddenException,
      );
      expect(writesTo(calls, 'reviews')).toEqual([]);
    });

    it('refuses a job that is not finished', async () => {
      // TC-REV-003: reviewing before completion. The provider is still working
      // and a rating now would score a job nobody has seen the end of.
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          { data: { ...completedJob, status: 'in_progress' }, error: null },
        ],
      });
      const service = new ReviewsService(supabase);

      await expect(service.create(client, 'j1', { rating: 5 })).rejects.toThrow(
        'You can only review completed jobs',
      );
      expect(writesTo(calls, 'reviews')).toEqual([]);
    });

    it('refuses a completed job with nobody assigned to it', async () => {
      // `reviews.provider_id` is NOT NULL, so without this guard the caller
      // gets a raw Postgres constraint message.
      const { supabase } = createSupabaseMock({
        jobs: [
          {
            data: { ...completedJob, assigned_provider_id: null },
            error: null,
          },
        ],
      });
      const service = new ReviewsService(supabase);

      await expect(service.create(client, 'j1', { rating: 5 })).rejects.toThrow(
        'This job has no assigned provider to review',
      );
    });

    it('turns a second review on the same job into a readable error', async () => {
      // TC-REV-002. `reviews.job_id` is UNIQUE, so the constraint — not a
      // read-then-write two taps could both pass — is what enforces this.
      const { supabase } = createSupabaseMock({
        jobs: [{ data: completedJob, error: null }],
        reviews: [
          { data: null, error: { message: 'duplicate key', code: '23505' } },
        ],
      });
      const service = new ReviewsService(supabase);

      await expect(service.create(client, 'j1', { rating: 5 })).rejects.toThrow(
        'This job already has a review',
      );
    });

    it('reports a job that does not exist as 404, not 400', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [{ data: null, error: null }],
      });
      const service = new ReviewsService(supabase);

      await expect(service.create(client, 'j1', { rating: 5 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listForProvider', () => {
    it('returns the provider’s reviews newest first', async () => {
      const rows = [{ id: 'r2' }, { id: 'r1' }];
      const { supabase, calls } = createSupabaseMock({
        reviews: [{ data: rows, error: null }],
      });
      const service = new ReviewsService(supabase);

      expect(await service.listForProvider('p1')).toEqual(rows);
      expect(
        calls.find((c) => c.table === 'reviews' && c.method === 'order')?.args,
      ).toEqual(['created_at', { ascending: false }]);
    });

    it('returns an empty list rather than null for a provider with no reviews', async () => {
      const { supabase } = createSupabaseMock({
        reviews: [{ data: null, error: null }],
      });
      const service = new ReviewsService(supabase);

      expect(await service.listForProvider('p1')).toEqual([]);
    });
  });
});
