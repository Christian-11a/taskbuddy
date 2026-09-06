import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { EscrowService } from '../escrow/escrow.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as escrow.service.spec.ts — results consumed per `.from()`. */
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

function createEscrowMock(
  overrides: Partial<
    Record<'hold' | 'releaseHoldForFailedHire', jest.Mock>
  > = {},
) {
  const hold =
    overrides.hold ??
    jest.fn().mockResolvedValue({ escrow: { id: 'e1' }, placed: true });
  const releaseHoldForFailedHire =
    overrides.releaseHoldForFailedHire ??
    jest.fn().mockResolvedValue(undefined);
  return {
    escrow: { hold, releaseHoldForFailedHire } as unknown as EscrowService,
    hold,
    releaseHoldForFailedHire,
  };
}

const client = { id: 'c1', role: 'client', full_name: 'Ana Cruz' } as Profile;
const provider = {
  id: 'p1',
  role: 'provider',
  full_name: 'Boy Plumber',
} as Profile;

const pendingApplication = {
  id: 'app1',
  job_id: 'j1',
  provider_id: 'p1',
  status: 'pending',
  jobs: { id: 'j1', title: 'Fix sink', status: 'open', client_id: 'c1' },
};

/** The rows a call wrote to one table, in order. */
function writesTo(
  calls: { table: string; method: string; args: unknown[] }[],
  table: string,
  method: 'insert' | 'update',
) {
  return calls
    .filter((c) => c.table === table && c.method === method)
    .map((c) => c.args[0] as Record<string, unknown>);
}

