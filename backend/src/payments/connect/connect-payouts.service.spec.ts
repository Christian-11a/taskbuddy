import { NotFoundException } from '@nestjs/common';
import {
  ConnectPayoutsService,
  computeTransferAmount,
} from './connect-payouts.service';
import type { ConnectAccountsService } from './connect-accounts.service';
import type { StripeService } from '../stripe.service';
import type { SupabaseService } from '../../supabase/supabase.service';
import type { AdminActionsService } from '../../admin/admin-actions.service';
import type { Profile } from '../../common/types';

/**
 * The end-to-end payout paths (transferred, not eligible, refused then swept,
 * withdrawn by hand, dispute) run in `job-lifecycle.spec.ts` against the
 * shared in-memory store. This covers the arithmetic and the branches that
 * need a Stripe answer the fake there does not give.
 */

describe('computeTransferAmount', () => {
  it.each([
    // [label, input, expected minor units]
    [
      'a USD-settled charge: the net share of what the charge settled for',
      {
        settlementCurrency: 'usd',
        settledAmountMinor: 2700,
        chargeAmountMinor: 150000,
        netPhp: 1500,
      },
      2700,
    ],
    [
      'commission withheld: the same fraction of the settled amount',
      {
        settlementCurrency: 'usd',
        settledAmountMinor: 2700,
        chargeAmountMinor: 150000,
        netPhp: 1275,
      },
      2295,
    ],
    [
      'floors rather than overpaying by rounding',
      {
        settlementCurrency: 'usd',
        settledAmountMinor: 1001,
        chargeAmountMinor: 100000,
        netPhp: 333.33,
      },
      333,
    ],
    [
      'a PHP-settled platform: exactly the net in centavos',
      {
        settlementCurrency: 'php',
        settledAmountMinor: 150000,
        chargeAmountMinor: 150000,
        netPhp: 1275.5,
      },
      127550,
    ],
    [
      'never more than the charge settled for',
      {
        settlementCurrency: 'usd',
        settledAmountMinor: 2700,
        chargeAmountMinor: 150000,
        netPhp: 2000,
      },
      2700,
    ],
    [
      'nothing when commission took it all',
      {
        settlementCurrency: 'usd',
        settledAmountMinor: 2700,
        chargeAmountMinor: 150000,
        netPhp: 0,
      },
      0,
    ],
  ])('%s', (_label, input, expected) => {
    expect(computeTransferAmount(input)).toBe(expected);
  });
});

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

function createSupabaseMock(
  resultsByTable: Record<string, QueryResult[]>,
  rpcResults: QueryResult[] = [],
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table]?.shift() ?? {
      data: null,
      error: null,
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
      'order',
      'limit',
    ]) {
      builder[method] = chain(method);
    }
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  const rpc = jest.fn(() =>
    Promise.resolve(rpcResults.shift() ?? { data: null, error: null }),
  );
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
    rpc,
  };
}

const escrow = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  job_id: 'j1',
  provider_id: 'p1',
  amount: 1500,
  commission_amount: 0,
  status: 'released',
  funding_method: 'card',
  funding_charge_id: 'ch_1',
  transfer_status: 'pending',
  transfer_attempts: 0,
  ...overrides,
});

const payable = {
  profile_id: 'p1',
  stripe_account_id: 'acct_p1',
  transfers_active: true,
  payouts_enabled: true,
};

