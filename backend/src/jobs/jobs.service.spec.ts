import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { IsNotPastInstantConstraint } from './dto/jobs.dto';
import type { SupabaseService } from '../supabase/supabase.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { EscrowService } from '../escrow/escrow.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

/** Same chainable stand-in as escrow.service.spec.ts — one result per `.from()`. */
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
    for (const method of ['select', 'update', 'insert', 'eq', 'in', 'order']) {
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

const provider = { id: 'p1', full_name: 'Provider One' } as Profile;

const job = (overrides: Record<string, unknown> = {}) => ({
  id: 'j1',
  client_id: 'c1',
  title: 'Fix the sink',
  status: 'assigned',
  assigned_provider_id: 'p1',
  ...overrides,
});

const ok = (data: unknown): QueryResult => ({ data, error: null });

function createService(resultsByTable: Record<string, QueryResult[]>) {
  const { supabase, calls } = createSupabaseMock(resultsByTable);
  const uploads = {
    assertOwnedPaths: jest.fn(),
  } as unknown as UploadsService;
  // Held as standalone jest.fn()s (the escrow.service.spec.ts pattern) so
  // assertions read them directly rather than off the cast object.
  const cancelForJob = jest.fn().mockResolvedValue(undefined);
  const releaseIfHeld = jest.fn().mockResolvedValue(undefined);
  const escrow = { cancelForJob, releaseIfHeld } as unknown as EscrowService;
  return {
    service: new JobsService(supabase, uploads, escrow),
    calls,
    cancelForJob,
    releaseIfHeld,
  };
}

/** A browsable job, as `browse()` reads them off the open/recommending list. */
const openJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'j1',
  client_id: 'c1',
  title: 'Fix the sink',
  status: 'open',
  urgency: 'normal',
  budget: 1000,
  latitude: 14.676,
  longitude: 121.0437,
  posted_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

// Quezon City, and a point ~110km south of it.
const QC = { latitude: 14.676, longitude: 121.0437 };
const FAR = { latitude: 13.676, longitude: 121.0437 };

describe('JobsService.accept', () => {
  it("moves an incoming booking request to 'confirmed' and tells the client", async () => {
    const { service, calls } = createService({
      jobs: [ok(job()), ok(job({ status: 'confirmed' }))],
      notifications: [ok(null)],
    });

    const result = await service.accept(provider, 'j1');

    expect(result).toMatchObject({ status: 'confirmed' });
    const update = calls.find(
      (c) => c.table === 'jobs' && c.method === 'update',
    );
    expect(update?.args[0]).toEqual({ status: 'confirmed' });
    const notification = calls.find((c) => c.table === 'notifications');
    expect(notification?.args[0]).toMatchObject({
      recipient_id: 'c1',
      title: 'Booking confirmed',
    });
  });

  it('refuses a job assigned to someone else', async () => {
    const { service } = createService({
      jobs: [ok(job({ assigned_provider_id: 'p2' }))],
    });
    await expect(service.accept(provider, 'j1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('says so plainly when the booking was already accepted', async () => {
    const { service } = createService({
      jobs: [ok(job({ status: 'confirmed' }))],
    });
    await expect(service.accept(provider, 'j1')).rejects.toThrow(
      'already accepted',
    );
  });

  it('refuses to accept work that is already under way', async () => {
    const { service } = createService({
      jobs: [ok(job({ status: 'in_progress' }))],
    });
    await expect(service.accept(provider, 'j1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('JobsService.decline', () => {
  it('cancels a confirmed booking and refunds the client', async () => {
    const { service, cancelForJob, calls } = createService({
      jobs: [
        ok(job({ status: 'confirmed' })),
        ok(job({ status: 'cancelled' })),
      ],
      notifications: [ok(null)],
    });

    await service.decline(provider, 'j1', { reason: 'Double booked' });

    expect(cancelForJob).toHaveBeenCalledWith('j1');
    const notification = calls.find((c) => c.table === 'notifications');
    expect(notification?.args[0]).toMatchObject({
      recipient_id: 'c1',
      body: expect.stringContaining('Double booked'),
    });
  });

  it('refuses once work has started — that is a cancellation or a dispute', async () => {
    const { service } = createService({
      jobs: [ok(job({ status: 'in_progress' }))],
    });
    await expect(
      service.decline(provider, 'j1', { reason: 'Changed my mind' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('JobsService.start', () => {
  it('accepts a confirmed job', async () => {
    const { service, calls } = createService({
      jobs: [
        ok(job({ status: 'confirmed' })),
        ok(job({ status: 'in_progress' })),
      ],
      notifications: [ok(null)],
    });

    await service.start(provider, 'j1');

    const update = calls.find(
      (c) => c.table === 'jobs' && c.method === 'update',
    );
    expect(update?.args[0]).toEqual({ status: 'in_progress' });
  });
});

describe('JobsService.updateTask', () => {
  it('stamps completed_at alongside is_done', async () => {
    const { service, calls } = createService({
      jobs: [ok(job({ status: 'in_progress' })), ok(job())],
      job_tasks: [ok({ id: 't1' })],
    });

    await service.updateTask(provider, 'j1', 't1', { is_done: true });

    const update = calls.find((c) => c.table === 'job_tasks');
    expect(update?.args[0]).toMatchObject({ is_done: true });
    expect(
      (update?.args[0] as { completed_at: string | null }).completed_at,
    ).toEqual(expect.any(String));
  });

  it('clears completed_at when an item is un-ticked', async () => {
    const { service, calls } = createService({
      jobs: [ok(job({ status: 'in_progress' })), ok(job())],
      job_tasks: [ok({ id: 't1' })],
    });

    await service.updateTask(provider, 'j1', 't1', { is_done: false });

    const update = calls.find((c) => c.table === 'job_tasks');
    expect(update?.args[0]).toEqual({ is_done: false, completed_at: null });
  });

  it('refuses before the provider has accepted the booking', async () => {
    const { service } = createService({ jobs: [ok(job())] });
    await expect(
      service.updateTask(provider, 'j1', 't1', { is_done: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a task id that belongs to another job', async () => {
    const { service } = createService({
      jobs: [ok(job({ status: 'in_progress' }))],
      job_tasks: [ok(null)],
    });
    await expect(
      service.updateTask(provider, 'j1', 't2', { is_done: true }),
    ).rejects.toThrow('Task not found');
  });
});

describe('JobsService.create', () => {
  const client = { id: 'c1', full_name: 'Client One' } as Profile;
  const dto = {
    category_id: 1,
    title: 'Deep clean',
    description: 'A description long enough to pass validation.',
    address: 'Lipa City',
    latitude: 14,
    longitude: 121,
  };

  it('writes the chosen checklist in the order the client arranged it', async () => {
    const { service, calls } = createService({
      jobs: [ok({ id: 'j1' }), ok({ id: 'j1', job_tasks: [] })],
      job_tasks: [ok(null)],
    });

    await service.create(client, { ...dto, tasks: ['Sweep', 'Mop'] });

    const insert = calls.find((c) => c.table === 'job_tasks');
    expect(insert?.args[0]).toEqual([
      { job_id: 'j1', label: 'Sweep', position: 0 },
      { job_id: 'j1', label: 'Mop', position: 1 },
    ]);
  });

  it('still returns the job when the checklist write fails', async () => {
    const { service } = createService({
      jobs: [ok({ id: 'j1' })],
      job_tasks: [{ data: null, error: { message: 'boom' } }],
    });

    await expect(
      service.create(client, { ...dto, tasks: ['Sweep'] }),
    ).resolves.toMatchObject({ id: 'j1' });
  });
});

describe('JobsService review flag', () => {
  const client = { id: 'c1', role: 'client' } as Profile;

  it('flattens the embedded review and says so on the job', async () => {
    // Without this, "has the client already reviewed?" could only be answered
    // by submitting a second review and reading the error.
    const review = { id: 'r1', rating: 5, comment: 'Great', created_at: 'x' };
    const { service } = createService({
      jobs: [ok(job({ status: 'completed', reviews: review }))],
    });

    const result = (await service.getById(client, 'j1')) as Record<
      string,
      unknown
    >;

    expect(result.has_review).toBe(true);
    expect(result.review).toEqual(review);
    // The raw embed is dropped so no screen learns to read two shapes.
    expect(result.reviews).toBeUndefined();
  });

  it('accepts the array shape PostgREST falls back to', async () => {
    const review = { id: 'r1', rating: 4, comment: null, created_at: 'x' };
    const { service } = createService({
      jobs: [ok(job({ status: 'completed', reviews: [review] }))],
    });

    const result = (await service.getById(client, 'j1')) as Record<
      string,
      unknown
    >;

    expect(result).toMatchObject({ has_review: true, review });
  });

  it('reports false for an unreviewed job', async () => {
    const { service } = createService({
      jobs: [ok(job({ status: 'completed', reviews: null }))],
    });

    const result = (await service.getById(client, 'j1')) as Record<
      string,
      unknown
    >;

    expect(result).toMatchObject({ has_review: false, review: null });
  });

  it('flags every row of a list, not just a fetched one', async () => {
    const { service } = createService({
      jobs: [
        ok([
          job({ id: 'j1', reviews: { id: 'r1' } }),
          job({ id: 'j2', reviews: null }),
        ]),
      ],
    });

    const result = (await service.mine(client)) as Record<string, unknown>[];

    expect(result.map((j) => j.has_review)).toEqual([true, false]);
  });
});

describe('CreateJobDto scheduled_at', () => {
  const validate = (value: unknown) =>
    new IsNotPastInstantConstraint().validate(value);

  it('rejects a start time that has already been and gone', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(validate(yesterday)).toBe(false);
  });

  it('accepts a future start time', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    expect(validate(tomorrow)).toBe(true);
  });

  it('tolerates the seconds between tapping Post and the request landing', () => {
    const aMomentAgo = new Date(Date.now() - 30_000).toISOString();
    expect(validate(aMomentAgo)).toBe(true);
  });

  it('leaves malformed values to @IsISO8601 to report', () => {
    expect(validate('not a date')).toBe(true);
    expect(validate(undefined)).toBe(true);
  });
});

describe('JobsService.complete', () => {
  it('pays the provider out of escrow and tells them the job closed', async () => {
    const { service, calls, releaseIfHeld } = createService({
      jobs: [
        ok(job({ client_id: 'c1', status: 'in_progress' })),
        ok(job({ status: 'completed' })),
      ],
      notifications: [ok(null)],
    });

    await service.complete({ id: 'c1' } as Profile, 'j1');

    // `releaseIfHeld`, not `release`: a job posted without a budget has no
    // escrow row and a disputed one is an admin's to decide, but an
    // already-released hold reached a second time must still raise.
    expect(releaseIfHeld).toHaveBeenCalledWith('j1');
    expect(
      calls.find((c) => c.table === 'jobs' && c.method === 'update')?.args[0],
    ).toEqual({ status: 'completed' });
  });

  it('refuses to complete a job that is not under way', async () => {
    const { service, releaseIfHeld } = createService({
      jobs: [ok(job({ client_id: 'c1', status: 'completed' }))],
    });

    await expect(
      service.complete({ id: 'c1' } as Profile, 'j1'),
    ).rejects.toThrow(/Cannot complete a job in status 'completed'/);
    expect(releaseIfHeld).not.toHaveBeenCalled();
  });

  it('refuses a job the caller does not own', async () => {
    const { service, releaseIfHeld } = createService({
      jobs: [ok(job({ client_id: 'someone-else', status: 'in_progress' }))],
    });

    await expect(
      service.complete({ id: 'c1' } as Profile, 'j1'),
    ).rejects.toThrow(ForbiddenException);
    expect(releaseIfHeld).not.toHaveBeenCalled();
  });
});

describe('JobsService.browse', () => {
  it('drops jobs outside the radius and keeps the ones inside it', async () => {
    const { service } = createService({
      jobs: [
        ok([openJob({ id: 'near', ...QC }), openJob({ id: 'far', ...FAR })]),
      ],
    });

    const { jobs } = await service.browse({ ...QC, radius_km: 50 });

    expect(jobs.map((j: any) => j.id)).toEqual(['near']);
  });

  it('measures the radius as a boundary, not a rounding', async () => {
    // ~111 km apart. A 120 km radius includes it; a 100 km one does not, and
    // the same pair of points has to answer both ways.
    const inside = await createService({
      jobs: [ok([openJob({ id: 'far', ...FAR })])],
    }).service.browse({ ...QC, radius_km: 120 });
    const outside = await createService({
      jobs: [ok([openJob({ id: 'far', ...FAR })])],
    }).service.browse({ ...QC, radius_km: 100 });

    expect(inside.jobs).toHaveLength(1);
    expect(outside.jobs).toHaveLength(0);
  });

  it('keeps a job whose own coordinates are missing', async () => {
    // Distance is unknowable, not infinite. Hiding it would silently drop
    // every job posted before coordinates were required.
    const { service } = createService({
      jobs: [ok([openJob({ id: 'nowhere', latitude: null, longitude: null })])],
    });

    const { jobs } = await service.browse({ ...QC, radius_km: 1 });

    expect(jobs.map((j: any) => j.id)).toEqual(['nowhere']);
    expect(jobs[0].distance_km).toBeNull();
  });

  it('does not filter by distance at all when the provider sends no location', async () => {
    const { service } = createService({
      jobs: [
        ok([openJob({ id: 'near', ...QC }), openJob({ id: 'far', ...FAR })]),
      ],
    });

    const { jobs } = await service.browse({});

    expect(jobs.map((j: any) => j.id)).toEqual(['near', 'far']);
    expect(jobs[0].distance_km).toBeNull();
  });

  it('ranks urgent work first, then the nearest of equal urgency', async () => {
    const { service } = createService({
      jobs: [
        ok([
          openJob({ id: 'normal-near', urgency: 'normal', ...QC }),
          openJob({ id: 'urgent-far', urgency: 'urgent', ...FAR }),
          openJob({ id: 'urgent-near', urgency: 'urgent', ...QC }),
          openJob({ id: 'flexible-near', urgency: 'flexible', ...QC }),
        ]),
      ],
    });

    const { jobs } = await service.browse({ ...QC, radius_km: 500 });

    expect(jobs.map((j: any) => j.id)).toEqual([
      'urgent-near',
      'urgent-far',
      'normal-near',
      'flexible-near',
    ]);
  });

  it('falls back to newest first when urgency and distance both tie', async () => {
    const { service } = createService({
      jobs: [
        ok([
          openJob({ id: 'older', posted_at: '2026-08-01T00:00:00Z', ...QC }),
          openJob({ id: 'newer', posted_at: '2026-08-09T00:00:00Z', ...QC }),
        ]),
      ],
    });

    const { jobs } = await service.browse({ ...QC });

    expect(jobs.map((j: any) => j.id)).toEqual(['newer', 'older']);
  });

  it('summarises the whole filtered set, not the page being returned', async () => {
    // The feed header says "3 jobs near you"; paging to the second page must
    // not make that number shrink.
    const { service } = createService({
      jobs: [
        ok([
          openJob({ id: 'a', urgency: 'urgent', budget: 1000, ...QC }),
          openJob({ id: 'b', urgency: 'normal', budget: 500, ...QC }),
          openJob({ id: 'c', urgency: 'urgent', budget: 250, ...QC }),
        ]),
      ],
    });

    const { jobs, summary } = await service.browse({ ...QC, limit: 1 });

    expect(jobs).toHaveLength(1);
    expect(summary).toEqual({
      open_count: 3,
      urgent_count: 2,
      potential_payout: 1750,
    });
  });

  it('only ever offers open and recommending work', async () => {
    // Assigned jobs are somebody's booking; the filter is in SQL, so this
    // asserts the query rather than the result.
    const { service, calls } = createService({ jobs: [ok([])] });

    await service.browse({});

    expect(calls.find((c) => c.method === 'in')?.args).toEqual([
      'status',
      ['open', 'recommending'],
    ]);
  });

  it('reports every job as unreviewed on the feed', async () => {
    const { service } = createService({
      jobs: [ok([openJob({ reviews: null })])],
    });

    const { jobs } = await service.browse({});

    expect(jobs[0].has_review).toBe(false);
  });
});
