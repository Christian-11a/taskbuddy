import { EscrowService } from './escrow.service';
import { XenditRequestError, XenditService } from '../payments/xendit.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';

/**
 * Provider payouts through Xendit: claim before send, accepted is not paid,
 * only a definite refusal fails, and callbacks/lookups settle the row.
 */

type Result = { data: unknown; error: { message: string } | null };
const ok = (data: unknown): Result => ({ data, error: null });

function createSupabaseMock(results: Record<string, Result[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = results[table]?.shift() ?? {
      data: null,
      error: { message: `no mock result for table '${table}'` },
    };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'update', 'insert', 'eq', 'or', 'limit']) {
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
  return {
    supabase: { admin: { from } } as unknown as SupabaseService,
    calls,
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
  const { supabase, calls } = createSupabaseMock(results);
  const fake = {
    configured: true,
    sendPayout: jest.fn(),
    findPayoutByReference: jest.fn(),
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
    xendit: fake as unknown as Record<string, jest.Mock>,
  };
}

const queued = { id: 'w1', profile_id: 'p1', amount: 450, title: 'Payout' };
const account = {
  channel_code: 'PH_GCASH',
  account_name: 'Ana',
  account_number: '09170000000',
};

describe('EscrowService provider payouts', () => {
  it('claims a queued payout, sends it, and keeps it pending once accepted', async () => {
    const { service, calls, xendit } = build(
      {
        wallet_transactions: [
          ok([queued]), // queued rows
          ok({ id: 'w1' }), // claim
          ok({ id: 'w1', profile_id: 'p1', status: 'pending' }), // result read
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
      wallet_transactions: [ok([queued]), ok(null)],
    });

    expect(await service.sendQueuedPayouts('p1')).toBe(0);
    expect(xendit.sendPayout).not.toHaveBeenCalled();
  });

  it('fails a payout Xendit definitely refused, and tells the provider', async () => {
    const { service, calls } = build(
      {
        wallet_transactions: [
          ok([queued]),
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
  ])(
    'requeues the same row after %s instead of freeing the money',
    async (_n, err) => {
      const { service, calls } = build(
        {
          wallet_transactions: [ok([queued]), ok({ id: 'w1' }), ok(null)],
          linked_payout_accounts: [ok(account)],
        },
        { sendPayout: jest.fn().mockRejectedValue(err) },
      );

      await service.sendQueuedPayouts('p1');

      expect(updates(calls)).toEqual([
        { review_note: 'Sending via Xendit (in flight)' },
        { review_note: 'Sending via Xendit' },
      ]);
    },
  );

  it('completes a pending payout when Xendit reports success', async () => {
    const { service, calls } = build({
      wallet_transactions: [
        ok({ id: 'w1', profile_id: 'p1', status: 'pending' }),
        ok([{ id: 'w1' }]),
      ],
    });

    await service.applyPayoutResult({
      payoutId: 'po_1',
      referenceId: 'w1',
      status: 'SUCCEEDED',
      failureCode: null,
    });

    expect(updates(calls)).toEqual([
      { status: 'completed', review_note: 'XENDIT-po_1' },
    ]);
  });

  it('fails a pending payout on a failed result, with the failure code', async () => {
    const { service, calls } = build({
      wallet_transactions: [
        ok({ id: 'w1', profile_id: 'p1', status: 'pending' }),
        ok([{ id: 'w1' }]),
      ],
      notifications: [ok(null)],
    });

    await service.applyPayoutResult({
      payoutId: 'po_1',
      referenceId: 'w1',
      status: 'FAILED',
      failureCode: 'INVALID_DESTINATION',
    });

    expect(updates(calls)).toEqual([
      { status: 'failed', review_note: 'Xendit: INVALID_DESTINATION' },
    ]);
  });

  it('ignores a repeated result for a payout that is already settled', async () => {
    const { service, calls } = build({
      wallet_transactions: [
        ok({ id: 'w1', profile_id: 'p1', status: 'completed' }),
      ],
    });

    await service.applyPayoutResult({
      payoutId: 'po_1',
      referenceId: 'w1',
      status: 'FAILED',
      failureCode: null,
    });

    expect(updates(calls)).toEqual([]);
  });

  it('reconciles: requeues an in-flight payout Xendit never got, settles an accepted one', async () => {
    const { service, calls, xendit } = build(
      {
        wallet_transactions: [
          ok([
            { id: 'w1', review_note: 'Sending via Xendit (in flight)' },
            { id: 'w2', review_note: 'XENDIT-po_2' },
          ]),
          ok(null), // w1 back to queued
          ok({ id: 'w2', profile_id: 'p2', status: 'pending' }),
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
          status: 'FAILED',
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
    [400, true],
    [404, true],
    [422, true],
    [408, false],
    [409, false],
    [429, false],
    [500, false],
  ])('treats HTTP %s as definite = %s', (status, definite) => {
    expect(new XenditRequestError('x', status).definite).toBe(definite);
  });
});