function build(
  tables: Record<string, QueryResult[]>,
  options: {
    rpc?: QueryResult[];
    account?: unknown;
    create?: jest.Mock;
    list?: jest.Mock;
  } = {},
) {
  const { supabase, calls, rpc } = createSupabaseMock(tables, options.rpc);
  const stripe = {
    charges: {
      retrieve: jest.fn(() =>
        Promise.resolve({
          id: 'ch_1',
          amount: 150000,
          balance_transaction: { amount: 2700, currency: 'usd' },
        }),
      ),
    },
    transfers: {
      list: options.list ?? jest.fn(() => Promise.resolve({ data: [] })),
      create:
        options.create ??
        jest.fn(() =>
          Promise.resolve({ id: 'tr_1', amount: 2700, currency: 'usd' }),
        ),
    },
  };
  const accounts = {
    findByProfile: jest.fn(() =>
      Promise.resolve(
        options.account === undefined ? payable : options.account,
      ),
    ),
  } as unknown as ConnectAccountsService;
  const record = jest.fn(() => Promise.resolve());
  const service = new ConnectPayoutsService(
    supabase,
    { stripe } as unknown as StripeService,
    accounts,
    { record } as unknown as AdminActionsService,
  );
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
  jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
  return { service, calls, rpc, stripe, record };
}

const reservation = { data: { id: 'w1', status: 'pending' }, error: null };

describe('ConnectPayoutsService.processEscrow', () => {
  it('sends the transfer sourced from the charge, under a per-attempt idempotency key', async () => {
    const { service, stripe } = build(
      { escrow_transactions: [{ data: escrow(), error: null }] },
      { rpc: [reservation] },
    );

    expect(await service.processEscrow('e1')).toBe('transferred');
    expect(stripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2700,
        currency: 'usd',
        destination: 'acct_p1',
        source_transaction: 'ch_1',
        transfer_group: 'job:j1',
        metadata: expect.objectContaining({ escrow_id: 'e1' }),
      }),
      expect.objectContaining({ idempotencyKey: 'escrow-transfer:e1:0' }),
    );
  });

  it('adopts a transfer an earlier attempt made but never recorded', async () => {
    const list = jest.fn(() =>
      Promise.resolve({
        data: [
          {
            id: 'tr_old',
            amount: 2700,
            currency: 'usd',
            reversed: false,
            metadata: { escrow_id: 'e1' },
          },
        ],
      }),
    );
    const { service, stripe, calls } = build(
      { escrow_transactions: [{ data: escrow(), error: null }] },
      { rpc: [reservation], list },
    );

    expect(await service.processEscrow('e1')).toBe('transferred');
    expect(stripe.transfers.create).not.toHaveBeenCalled();
    expect(
      calls.find(
        (c) => c.table === 'wallet_transactions' && c.method === 'update',
      )?.args[0],
    ).toEqual({ status: 'completed', stripe_transfer_id: 'tr_old' });
  });

  it('leaves everything pending on an error it cannot classify, for a same-key retry', async () => {
    const create = jest.fn(() =>
      Promise.reject(
        Object.assign(new Error('socket hang up'), {
          type: 'StripeConnectionError',
        }),
      ),
    );
    const { service, calls } = build(
      { escrow_transactions: [{ data: escrow(), error: null }] },
      { rpc: [reservation], create },
    );

    expect(await service.processEscrow('e1')).toBe('retry');
    // Stripe may have made the transfer: the reservation must stay reserved.
    expect(
      calls.some(
        (c) => c.table === 'wallet_transactions' && c.method === 'update',
      ),
    ).toBe(false);
    const escrowUpdate = calls.find(
      (c) => c.table === 'escrow_transactions' && c.method === 'update',
    );
    expect(escrowUpdate?.args[0]).not.toHaveProperty('transfer_status');
    expect(escrowUpdate?.args[0]).not.toHaveProperty('transfer_attempts');
  });

  it('gives up after the last definitive refusal, and says so to the provider', async () => {
    const create = jest.fn(() =>
      Promise.reject(
        Object.assign(new Error('Account closed'), {
          type: 'StripeInvalidRequestError',
        }),
      ),
    );
    const { service, calls } = build(
      {
        escrow_transactions: [
          {
            data: escrow({ transfer_status: 'failed', transfer_attempts: 2 }),
            error: null,
          },
          { data: { id: 'e1' }, error: null },
        ],
      },
      { rpc: [reservation], create },
    );

    expect(await service.processEscrow('e1')).toBe('abandoned');
    expect(
      calls.find(
        (c) => c.table === 'escrow_transactions' && c.method === 'update',
      )?.args[0],
    ).toMatchObject({ transfer_status: 'abandoned', transfer_attempts: 3 });
    expect(
      calls.find(
        (c) => c.table === 'wallet_transactions' && c.method === 'update',
      )?.args[0],
    ).toMatchObject({ status: 'failed' });
  });

  it('skips a wallet-funded escrow — its payout stays in the wallet', async () => {
    const { service, stripe } = build({
      escrow_transactions: [
        {
          data: escrow({ funding_method: 'wallet', transfer_status: 'none' }),
          error: null,
        },
      ],
    });

    expect(await service.processEscrow('e1')).toBe('skipped');
    expect(stripe.charges.retrieve).not.toHaveBeenCalled();
  });

  it('never throws, whatever breaks', async () => {
    const { service } = build({
      escrow_transactions: [{ data: null, error: { message: 'db down' } }],
    });

    await expect(service.processEscrow('e1')).resolves.toBe('retry');
  });
});