describe('ApplicationsService', () => {
  describe('apply', () => {
    it('records an organic application and tells the client', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              status: 'open',
              client_id: 'c1',
            },
            error: null,
          },
        ],
        provider_profiles: [
          { data: { profile_id: 'p1', is_verified: true }, error: null },
        ],
        recommendation_candidates: [{ data: null, error: null }],
        job_applications: [{ data: { id: 'app1' }, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await service.apply(provider, 'j1', {});

      expect(writesTo(calls, 'job_applications', 'insert')[0]).toMatchObject({
        job_id: 'j1',
        provider_id: 'p1',
        source: 'organic',
      });
      expect(writesTo(calls, 'notifications', 'insert')[0]).toMatchObject({
        recipient_id: 'c1',
        type: 'application_update',
      });
    });

    it('marks an application `recommended` and links it to the candidate row', async () => {
      // The link is what backfills the ML training label and the provider's
      // cached response time (schema §9.3) — an unlinked application is a
      // retraining row with a hole in it.
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              status: 'recommending',
              client_id: 'c1',
            },
            error: null,
          },
        ],
        provider_profiles: [
          { data: { profile_id: 'p1', is_verified: true }, error: null },
        ],
        recommendation_candidates: [
          { data: { id: 'cand1' }, error: null },
          { data: null, error: null },
        ],
        job_applications: [{ data: { id: 'app1' }, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await service.apply(provider, 'j1', { cover_message: 'Kaya ko po ito' });

      expect(writesTo(calls, 'job_applications', 'insert')[0]).toMatchObject({
        source: 'recommended',
        cover_message: 'Kaya ko po ito',
      });
      expect(
        writesTo(calls, 'recommendation_candidates', 'update')[0],
      ).toMatchObject({ application_id: 'app1' });
    });

    it('refuses a job that is no longer taking applications', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              status: 'assigned',
              client_id: 'c1',
            },
            error: null,
          },
        ],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await expect(service.apply(provider, 'j1', {})).rejects.toThrow(
        /no longer accepting applications/,
      );
    });

    it('refuses a provider who has not set up a provider profile', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              status: 'open',
              client_id: 'c1',
            },
            error: null,
          },
        ],
        provider_profiles: [{ data: null, error: null }],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await expect(service.apply(provider, 'j1', {})).rejects.toThrow(
        /Set up your provider profile/,
      );
    });

    it('turns the unique-violation on a second apply into a readable error', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              status: 'open',
              client_id: 'c1',
            },
            error: null,
          },
        ],
        provider_profiles: [
          { data: { profile_id: 'p1', is_verified: true }, error: null },
        ],
        recommendation_candidates: [{ data: null, error: null }],
        job_applications: [
          { data: null, error: { message: 'duplicate key', code: '23505' } },
        ],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await expect(service.apply(provider, 'j1', {})).rejects.toThrow(
        'You already applied to this job',
      );
    });
  });

  describe('accept', () => {
    it('holds the budget before accepting, so a hire and its money land together', async () => {
      const { escrow, hold } = createEscrowMock();
      const { supabase, calls } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: { ...pendingApplication, status: 'accepted' }, error: null },
        ],
        notifications: [{ data: null, error: null }],
      });
      const service = new ApplicationsService(supabase, escrow);

      const result = await service.accept(client, 'app1');

      expect(hold).toHaveBeenCalledWith('j1', 'p1');
      expect(result).toMatchObject({ status: 'accepted' });
      expect(writesTo(calls, 'notifications', 'insert')[0]).toMatchObject({
        recipient_id: 'p1',
        title: 'Application accepted',
      });
    });

    it('leaves the application pending when the wallet cannot cover the budget', async () => {
      // The regression this exists for: the accept used to fire first, so an
      // insufficient balance left a hired provider, rejected rivals and an
      // assigned job behind an error the client saw as a failure.
      const { escrow, hold } = createEscrowMock({
        hold: jest
          .fn()
          .mockRejectedValue(
            new BadRequestException('Insufficient wallet balance'),
          ),
      });
      const { supabase, calls } = createSupabaseMock({
        job_applications: [{ data: pendingApplication, error: null }],
      });
      const service = new ApplicationsService(supabase, escrow);

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        /Insufficient wallet balance/,
      );
      expect(hold).toHaveBeenCalled();
      expect(writesTo(calls, 'job_applications', 'update')).toEqual([]);
      expect(writesTo(calls, 'notifications', 'insert')).toEqual([]);
    });

    it('returns the held money when the accept itself fails', async () => {
      const { escrow, releaseHoldForFailedHire } = createEscrowMock();
      const { supabase } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: null, error: { message: 'connection lost' } },
        ],
      });
      const service = new ApplicationsService(supabase, escrow);

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        'connection lost',
      );
      expect(releaseHoldForFailedHire).toHaveBeenCalledWith('j1');
    });

    it('reports the original failure even when the rollback also fails', async () => {
      // The client needs to know why their hire did not happen; "the refund
      // also failed" is an operator's problem, and is logged as one.
      const { escrow } = createEscrowMock({
        releaseHoldForFailedHire: jest
          .fn()
          .mockRejectedValue(new Error('refund failed too')),
      });
      const { supabase } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: null, error: { message: 'connection lost' } },
        ],
      });
      const service = new ApplicationsService(supabase, escrow);
      jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        'connection lost',
      );
    });

    it('does not roll anything back for a job that had no budget to hold', async () => {
      const { escrow, releaseHoldForFailedHire } = createEscrowMock({
        hold: jest.fn().mockResolvedValue({ escrow: null, placed: false }),
      });
      const { supabase } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: null, error: { message: 'connection lost' } },
        ],
      });
      const service = new ApplicationsService(supabase, escrow);

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        'connection lost',
      );
      expect(releaseHoldForFailedHire).not.toHaveBeenCalled();
    });

    it('does not refund the winner’s hold when it loses a double-tap', async () => {
      // Two taps: the first holds the money and accepts. The second gets the
      // *existing* hold back from the idempotent `hold()` (placed: false),
      // then fails its own update because the application is no longer
      // pending. Rolling back there would refund the client for a hire that
      // succeeded, leaving an assigned job with no money behind it.
      const { escrow, releaseHoldForFailedHire } = createEscrowMock({
        hold: jest
          .fn()
          .mockResolvedValue({ escrow: { id: 'e1' }, placed: false }),
      });
      const { supabase } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: null, error: null }, // lost the race on `status = pending`
        ],
      });
      const service = new ApplicationsService(supabase, escrow);

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        'This application was already decided by someone else',
      );
      expect(releaseHoldForFailedHire).not.toHaveBeenCalled();
    });

    it('refuses someone else’s job', async () => {
      const { escrow, hold } = createEscrowMock();
      const { supabase } = createSupabaseMock({
        job_applications: [
          {
            data: {
              ...pendingApplication,
              jobs: { ...pendingApplication.jobs, client_id: 'someone-else' },
            },
            error: null,
          },
        ],
      });
      const service = new ApplicationsService(supabase, escrow);

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(hold).not.toHaveBeenCalled();
    });

    it('refuses a job that already has an assigned provider', async () => {
      const { escrow, hold } = createEscrowMock();
      const { supabase } = createSupabaseMock({
        job_applications: [
          {
            data: {
              ...pendingApplication,
              jobs: { ...pendingApplication.jobs, status: 'assigned' },
            },
            error: null,
          },
        ],
      });
      const service = new ApplicationsService(supabase, escrow);

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        'Job already has an assigned provider',
      );
      expect(hold).not.toHaveBeenCalled();
    });

    it('loses gracefully when another request decided the application first', async () => {
      // The status is re-asserted in the WHERE clause, so the update matches
      // no row rather than firing the assign-and-reject trigger a second time.
      const { escrow } = createEscrowMock();
      const { supabase } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: null, error: null },
        ],
      });
      const service = new ApplicationsService(supabase, escrow);

      await expect(service.accept(client, 'app1')).rejects.toThrow(
        'This application was already decided by someone else',
      );
    });
  });

  describe('reject', () => {
    it('declines the application and tells the provider', async () => {
      const { supabase, calls } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: { ...pendingApplication, status: 'rejected' }, error: null },
        ],
        notifications: [{ data: null, error: null }],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await service.reject(client, 'app1');

      expect(writesTo(calls, 'job_applications', 'update')[0]).toMatchObject({
        status: 'rejected',
      });
      expect(writesTo(calls, 'notifications', 'insert')[0]).toMatchObject({
        recipient_id: 'p1',
      });
    });

    it('refuses an application that was already decided', async () => {
      const { supabase } = createSupabaseMock({
        job_applications: [
          { data: { ...pendingApplication, status: 'rejected' }, error: null },
        ],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await expect(service.reject(client, 'app1')).rejects.toThrow(
        /already 'rejected'/,
      );
    });
  });

  describe('withdraw', () => {
    it('lets the provider retract their own pending application', async () => {
      const { supabase, calls } = createSupabaseMock({
        job_applications: [
          { data: pendingApplication, error: null },
          { data: { ...pendingApplication, status: 'withdrawn' }, error: null },
        ],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await service.withdraw(provider, 'app1');

      expect(writesTo(calls, 'job_applications', 'update')[0]).toMatchObject({
        status: 'withdrawn',
      });
    });

    it('refuses to withdraw somebody else’s application', async () => {
      const { supabase } = createSupabaseMock({
        job_applications: [{ data: pendingApplication, error: null }],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await expect(
        service.withdraw({ id: 'p9', role: 'provider' } as Profile, 'app1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listForJob', () => {
    it('refuses a job the caller does not own', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [{ data: { id: 'j1', client_id: 'someone-else' }, error: null }],
      });
      const service = new ApplicationsService(
        supabase,
        createEscrowMock().escrow,
      );

      await expect(service.listForJob(client, 'j1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
