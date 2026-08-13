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
  const release = jest.fn().mockResolvedValue(undefined);
  const escrow = { cancelForJob, release } as unknown as EscrowService;
  return {
    service: new JobsService(supabase, uploads, escrow),
    calls,
    cancelForJob,
    release,
  };
}

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