describe('ConnectPayoutsService.sweep', () => {
  it('honours the backoff on failed transfers and picks up stale pending ones', async () => {
    const now = new Date('2026-09-16T12:00:00Z');
    const minutesAgo = (m: number) =>
      new Date(now.getTime() - m * 60_000).toISOString();
    const { service } = build({
      escrow_transactions: [
        {
          data: [
            // failed once, 30 min ago: backoff is 1h — wait
            {
              id: 'a',
              transfer_status: 'failed',
              transfer_attempts: 1,
              transfer_attempted_at: minutesAgo(30),
            },
            // failed once, 2h ago — due
            {
              id: 'b',
              transfer_status: 'failed',
              transfer_attempts: 1,
              transfer_attempted_at: minutesAgo(120),
            },
            // pending, touched 1 min ago — the inline attempt may still be running
            {
              id: 'c',
              transfer_status: 'pending',
              transfer_attempts: 0,
              transfer_attempted_at: minutesAgo(1),
            },
            // pending, never attempted — due
            {
              id: 'd',
              transfer_status: 'pending',
              transfer_attempts: 0,
              transfer_attempted_at: null,
            },
          ],
          error: null,
        },
      ],
    });
    const attempted: string[] = [];
    jest.spyOn(service, 'processEscrow').mockImplementation((id: string) => {
      attempted.push(id);
      return Promise.resolve('transferred');
    });

    await service.sweep(now);

    expect(attempted).toEqual(['b', 'd']);
  });
});

describe('ConnectPayoutsService.retryForAdmin', () => {
  const admin = { id: 'a1', role: 'admin' } as Profile;

  it('re-queues a parked transfer, keeps its attempt count, and audits it', async () => {
    const { service, calls, record } = build({
      escrow_transactions: [
        { data: { id: 'e1', transfer_attempts: 3 }, error: null },
      ],
    });
    jest.spyOn(service, 'processEscrow').mockResolvedValue('transferred');

    await expect(service.retryForAdmin(admin, 'e1')).resolves.toEqual({
      outcome: 'transferred',
    });
    const update = calls.find(
      (c) => c.table === 'escrow_transactions' && c.method === 'update',
    );
    // Not reset: the key includes it, and Stripe caches a refusal per key.
    expect(update?.args[0]).toEqual({
      transfer_status: 'pending',
      transfer_last_error: null,
    });
    expect(record).toHaveBeenCalledWith(
      admin,
      'escrow.retry_transfer',
      'escrow_transactions',
      'e1',
      { attempts_so_far: 3 },
    );
  });

  it('is a 404 for anything that is not a parked card-funded transfer', async () => {
    const { service, record } = build({
      escrow_transactions: [{ data: null, error: null }],
    });

    await expect(service.retryForAdmin(admin, 'e1')).rejects.toThrow(
      NotFoundException,
    );
    expect(record).not.toHaveBeenCalled();
  });
});
