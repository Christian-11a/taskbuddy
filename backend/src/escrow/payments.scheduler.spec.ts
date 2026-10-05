import { PaymentsScheduler } from './payments.scheduler';
import type { EscrowService } from './escrow.service';
import type { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';
import type { SupabaseService } from '../supabase/supabase.service';

function build(rows: unknown[], error: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'lte', 'order', 'limit']) {
    builder[method] = jest.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown) => {
    const status = calls
      .filter((call) => call.method === 'eq' && call.args[0] === 'jobs.status')
      .slice(-1)[0]?.args[1];
    return Promise.resolve({
      data: rows.filter(
        (row) => (row as { jobs: { status: string } }).jobs.status === status,
      ),
      error,
    }).then(resolve);
  };
  const supabase = {
    admin: {
      from: jest.fn(() => builder),
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
    },
  } as unknown as SupabaseService;
  const escrow = {
    releaseIfHeld: jest.fn(() => Promise.resolve({ id: 'e1' })),
    cancelForJob: jest.fn(() => Promise.resolve({ id: 'e2' })),
  };
  const payouts = {
    sweep: jest.fn(() =>
      Promise.resolve({
        transferred: 0,
        failed: 0,
        not_eligible: 0,
        abandoned: 0,
        retry: 0,
        skipped: 0,
      }),
    ),
  };
  const scheduler = new PaymentsScheduler(
    supabase,
    escrow as unknown as EscrowService,
    payouts as unknown as ConnectPayoutsService,
  );
  jest.spyOn(scheduler['logger'], 'warn').mockImplementation(() => {});
  jest.spyOn(scheduler['logger'], 'error').mockImplementation(() => {});
  jest.spyOn(scheduler['logger'], 'log').mockImplementation(() => {});
  return { scheduler, escrow, payouts, calls };
}

describe('PaymentsScheduler.reconcileSettledJobs', () => {
  it('releases a held escrow on a completed job and refunds one on a cancelled job', async () => {
    const { scheduler, escrow, calls } = build([
      { id: 'e1', job_id: 'j1', jobs: { status: 'completed' } },
      { id: 'e2', job_id: 'j2', jobs: { status: 'cancelled' } },
    ]);

    const now = new Date('2026-10-04T00:00:00Z');
    expect(await scheduler.reconcileSettledJobs(now)).toBe(2);
    expect(escrow.releaseIfHeld).toHaveBeenCalledWith('j1');
    expect(escrow.cancelForJob).toHaveBeenCalledWith('j2');
    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'held'] });
    expect(calls).toContainEqual({
      method: 'lte',
      args: ['jobs.completed_at', '2026-10-01T00:00:00.000Z'],
    });
    expect(calls).toContainEqual({
      method: 'lte',
      args: ['jobs.updated_at', '2026-10-03T23:58:00.000Z'],
    });
    expect(calls).toContainEqual({
      method: 'order',
      args: ['held_at', { ascending: true }],
    });
  });

  it('keeps going when one escrow cannot be settled', async () => {
    const { scheduler, escrow } = build([
      { id: 'e1', job_id: 'j1', jobs: { status: 'completed' } },
      { id: 'e2', job_id: 'j2', jobs: { status: 'cancelled' } },
    ]);
    escrow.releaseIfHeld.mockRejectedValueOnce(new Error('409'));

    expect(await scheduler.reconcileSettledJobs()).toBe(1);
    expect(escrow.cancelForJob).toHaveBeenCalled();
  });
});

describe('PaymentsScheduler.tick', () => {
  it('reconciles, then sweeps transfers, and survives a failing read', async () => {
    const { scheduler, payouts } = build([], { message: 'db down' });

    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(payouts.sweep).not.toHaveBeenCalled();
  });

  it('does not overlap itself', async () => {
    const { scheduler, payouts } = build([]);
    let release!: () => void;
    payouts.sweep.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              transferred: 0,
              failed: 0,
              not_eligible: 0,
              abandoned: 0,
              retry: 0,
              skipped: 0,
            });
        }),
    );

    const first = scheduler.tick();
    await new Promise((resolve) => setImmediate(resolve));
    await scheduler.tick(); // skipped while the first is running
    release();
    await first;

    expect(payouts.sweep).toHaveBeenCalledTimes(1);
  });
});
