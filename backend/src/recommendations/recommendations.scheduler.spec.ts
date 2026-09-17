import { RecommendationsScheduler } from './recommendations.scheduler';
import type { RecommendationsService } from './recommendations.service';
import type { SupabaseService } from '../supabase/supabase.service';

type QueryResult = { data: unknown; error: { message: string } | null };

function createSupabaseMock(
  resultsByTable: Record<string, QueryResult[]>,
  claimed: QueryResult = { data: [], error: null },
) {
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
      'eq',
      'in',
      'lt',
      'order',
      'limit',
    ]) {
      builder[method] = chain(method);
    }
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  const rpc = jest.fn(() => Promise.resolve(claimed));
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
    rpc,
  };
}

function createRecommendationsMock(scoreJob = jest.fn().mockResolvedValue({})) {
  return {
    recommendations: { scoreJob } as unknown as RecommendationsService,
    scoreJob,
  };
}

/** No timed-out jobs and nothing to expire — the quiet-tick baseline. */
const noWork = () => ({
  jobs: [
    { data: [], error: null }, // processTimeouts' select
    { data: [], error: null }, // expireStaleJobs' update
  ],
});

function updatesTo(
  calls: { table: string; method: string; args: unknown[] }[],
  table: string,
) {
  return calls
    .filter((c) => c.table === table && c.method === 'update')
    .map((c) => c.args[0] as Record<string, unknown>);
}

