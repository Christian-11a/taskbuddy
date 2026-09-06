import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecommendationsService } from './recommendations.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
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
      'in',
      'lt',
      'order',
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
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
    rpc,
  };
}

const config = {
  get: (_key: string, fallback: string) => fallback,
} as ConfigService;

const client = { id: 'c1', role: 'client' } as Profile;

/** One row of `fn_job_provider_features` — the 14 features plus the id. */
function featureRow(
  providerId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    provider_id: providerId,
    skills_match: 1,
    distance_km: 4.2,
    provider_avg_rating: 4.5,
    provider_completed_jobs: 12,
    provider_availability: 1,
    job_idle_duration_hrs: 0.2,
    provider_response_time_hrs: 1.5,
    provider_years_experience: 3,
    hour_posted: 14,
    provider_skill_category: 'Plumbing',
    day_of_week: 'Monday',
    job_urgency: 'urgent',
    job_description: 'Tumutulo yung gripo',
    provider_bio: 'Mahigit 3 taon na akong tubero',
    ...overrides,
  };
}

function mockModelService(body: unknown, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function writesTo(
  calls: { table: string; method: string; args: unknown[] }[],
  table: string,
  method: 'insert' | 'update',
) {
  return calls
    .filter((c) => c.table === table && c.method === method)
    .map((c) => c.args[0]);
}

describe('RecommendationsService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('scoreJob', () => {
    it('ranks by score, snapshots every candidate, and invites only the top 8', async () => {
      // Nine eligible providers, deliberately scored in reverse order, so the
      // ranking cannot pass by accident of the pool's own ordering.
      const pool = Array.from({ length: 9 }, (_, i) => featureRow(`p${i}`));
      const scores = pool.map((_, i) => (i + 1) / 10); // p8 best, p0 worst
      const { supabase, calls, rpc } = createSupabaseMock({
        recommendation_runs: [{ data: { id: 'run1' }, error: null }],
        recommendation_candidates: [{ data: null, error: null }],
        notifications: [{ data: null, error: null }],
      });
      rpc.mockResolvedValue({ data: pool, error: null });
      global.fetch = mockModelService({ model_version: 'rf-a-v1', scores });
      const service = new RecommendationsService(supabase, config);

      const result = await service.scoreJob('j1', 'Fix sink', 'timeout');

      expect(result).toEqual({ run_id: 'run1', pool_size: 9, notified: 8 });

      const candidates = writesTo(
        calls,
        'recommendation_candidates',
        'insert',
      )[0] as Record<string, unknown>[];
      expect(candidates).toHaveLength(9);
      expect(candidates[0]).toMatchObject({ provider_id: 'p8', rank: 1 });
      expect(candidates[8]).toMatchObject({ provider_id: 'p0', rank: 9 });
      // Everyone is snapshotted for retraining; only the invited carry a
      // notified_at, which is what separates "scored" from "asked".
      expect(candidates.filter((c) => c.notified_at !== null)).toHaveLength(8);
      expect(candidates[8].notified_at).toBeNull();

      const invites = writesTo(calls, 'notifications', 'insert')[0] as Record<
        string,
        unknown
      >[];
      expect(invites).toHaveLength(8);
      expect(invites[0]).toMatchObject({
        recipient_id: 'p8',
        type: 'recommendation_invite',
      });
    });

    it('freezes the feature vector onto each candidate row', async () => {
      // These snapshots are the retraining dataset (schema §13). A candidate
      // that stored only a score would be unusable once the provider's rating
      // or distance changed.
      const { supabase, calls, rpc } = createSupabaseMock({
        recommendation_runs: [{ data: { id: 'run1' }, error: null }],
        recommendation_candidates: [{ data: null, error: null }],
        notifications: [{ data: null, error: null }],
      });
      rpc.mockResolvedValue({
        data: [featureRow('p1', { distance_km: 12.5, skills_match: 0 })],
        error: null,
      });
      global.fetch = mockModelService({
        model_version: 'rf-a-v1',
        scores: [0.42],
      });
      const service = new RecommendationsService(supabase, config);

      await service.scoreJob('j1', 'Fix sink', 'timeout');

      const [candidate] = writesTo(
        calls,
        'recommendation_candidates',
        'insert',
      )[0] as Record<string, unknown>[];
      expect(candidate).toMatchObject({
        provider_id: 'p1',
        score: 0.42,
        distance_km: 12.5,
        skills_match: 0,
        provider_skill_category: 'Plumbing',
        job_urgency: 'urgent',
        provider_bio: 'Mahigit 3 taon na akong tubero',
      });
    });

    it('records which model produced the run', async () => {
      const { supabase, calls, rpc } = createSupabaseMock({
        recommendation_runs: [{ data: { id: 'run1' }, error: null }],
        recommendation_candidates: [{ data: null, error: null }],
        notifications: [{ data: null, error: null }],
      });
      rpc.mockResolvedValue({ data: [featureRow('p1')], error: null });
      global.fetch = mockModelService({
        model_version: 'rf-a-v2',
        scores: [0.9],
      });
      const service = new RecommendationsService(supabase, config);

      await service.scoreJob('j1', 'Fix sink', 'manual');

      expect(writesTo(calls, 'recommendation_runs', 'insert')[0]).toMatchObject(
        {
          job_id: 'j1',
          triggered_by: 'manual',
          model_version: 'rf-a-v2',
          pool_size: 1,
        },
      );
    });

    it('records no run at all when nobody is eligible', async () => {
      // A run row with an empty pool would look like the engine had considered
      // everyone and picked nobody.
      const { supabase, calls, rpc } = createSupabaseMock({});
      rpc.mockResolvedValue({ data: [], error: null });
      const fetchMock = mockModelService({});
      global.fetch = fetchMock;
      const service = new RecommendationsService(supabase, config);

      expect(await service.scoreJob('j1', 'Fix sink', 'timeout')).toEqual({
        run_id: null,
        pool_size: 0,
        notified: 0,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(writesTo(calls, 'recommendation_runs', 'insert')).toEqual([]);
    });

    it('sends the model the 14 features and not the provider id', async () => {
      // The pipeline is trained on exact column names; an extra key is a
      // different feature space than the one the model was fitted on.
      const { supabase, rpc } = createSupabaseMock({
        recommendation_runs: [{ data: { id: 'run1' }, error: null }],
        recommendation_candidates: [{ data: null, error: null }],
        notifications: [{ data: null, error: null }],
      });
      rpc.mockResolvedValue({ data: [featureRow('p1')], error: null });
      const fetchMock = mockModelService({
        model_version: 'rf-a-v1',
        scores: [0.5],
      });
      global.fetch = fetchMock;
      const service = new RecommendationsService(supabase, config);

      await service.scoreJob('j1', 'Fix sink', 'timeout');

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      ) as { records: Record<string, unknown>[] };
      expect(Object.keys(body.records[0])).toHaveLength(14);
      expect(body.records[0]).not.toHaveProperty('provider_id');
    });

    it('surfaces a feature-RPC failure rather than scoring an empty pool', async () => {
      const { supabase, rpc } = createSupabaseMock({});
      rpc.mockResolvedValue({ data: null, error: { message: 'rpc exploded' } });
      const service = new RecommendationsService(supabase, config);

      await expect(
        service.scoreJob('j1', 'Fix sink', 'timeout'),
      ).rejects.toThrow(BadRequestException);
    });

    it('fails loudly when the model service is down', async () => {
      // ml-service is not kept warm on the free tier. The job stays
      // 'recommending' and the client can retry — silence here would leave it
      // looking like nobody matched.
      const { supabase, rpc } = createSupabaseMock({});
      rpc.mockResolvedValue({ data: [featureRow('p1')], error: null });
      global.fetch = mockModelService({ detail: 'unavailable' }, false);
      const service = new RecommendationsService(supabase, config);

      await expect(
        service.scoreJob('j1', 'Fix sink', 'timeout'),
      ).rejects.toThrow(/Model service returned 503/);
    });

    it('refuses a score array that does not line up with the pool', async () => {
      // Scores are matched to providers by position. A short array would
      // silently invite whoever happened to land in the surviving slots.
      const { supabase, rpc } = createSupabaseMock({});
      rpc.mockResolvedValue({
        data: [featureRow('p1'), featureRow('p2')],
        error: null,
      });
      global.fetch = mockModelService({
        model_version: 'rf-a-v1',
        scores: [0.9],
      });
      const service = new RecommendationsService(supabase, config);

      await expect(
        service.scoreJob('j1', 'Fix sink', 'timeout'),
      ).rejects.toThrow(/score array of the wrong length/);
    });
  });

  describe('triggerManual', () => {
    it('moves an open job to recommending before scoring it', async () => {
      const { supabase, calls, rpc } = createSupabaseMock({
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
          { data: null, error: null }, // the status flip
        ],
      });
      rpc.mockResolvedValue({ data: [], error: null });
      const service = new RecommendationsService(supabase, config);

      await service.triggerManual(client, 'j1');

      expect(writesTo(calls, 'jobs', 'update')[0]).toEqual({
        status: 'recommending',
      });
    });

    it('leaves a job already in recommending where it is', async () => {
      const { supabase, calls, rpc } = createSupabaseMock({
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
      });
      rpc.mockResolvedValue({ data: [], error: null });
      const service = new RecommendationsService(supabase, config);

      await service.triggerManual(client, 'j1');

      expect(writesTo(calls, 'jobs', 'update')).toEqual([]);
    });

    it('refuses someone else’s job', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              status: 'open',
              client_id: 'someone-else',
            },
            error: null,
          },
        ],
      });
      const service = new RecommendationsService(supabase, config);

      await expect(service.triggerManual(client, 'j1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a job that already has a provider', async () => {
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
      const service = new RecommendationsService(supabase, config);

      await expect(service.triggerManual(client, 'j1')).rejects.toThrow(
        /Cannot run recommendations for a 'assigned' job/,
      );
    });
  });
});
