import { EscrowService } from './escrow.service';
import { XenditRequestError, XenditService } from '../payments/xendit.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';

/**
 * Provider payouts through Xendit: claim before send, accepted is not paid,
 * only a definite refusal fails, unknown outcomes are looked up, and
 * callbacks/lookups settle the row.
 */

type Result = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};
const ok = (data: unknown): Result => ({ data, error: null });
const counted = (count: number): Result => ({ data: null, error: null, count });

function createSupabaseMock(results: Record<string, Result[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = results[table]?.shift() ?? {
      data: null,
      error: { message: `no mock result for table '${table}'` },
    };
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'update',
      'insert',
      'eq',
      'or',
      'like',
      'gte',
      'order',
      'range',
      'limit',
    ]) {
      builder[method] = jest.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (resolve: (v: Result) => unknown) =>
      Promise.resolve(result).then(resolve);
    return builder;
  });
  const rpc = jest.fn(() => Promise.resolve({ data: null, error: null }));
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
    rpc,
  };
}

const updates = (calls: { table: string; method: string; args: unknown[] }[]) =>
  calls
    .filter((c) => c.table === 'wallet_transactions' && c.method === 'update')
    .map((c) => c.args[0]);

function build(
  results: Record<string, Result[]>,
  xendit: Partial<Record<keyof XenditService, unknown>> = {},
) {
  const { supabase, calls, rpc } = createSupabaseMock(results);
  const fake = {
    configured: true,
    sendPayout: jest.fn(),
    findPayoutByReference: jest.fn().mockResolvedValue(null),
    ...xendit,
  } as unknown as XenditService;
  const service = new EscrowService(
    supabase,
    {} as ConnectPayoutsService,
    fake,
  );
  return {
    service,
    calls,
    rpc,
    xendit: fake as unknown as Record<string, jest.Mock>,
  };
}

const queued = { id: 'w1', profile_id: 'p1', amount: 450, title: 'Payout' };
const account = {
  channel_code: 'PH_GCASH',
  account_name: 'Ana',
  account_number: '09170000000',
  updated_at: '2026-10-18T00:00:00Z',
};
const pendingRow = (note: string | null = 'Sending via Xendit (in flight)') =>
  ok({ id: 'w1', profile_id: 'p1', status: 'pending', review_note: note });