describe('RecommendationsScheduler', () => {
  const originalDriver = process.env.CRON_DRIVER;
  afterEach(() => {
    if (originalDriver === undefined) delete process.env.CRON_DRIVER;
    else process.env.CRON_DRIVER = originalDriver;
  });

  describe('tick', () => {
    it('flips a timed-out job to recommending and scores it', async () => {
      const { recommendations, scoreJob } = createRecommendationsMock();
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          { data: [{ id: 'j1', title: 'Fix sink' }], error: null },
          { data: { id: 'j1' }, error: null }, // the conditional flip
          { data: [], error: null }, // expireStaleJobs
        ],
      });
      const scheduler = new RecommendationsScheduler(supabase, recommendations);

      await scheduler.tick();

      expect(updatesTo(calls, 'jobs')[0]).toMatchObject({
        status: 'recommending',
        recommendation_attempted_at: expect.any(String),
      });
      expect(scoreJob).toHaveBeenCalledWith('j1', 'Fix sink', 'timeout');
    });

    it('does not score a job another tick already claimed', async () => {
      // The flip is conditional on the job still being 'open', so exactly one
      // tick can move it. Without this a restart mid-sweep would score, notify
      // and bill a second run for the same job.
      const { recommendations, scoreJob } = createRecommendationsMock();
      const { supabase } = createSupabaseMock({
        jobs: [
          { data: [{ id: 'j1', title: 'Fix sink' }], error: null },
          { data: null, error: null }, // the flip matched no row
          { data: [], error: null },
        ],
      });
      const scheduler = new RecommendationsScheduler(supabase, recommendations);

      await scheduler.tick();

      expect(scoreJob).not.toHaveBeenCalled();
    });

    it('leaves a job in recommending when scoring fails, and carries on', async () => {
      // ml-service sleeps on the free tier. Providers can still apply
      // organically and the client can retry from the app.
      const { recommendations } = createRecommendationsMock(
        jest.fn().mockRejectedValue(new Error('ml-service asleep')),
      );
      const { supabase } = createSupabaseMock({
        jobs: [
          { data: [{ id: 'j1', title: 'Fix sink' }], error: null },
          { data: { id: 'j1' }, error: null },
          { data: [], error: null },
        ],
      });
      const scheduler = new RecommendationsScheduler(supabase, recommendations);
      jest.spyOn(scheduler['logger'], 'error').mockImplementation(() => {});

      await expect(scheduler.tick()).resolves.toBeUndefined();
    });

    it('expires unassigned jobs older than 24 hours', async () => {
      const { recommendations } = createRecommendationsMock();
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          { data: [], error: null },
          { data: [{ id: 'old1' }, { id: 'old2' }], error: null },
        ],
      });
      const scheduler = new RecommendationsScheduler(supabase, recommendations);
      jest.spyOn(scheduler['logger'], 'log').mockImplementation(() => {});

      await scheduler.tick();

      expect(updatesTo(calls, 'jobs')[0]).toEqual({ status: 'expired' });
      // Only jobs nobody took — an assigned job is somebody's booking.
      const scoped = calls.find(
        (c) => c.table === 'jobs' && c.method === 'in',
      )?.args;
      expect(scoped).toEqual(['status', ['open', 'recommending']]);
    });

    it('scores the unscored jobs the claim function hands back', async () => {
      const { recommendations, scoreJob } = createRecommendationsMock();
      const { supabase, rpc } = createSupabaseMock(
        {
          jobs: [
            { data: [], error: null }, // nothing newly timed out
            { data: [], error: null }, // expireStaleJobs
          ],
        },
        {
          data: [
            { id: 'j1', title: 'Fix sink' },
            { id: 'j2', title: 'Clean house' },
          ],
          error: null,
        },
      );
      const scheduler = new RecommendationsScheduler(supabase, recommendations);

      await scheduler.tick();

      // The run check, the batch limit and the attempt window all live in SQL
      // (migration 0032, covered by test/sql/matching.test.mjs).
      expect(rpc).toHaveBeenCalledWith('claim_unscored_recommending_jobs', {
        p_retry_after_seconds: 300,
        p_limit: 20,
      });
      expect(scoreJob.mock.calls).toEqual([
        ['j1', 'Fix sink', 'timeout'],
        ['j2', 'Clean house', 'timeout'],
      ]);
    });

    it('keeps retrying other unscored jobs when one retry fails', async () => {
      const scoreJob = jest
        .fn()
        .mockRejectedValueOnce(new Error('ml-service asleep'))
        .mockResolvedValue({});
      const { recommendations } = createRecommendationsMock(scoreJob);
      const { supabase } = createSupabaseMock(
        {
          jobs: [
            { data: [], error: null },
            { data: [], error: null },
          ],
        },
        {
          data: [
            { id: 'j1', title: 'Fix sink' },
            { id: 'j2', title: 'Clean house' },
          ],
          error: null,
        },
      );
      const scheduler = new RecommendationsScheduler(supabase, recommendations);
      jest.spyOn(scheduler['logger'], 'error').mockImplementation(() => {});

      await scheduler.tick();

      expect(scoreJob).toHaveBeenCalledTimes(2);
    });

    it('swallows a failing sweep so the next minute still runs', async () => {
      const { recommendations } = createRecommendationsMock();
      const { supabase } = createSupabaseMock({});
      const scheduler = new RecommendationsScheduler(supabase, recommendations);
      const logged = jest
        .spyOn(scheduler['logger'], 'error')
        .mockImplementation(() => {});

      await expect(scheduler.tick()).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalled();
    });

    it('skips a tick while the previous one is still running', async () => {
      // The sweep is not reentrant: two overlapping runs would both read the
      // same open jobs before either flipped them.
      let releaseFirst: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const { recommendations, scoreJob } = createRecommendationsMock(
        jest.fn().mockImplementation(() => gate),
      );
      const { supabase } = createSupabaseMock({
        jobs: [
          { data: [{ id: 'j1', title: 'Fix sink' }], error: null },
          { data: { id: 'j1' }, error: null },
          { data: [], error: null },
        ],
      });
      const scheduler = new RecommendationsScheduler(supabase, recommendations);

      const first = scheduler.tick();
      await scheduler.tick(); // returns immediately
      releaseFirst();
      await first;

      expect(scoreJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduledTick', () => {
    it('runs the sweep when this process owns the clock', async () => {
      delete process.env.CRON_DRIVER;
      const { recommendations } = createRecommendationsMock();
      const { supabase, calls } = createSupabaseMock(noWork());
      const scheduler = new RecommendationsScheduler(supabase, recommendations);

      await scheduler.scheduledTick();

      expect(calls.length).toBeGreaterThan(0);
    });

    it('stands down when Postgres drives the schedule instead', async () => {
      // Under CRON_DRIVER=pg_cron the same tick() arrives through
      // POST /internal/tick/recommendations. Running both would double every
      // sweep on a host that happens to be awake.
      process.env.CRON_DRIVER = 'pg_cron';
      const { recommendations } = createRecommendationsMock();
      const { supabase, calls } = createSupabaseMock(noWork());
      const scheduler = new RecommendationsScheduler(supabase, recommendations);

      await scheduler.scheduledTick();

      expect(calls).toEqual([]);
    });
  });
});