describe('EscrowService.sendQueuedPayouts', () => {
  it('claims a queued payout, sends it, and keeps it pending once accepted', async () => {
    const { service, calls, xendit } = build(
      {
        wallet_transactions: [
          ok([queued]), // queued rows
          counted(0), // refusals for this account
          ok({ id: 'w1' }), // claim
          pendingRow(), // result read
          ok(null), // accepted note
        ],
        linked_payout_accounts: [ok(account)],
      },
      {
        sendPayout: jest
          .fn()
          .mockResolvedValue({ id: 'po_1', status: 'ACCEPTED' }),
      },
    );

    expect(await service.sendQueuedPayouts('p1')).toBe(1);

    expect(xendit.sendPayout).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: 'w1', amount: 450 }),
    );
    expect(updates(calls)).toEqual([
      { review_note: 'Sending via Xendit (in flight)' },
      { review_note: 'XENDIT-po_1' },
    ]);
  });

  it('skips a payout another sender already claimed', async () => {
    const { service, xendit } = build({
      wallet_transactions: [ok([queued]), counted(0), ok(null)],
      linked_payout_accounts: [ok(account)],
    });

    expect(await service.sendQueuedPayouts('p1')).toBe(0);
    expect(xendit.sendPayout).not.toHaveBeenCalled();
  });

  it('fails a payout Xendit definitely refused, and tells the provider', async () => {
    const { service, calls } = build(
      {
        wallet_transactions: [
          ok([queued]),
          counted(0),
          ok({ id: 'w1' }),
          ok([{ id: 'w1' }]),
        ],
        linked_payout_accounts: [ok(account)],
        notifications: [ok(null)],
      },
      {
        sendPayout: jest
          .fn()
          .mockRejectedValue(new XenditRequestError('invalid account', 400)),
      },
    );

    await service.sendQueuedPayouts('p1');

    expect(updates(calls)).toEqual([
      { review_note: 'Sending via Xendit (in flight)' },
      { status: 'failed', review_note: 'Xendit: invalid account' },
    ]);
    expect(
      calls.some((c) => c.table === 'notifications' && c.method === 'insert'),
    ).toBe(true);
  });

  it.each([
    ['a timeout', new Error('fetch failed')],
    ['a 5xx', new XenditRequestError('server error', 503)],
    ['a rate limit', new XenditRequestError('slow down', 429)],
    [
      'a duplicate error',
      new XenditRequestError('already exists', 400, 'DUPLICATE_ERROR'),
    ],
  ])(
    'requeues the same row after %s when Xendit has no such payout',
    async (_n, err) => {
      const { service, calls, xendit } = build(
        {
          wallet_transactions: [
            ok([queued]),
            counted(0),
            ok({ id: 'w1' }),
            ok(null),
          ],
          linked_payout_accounts: [ok(account)],
        },
        { sendPayout: jest.fn().mockRejectedValue(err) },
      );

      await service.sendQueuedPayouts('p1');

      expect(xendit.findPayoutByReference).toHaveBeenCalledWith('w1');
      expect(updates(calls)).toEqual([
        { review_note: 'Sending via Xendit (in flight)' },
        { review_note: 'Sending via Xendit' },
      ]);
    },
  );

  it('completes, not fails, a duplicate whose first attempt succeeded', async () => {
    const { service, calls } = build(
      {
        wallet_transactions: [
          ok([queued]),
          counted(0),
          ok({ id: 'w1' }),
          pendingRow(),
          ok([{ id: 'w1' }]),
        ],
        linked_payout_accounts: [ok(account)],
      },
      {
        sendPayout: jest
          .fn()
          .mockRejectedValue(
            new XenditRequestError('already exists', 400, 'DUPLICATE_ERROR'),
          ),
        findPayoutByReference: jest.fn().mockResolvedValue({
          payoutId: 'po_1',
          referenceId: 'w1',
          status: 'SUCCEEDED',
          failureCode: null,
        }),
      },
    );

    await service.sendQueuedPayouts('p1');

    expect(updates(calls)).toEqual([
      { review_note: 'Sending via Xendit (in flight)' },
      { status: 'completed', review_note: 'XENDIT-po_1' },
    ]);
  });

  it('stops retrying an account Xendit keeps refusing until it changes', async () => {
    const { service, calls, xendit } = build({
      wallet_transactions: [ok([queued]), counted(3)],
      linked_payout_accounts: [ok(account)],
    });

    expect(await service.sendQueuedPayouts('p1')).toBe(0);

    expect(xendit.sendPayout).not.toHaveBeenCalled();
    expect(updates(calls)).toEqual([]);
    expect(
      calls.some(
        (c) =>
          c.method === 'gte' &&
          c.args[0] === 'created_at' &&
          c.args[1] === account.updated_at,
      ),
    ).toBe(true);
  });
});

describe('EscrowService.applyPayoutResult', () => {
  const result = (status: string, failureCode: string | null = null) => ({
    payoutId: 'po_1',
    referenceId: 'w1',
    status,
    failureCode,
  });

  it('completes a pending payout when Xendit reports success', async () => {
    const { service, calls } = build({
      wallet_transactions: [pendingRow('XENDIT-po_1'), ok([{ id: 'w1' }])],
    });

    await service.applyPayoutResult(result('SUCCEEDED'));

    expect(updates(calls)).toEqual([
      { status: 'completed', review_note: 'XENDIT-po_1' },
    ]);
  });

  it.each([
    ['FAILED', 'INVALID_DESTINATION', 'Xendit: INVALID_DESTINATION'],
    ['COMPLIANCE_REJECTED', null, 'Xendit: COMPLIANCE_REJECTED'],
  ])('fails a pending payout on %s', async (status, code, note) => {
    const { service, calls } = build({
      wallet_transactions: [pendingRow('XENDIT-po_1'), ok([{ id: 'w1' }])],
      notifications: [ok(null)],
    });

    await service.applyPayoutResult(result(status, code));

    expect(updates(calls)).toEqual([{ status: 'failed', review_note: note }]);
  });

  it('ignores an update for a different payout than the row holds', async () => {
    const { service, calls } = build({
      wallet_transactions: [pendingRow('XENDIT-po_other')],
    });

    await service.applyPayoutResult(result('FAILED'));

    expect(updates(calls)).toEqual([]);
  });

  it('ignores a repeated result for a payout that is already settled', async () => {
    const { service, calls, rpc } = build({
      wallet_transactions: [
        ok({
          id: 'w1',
          profile_id: 'p1',
          status: 'completed',
          review_note: 'XENDIT-po_1',
        }),
      ],
    });

    await service.applyPayoutResult(result('FAILED'));

    expect(updates(calls)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('alerts admins when a completed payout is reversed', async () => {
    const { service, calls, rpc } = build({
      wallet_transactions: [
        ok({
          id: 'w1',
          profile_id: 'p1',
          status: 'completed',
          review_note: 'XENDIT-po_1',
        }),
      ],
    });

    await service.applyPayoutResult(result('REVERSED'));

    expect(updates(calls)).toEqual([]);
    expect(rpc).toHaveBeenCalledWith(
      'write_admin_alert',
      expect.objectContaining({ p_event_key: 'payout_reversed:w1' }),
    );
  });
});

describe('EscrowService payout reconciliation (tick)', () => {
  it('requeues an in-flight payout Xendit never got and settles an accepted one', async () => {
    const { service, calls, xendit } = build(
      {
        wallet_transactions: [
          ok([
            { id: 'w1', review_note: 'Sending via Xendit (in flight)' },
            { id: 'w2', review_note: 'XENDIT-po_2' },
          ]),
          ok(null), // w1 back to queued
          ok({
            id: 'w2',
            profile_id: 'p2',
            status: 'pending',
            review_note: 'XENDIT-po_2',
          }),
          ok([{ id: 'w2' }]), // w2 completed
          ok([]), // no queued rows to send
        ],
      },
      {
        findPayoutByReference: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            payoutId: 'po_2',
            referenceId: 'w2',
            status: 'SUCCEEDED',
            failureCode: null,
          }),
      },
    );

    await service.sendQueuedPayouts();

    expect(xendit.findPayoutByReference).toHaveBeenCalledTimes(2);
    expect(updates(calls)).toEqual([
      { review_note: 'Sending via Xendit' },
      { status: 'completed', review_note: 'XENDIT-po_2' },
    ]);
  });

  it('reads the next page when a page is full, oldest first', async () => {
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `w${i}`,
        review_note: `XENDIT-po_${i}`,
      }));
    const { service, calls, xendit } = build({
      wallet_transactions: [ok(page(50)), ok(page(3)), ok([])],
    });

    await service.sendQueuedPayouts();

    expect(xendit.findPayoutByReference).toHaveBeenCalledTimes(53);
    const ranges = calls.filter((c) => c.method === 'range').map((c) => c.args);
    // Nothing settled (Xendit knew none), so the second page starts at 50.
    expect(ranges).toEqual([
      [0, 49],
      [50, 99],
    ]);
    expect(calls.find((c) => c.method === 'order')?.args).toEqual([
      'created_at',
      { ascending: true },
    ]);
  });
});

describe('XenditService payout parsing', () => {
  const xendit = new XenditService();

  it('reads a payout callback body', () => {
    expect(
      xendit.payoutUpdate({
        event: 'payout.failed',
        data: {
          id: 'po_1',
          reference_id: 'w1',
          status: 'failed',
          failure_code: 'INVALID_DESTINATION',
        },
      }),
    ).toEqual({
      payoutId: 'po_1',
      referenceId: 'w1',
      status: 'FAILED',
      failureCode: 'INVALID_DESTINATION',
    });
  });

  it('ignores a body that is not a payout', () => {
    expect(xendit.payoutUpdate({ id: 'inv_1', status: 'PAID' })).toBeNull();
    expect(xendit.payoutUpdate(null)).toBeNull();
  });

  it.each([
    [400, null, true],
    [404, null, true],
    [422, null, true],
    [400, 'DUPLICATE_ERROR', false],
    [409, null, false],
    [408, null, false],
    [429, null, false],
    [500, null, false],
  ])('treats HTTP %s (%s) as definite = %s', (status, code, definite) => {
    expect(new XenditRequestError('x', status, code).definite).toBe(definite);
  });
});

describe('XenditService.findPayoutByReference', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.XENDIT_SECRET_KEY;
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.XENDIT_SECRET_KEY;
    else process.env.XENDIT_SECRET_KEY = originalKey;
  });

  const payout = { id: 'po_1', reference_id: 'w1', status: 'SUCCEEDED' };

  it.each([
    ['a plain array', [payout]],
    ['a { data: [...] } envelope', { data: [payout], has_more: false }],
  ])('reads %s', async (_n, body) => {
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });

    await expect(
      new XenditService().findPayoutByReference('w1'),
    ).resolves.toEqual({
      payoutId: 'po_1',
      referenceId: 'w1',
      status: 'SUCCEEDED',
      failureCode: null,
    });
  });
});
