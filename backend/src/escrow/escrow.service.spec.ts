import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EscrowService, type EscrowRow } from './escrow.service';
import { DisputesService } from './disputes.service';
import {
  EscrowConflictError,
  InsufficientBalanceError,
  isMoneyRefusal,
  moneyError,
} from './escrow-errors';
import type { SupabaseService } from '../supabase/supabase.service';
import type { AdminActionsService } from '../admin/admin-actions.service';
import type { ConnectPayoutsService } from '../payments/connect/connect-payouts.service';
import type { Profile } from '../common/types';

/**
 * Since migration 0028 every escrow move is one SQL function that changes the
 * escrow row and writes its ledger row together. What those functions do to
 * the ledger — who is debited, the refund that happens once, the payout net of
 * commission — is tested against real Postgres in `test/sql/money.test.mjs`.
 *
 * What is tested here is this service's half of the contract: which function
 * it calls for which move, with what arguments (the commission it computed,
 * the ledger line it wrote), and what it does with the answer — a lost race
 * that is an error for some callers and quiet for others, and the SQLSTATEs
 * that become typed exceptions.
 */

function createAdminActionsMock() {
  const record = jest.fn().mockResolvedValue(undefined);
  return { mock: { record } as unknown as AdminActionsService, record };
}

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
};

/** Table reads consumed per `.from()`, RPC results consumed per function name. */
function createSupabaseMock(
  resultsByTable: Record<string, QueryResult[]>,
  rpcResults: Record<string, QueryResult[]> = {},
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const rpc = jest.fn((fn: string, _args?: Record<string, unknown>) =>
    Promise.resolve(
      rpcResults[fn]?.shift() ?? {
        data: null,
        error: { message: `no mock result for rpc '${fn}'` },
      },
    ),
  );
  const from = jest.fn((table: string) => {
    const result =
      resultsByTable[table]?.shift() ??
      // Every payOut reads the commission rate (0024) and every ledger line
      // names the job. Defaulting both means a test states only what it is
      // about.
      (table === 'platform_settings'
        ? { data: { commission_rate: 0 }, error: null }
        : table === 'jobs'
          ? { data: { title: 'Fix sink' }, error: null }
          : {
              data: null,
              error: { message: `no mock result for table '${table}'` },
            });
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
  return {
    supabase: { admin: { from, rpc } } as unknown as SupabaseService,
    calls,
    rpc,
  };
}

const heldEscrow: EscrowRow = {
  id: 'e1',
  job_id: 'j1',
  client_id: 'c1',
  provider_id: 'p1',
  amount: 1500,
  status: 'held',
  held_at: '2026-08-01T00:00:00Z',
  released_at: null,
  refunded_at: null,
  commission_amount: 0,
};

const ok = (data: unknown): QueryResult => ({ data, error: null });

/** The onward Stripe transfer (§29.5). Shared; reset before each test. */
const processEscrow = jest.fn((_id: string) => Promise.resolve('transferred'));
const payouts = { processEscrow } as unknown as ConnectPayoutsService;
beforeEach(() => processEscrow.mockClear());

const client = { id: 'c1', role: 'client' } as Profile;
const admin = { id: 'a1', role: 'admin' } as Profile;

/** The arguments of every call to one RPC, in order. */
function rpcArgs(rpc: jest.Mock, fn: string) {
  return rpc.mock.calls
    .filter(([name]) => name === fn)
    .map(([, args]) => args as Record<string, unknown>);
}

describe('EscrowService', () => {
  describe('listForAdmin', () => {
    it('uses a paginated transactions search RPC and returns its rows and exact total', async () => {
      const rows = [{ id: 'e1', jobs: { title: 'Fix sink' } }];
      const { supabase, calls, rpc } = createSupabaseMock(
        {},
        { admin_list_transactions: [ok([{ rows, total: 51 }])] },
      );
      const service = new EscrowService(supabase, payouts);

      await expect(
        service.listForAdmin({
          search: 'faucet',
          status: 'held',
          limit: 25,
          offset: 25,
        }),
      ).resolves.toEqual({ transactions: rows, total: 51 });
      expect(rpc).toHaveBeenCalledWith('admin_list_transactions', {
        p_search_term: 'faucet',
        p_status: 'held',
        p_limit: 25,
        p_offset: 25,
      });
      expect(calls).toEqual([]);
    });

    it('retains the exact transactions total when the requested page is empty', async () => {
      const { supabase } = createSupabaseMock(
        {},
        { admin_list_transactions: [ok([{ rows: [], total: 51 }])] },
      );
      const service = new EscrowService(supabase, payouts);

      await expect(
        service.listForAdmin({ limit: 25, offset: 100 }),
      ).resolves.toEqual({ transactions: [], total: 51 });
    });
  });

  describe('hold', () => {
    it('places a wallet-funded hold in one call and says it did', async () => {
      const { supabase, rpc, calls } = createSupabaseMock(
        {},
        { escrow_place_hold: [ok({ escrow: heldEscrow, placed: true })] },
      );
      const service = new EscrowService(supabase, payouts);

      const result = await service.hold('j1', 'p1');

      expect(result).toEqual({ escrow: heldEscrow, placed: true });
      expect(rpcArgs(rpc, 'escrow_place_hold')).toEqual([
        {
          p_job_id: 'j1',
          p_provider_id: 'p1',
          p_funding_method: 'wallet',
          p_payment_intent_id: null,
          p_charge_id: null,
        },
      ]);
      // No separate escrow insert or ledger write: both happen inside the
      // function, in one transaction.
      expect(calls).toEqual([]);
    });

    it('records the card payment behind a card-funded hold', async () => {
      const { supabase, rpc } = createSupabaseMock(
        {},
        { escrow_place_hold: [ok({ escrow: heldEscrow, placed: true })] },
      );
      const service = new EscrowService(supabase, payouts);

      await service.hold('j1', 'p1', {
        paymentIntentId: 'pi_1',
        chargeId: 'ch_1',
      });

      expect(rpcArgs(rpc, 'escrow_place_hold')[0]).toMatchObject({
        p_funding_method: 'card',
        p_payment_intent_id: 'pi_1',
        p_charge_id: 'ch_1',
      });
    });

    it('passes on a retry that debited nobody as placed: false', async () => {
      // The load-bearing half: ApplicationsService.accept rolls back on
      // `placed`, and a true here would refund a hire that succeeded.
      const { supabase } = createSupabaseMock(
        {},
        { escrow_place_hold: [ok({ escrow: heldEscrow, placed: false })] },
      );
      const service = new EscrowService(supabase, payouts);

      expect((await service.hold('j1', 'p1')).placed).toBe(false);
    });

    it('no-ops for a job posted without a budget', async () => {
      const { supabase } = createSupabaseMock(
        {},
        { escrow_place_hold: [ok({ escrow: null, placed: false })] },
      );
      const service = new EscrowService(supabase, payouts);

      expect(await service.hold('j1', 'p1')).toEqual({
        escrow: null,
        placed: false,
      });
    });

    it('turns a short wallet into the message the app shows, with the figures', async () => {
      const { supabase } = createSupabaseMock(
        {},
        {
          escrow_place_hold: [
            {
              data: null,
              error: {
                code: 'TB402',
                message: 'Insufficient wallet balance',
                details: '{"needed": 1500, "available": 200}',
              },
            },
          ],
        },
      );
      const service = new EscrowService(supabase, payouts);

      const err: unknown = await service
        .hold('j1', 'p1')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InsufficientBalanceError);
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as InsufficientBalanceError).getResponse()).toMatchObject({
        message:
          'Insufficient wallet balance: ₱1,500.00 needed, ₱200.00 available. Add funds to your wallet before hiring.',
        code: 'insufficient_funds',
        needed: 1500,
        available: 200,
      });
    });

    it('refuses a hold for another provider as a conflict', async () => {
      const { supabase } = createSupabaseMock(
        {},
        {
          escrow_place_hold: [
            {
              data: null,
              error: {
                code: 'TB409',
                message:
                  'This job already has an escrow hold for another provider.',
              },
            },
          ],
        },
      );
      const service = new EscrowService(supabase, payouts);

      await expect(service.hold('j1', 'p2')).rejects.toThrow(
        EscrowConflictError,
      );
    });
  });

  describe('commission', () => {
    function releaseWith(rate: number, budget = 1500) {
      const escrow = { ...heldEscrow, amount: budget };
      return createSupabaseMock(
        {
          escrow_transactions: [ok(escrow)],
          platform_settings: [ok({ commission_rate: rate })],
        },
        { escrow_settle: [ok({ ...escrow, status: 'released' })] },
      );
    }

    it('pays the provider the whole budget while the rate is zero', async () => {
      // The default, and the point of the default: applying 0024 changes no
      // figure anywhere until an admin deliberately sets a rate.
      const { supabase, rpc } = releaseWith(0);
      await new EscrowService(supabase, payouts).release('j1');

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_next: 'released',
        p_commission: 0,
        p_title: 'Payout — Fix sink',
      });
    });

    it('freezes the configured cut onto the release and says so on the payout line', async () => {
      const { supabase, rpc } = releaseWith(0.15);
      await new EscrowService(supabase, payouts).release('j1');

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_commission: 225,
        p_title: 'Payout — Fix sink (less 225.00 platform fee)',
      });
    });

    it('rounds to centavos rather than carrying float noise into the ledger', async () => {
      // 1000.05 * 0.075 = 75.00375 — not an amount anyone can be charged.
      const { supabase, rpc } = releaseWith(0.075, 1000.05);
      await new EscrowService(supabase, payouts).release('j1');

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_commission: 75,
      });
    });

    it('falls back to no commission when the settings row cannot be read', async () => {
      // A settings read that fails must not strand a provider's payout, and
      // zero is the direction that errs in the user's favour.
      const { supabase, rpc } = createSupabaseMock(
        {
          escrow_transactions: [ok(heldEscrow)],
          platform_settings: [{ data: null, error: { message: 'boom' } }],
        },
        { escrow_settle: [ok({ ...heldEscrow, status: 'released' })] },
      );
      await new EscrowService(supabase, payouts).release('j1');

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_commission: 0,
      });
    });
  });

  describe('the onward transfer for card-funded payouts', () => {
    it('starts it after a card-funded release, without waiting for it', async () => {
      // A Stripe call that never answers must not hold the completion up.
      processEscrow.mockImplementationOnce(() => new Promise(() => {}));
      const { supabase } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        {
          escrow_settle: [
            ok({
              ...heldEscrow,
              status: 'released',
              transfer_status: 'pending',
            }),
          ],
        },
      );

      await expect(
        new EscrowService(supabase, payouts).release('j1'),
      ).resolves.toMatchObject({ status: 'released' });
      expect(processEscrow).toHaveBeenCalledWith('e1');
    });

    it('leaves a wallet-funded payout in the wallet', async () => {
      const { supabase } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        {
          escrow_settle: [
            ok({ ...heldEscrow, status: 'released', transfer_status: 'none' }),
          ],
        },
      );

      await new EscrowService(supabase, payouts).release('j1');

      expect(processEscrow).not.toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('moves held → released, re-asserting the status it read', async () => {
      const { supabase, rpc } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        { escrow_settle: [ok({ ...heldEscrow, status: 'released' })] },
      );

      const result = await new EscrowService(supabase, payouts).release('j1');

      expect(result).toMatchObject({ status: 'released' });
      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_escrow_id: 'e1',
        p_expected: 'held',
        p_next: 'released',
      });
    });

    it('raises when another release got there first, rather than reporting a payout', async () => {
      const { supabase } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        { escrow_settle: [ok(null)] }, // lost the race
      );

      await expect(
        new EscrowService(supabase, payouts).release('j1'),
      ).rejects.toThrow(ConflictException);
    });

    it('raises rather than reporting a payout that did not happen', async () => {
      // This used to return null. A caller that reads silence as success —
      // a retried webhook, the payout rail — would believe the provider had
      // been paid.
      const { supabase, rpc } = createSupabaseMock({
        escrow_transactions: [ok({ ...heldEscrow, status: 'released' })],
      });

      await expect(
        new EscrowService(supabase, payouts).release('j1'),
      ).rejects.toThrow(ConflictException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('raises when the job never had an escrow hold at all', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [ok(null)],
      });

      await expect(
        new EscrowService(supabase, payouts).release('j1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('releaseIfHeld', () => {
    it('pays out a held escrow, same as release', async () => {
      const { supabase } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        { escrow_settle: [ok({ ...heldEscrow, status: 'released' })] },
      );

      expect(
        await new EscrowService(supabase, payouts).releaseIfHeld('j1'),
      ).toMatchObject({ status: 'released' });
    });

    it('leaves a disputed escrow alone and pays nobody', async () => {
      const { supabase, rpc } = createSupabaseMock({
        escrow_transactions: [ok({ ...heldEscrow, status: 'disputed' })],
      });

      expect(
        await new EscrowService(supabase, payouts).releaseIfHeld('j1'),
      ).toBeNull();
      expect(rpc).not.toHaveBeenCalled();
    });

    it('returns null for a job posted without a budget', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [ok(null)],
      });

      expect(
        await new EscrowService(supabase, payouts).releaseIfHeld('j1'),
      ).toBeNull();
    });

    it('still raises on an escrow that was already released', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [ok({ ...heldEscrow, status: 'released' })],
      });

      await expect(
        new EscrowService(supabase, payouts).releaseIfHeld('j1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('releaseHoldForFailedHire', () => {
    it('returns the money under its own ledger line', async () => {
      const { supabase, rpc } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        { escrow_settle: [ok({ ...heldEscrow, status: 'cancelled' })] },
      );

      await new EscrowService(supabase, payouts).releaseHoldForFailedHire('j1');

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_expected: 'held',
        p_next: 'cancelled',
        p_title: 'Refund — hire did not complete: Fix sink',
      });
    });

    it('is quiet when the hold moved on before the rollback ran', async () => {
      const { supabase } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        { escrow_settle: [ok(null)] },
      );

      await expect(
        new EscrowService(supabase, payouts).releaseHoldForFailedHire('j1'),
      ).resolves.toBeUndefined();
    });

    it('does nothing when there is no live hold to undo', async () => {
      const { supabase, rpc } = createSupabaseMock({
        escrow_transactions: [ok(null)],
      });

      await new EscrowService(supabase, payouts).releaseHoldForFailedHire('j1');

      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('cancelForJob', () => {
    it('cancels and returns the held funds to the client', async () => {
      const { supabase, rpc } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        { escrow_settle: [ok({ ...heldEscrow, status: 'cancelled' })] },
      );

      const result = await new EscrowService(supabase, payouts).cancelForJob(
        'j1',
      );

      expect(result).toMatchObject({ status: 'cancelled' });
      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_next: 'cancelled',
        p_title: 'Refund — job cancelled: Fix sink',
      });
    });

    it('is quiet when another cancel got there first', async () => {
      // A client tapping Cancel while the provider taps Decline: two
      // endpoints, one escrow. The loser gets null, and the SQL function wrote
      // no refund for it.
      const { supabase } = createSupabaseMock(
        { escrow_transactions: [ok(heldEscrow)] },
        { escrow_settle: [ok(null)] },
      );

      expect(
        await new EscrowService(supabase, payouts).cancelForJob('j1'),
      ).toBeNull();
    });

    it('leaves a disputed escrow for an admin rather than refunding it', async () => {
      const { supabase, rpc } = createSupabaseMock({
        escrow_transactions: [ok({ ...heldEscrow, status: 'disputed' })],
      });

      expect(
        await new EscrowService(supabase, payouts).cancelForJob('j1'),
      ).toBeNull();
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    it('settles a disputed escrow in the client’s favour', async () => {
      const disputed = { ...heldEscrow, status: 'disputed' as const };
      const { supabase, rpc } = createSupabaseMock(
        {},
        { escrow_settle: [ok({ ...disputed, status: 'refunded' })] },
      );

      await new EscrowService(supabase, payouts).refund(disputed);

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_expected: 'disputed',
        p_next: 'refunded',
        p_title: 'Refund — dispute resolved: Fix sink',
      });
    });

    it('refuses money that has already moved', async () => {
      const { supabase, rpc } = createSupabaseMock({});

      await expect(
        new EscrowService(supabase, payouts).refund({
          ...heldEscrow,
          status: 'refunded',
        }),
      ).rejects.toThrow(ConflictException);
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});

describe('moneyError', () => {
  it('maps each SQLSTATE from migration 0028 to its exception', () => {
    expect(
      moneyError({ code: 'TB402', message: 'x', details: '{}' }),
    ).toBeInstanceOf(InsufficientBalanceError);
    expect(moneyError({ code: 'TB409', message: 'x' })).toBeInstanceOf(
      EscrowConflictError,
    );
    expect(moneyError({ code: 'TB404', message: 'x' })).toBeInstanceOf(
      NotFoundException,
    );
    expect(moneyError({ code: '08006', message: 'x' })).toBeInstanceOf(
      BadRequestException,
    );
  });

  it('tells a refusal from a fault', () => {
    expect(isMoneyRefusal(new InsufficientBalanceError(1, 0))).toBe(true);
    expect(isMoneyRefusal(new EscrowConflictError('x'))).toBe(true);
    expect(isMoneyRefusal(new BadRequestException('connection lost'))).toBe(
      false,
    );
  });
});

describe('DisputesService', () => {
  function build(
    tables: Record<string, QueryResult[]>,
    rpcs: Record<string, QueryResult[]> = {},
  ) {
    const { supabase, calls, rpc } = createSupabaseMock(tables, rpcs);
    const { mock: adminActions, record } = createAdminActionsMock();
    const service = new DisputesService(
      supabase,
      new EscrowService(supabase, payouts),
      adminActions,
    );
    return { service, calls, rpc, record };
  }

  describe('raise', () => {
    it('freezes the escrow without moving money, and notifies the provider', async () => {
      const { service, calls, rpc } = build(
        {
          escrow_transactions: [ok(heldEscrow)],
          disputes: [ok({ id: 'd1', status: 'open' })],
          notifications: [ok(null)],
        },
        { escrow_settle: [ok({ ...heldEscrow, status: 'disputed' })] },
      );

      const result = await service.raise(client, 'j1', { reason: 'No show' });

      expect(result).toMatchObject({ id: 'd1' });
      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_expected: 'held',
        p_next: 'disputed',
        p_commission: 0,
        p_title: null,
      });
      expect(
        calls.some((c) => c.table === 'notifications' && c.method === 'insert'),
      ).toBe(true);
    });

    it('closes its own dispute when a release got there first', async () => {
      // findByJob read 'held'; by the time the freeze runs a completion has
      // released it, so the conditional move matches nothing. Before the fix
      // this flipped 'released' back to 'disputed' and let resolve() pay the
      // provider a second time.
      const { service, calls } = build(
        {
          escrow_transactions: [ok(heldEscrow)],
          disputes: [ok({ id: 'd1', status: 'open' }), ok(null)],
        },
        { escrow_settle: [ok(null)] },
      );

      await expect(
        service.raise(client, 'j1', { reason: 'No show' }),
      ).rejects.toThrow(ConflictException);

      const closed = calls.find(
        (c) => c.table === 'disputes' && c.method === 'update',
      );
      expect(closed?.args[0]).toEqual({ status: 'cancelled' });
    });

    it('refuses when the money is no longer held', async () => {
      const { service, rpc } = build({
        escrow_transactions: [ok({ ...heldEscrow, status: 'released' })],
      });

      await expect(
        service.raise(client, 'j1', { reason: 'Too late' }),
      ).rejects.toThrow(BadRequestException);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('refuses a client who does not own the job', async () => {
      const { service } = build({ escrow_transactions: [ok(heldEscrow)] });

      await expect(
        service.raise({ id: 'other', role: 'client' } as Profile, 'j1', {
          reason: 'Nope',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a second open dispute on the same escrow', async () => {
      const { service } = build({
        escrow_transactions: [ok(heldEscrow)],
        disputes: [
          { data: null, error: { message: 'duplicate', code: '23505' } },
        ],
      });

      await expect(
        service.raise(client, 'j1', { reason: 'Again' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolve', () => {
    const disputed = { ...heldEscrow, status: 'disputed' as const };

    it('pays the provider when released, and audits the decision', async () => {
      const { service, rpc, record } = build(
        {
          disputes: [
            ok({ id: 'd1', job_id: 'j1', status: 'open' }),
            ok({ id: 'd1', status: 'resolved' }),
          ],
          escrow_transactions: [ok(disputed)],
          notifications: [ok(null), ok(null)],
        },
        { escrow_settle: [ok({ ...disputed, status: 'released' })] },
      );

      await service.resolve(admin, 'd1', {
        resolution: 'released_to_provider',
      });

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_expected: 'disputed',
        p_next: 'released',
      });
      expect(record).toHaveBeenCalledWith(
        admin,
        'dispute.resolve',
        'disputes',
        'd1',
        { resolution: 'released_to_provider', note: null },
      );
    });

    it('returns the money to the client when refunded', async () => {
      const { service, rpc } = build(
        {
          disputes: [
            ok({ id: 'd1', job_id: 'j1', status: 'open' }),
            ok({ id: 'd1', status: 'resolved' }),
          ],
          escrow_transactions: [ok(disputed)],
          notifications: [ok(null), ok(null)],
        },
        { escrow_settle: [ok({ ...disputed, status: 'refunded' })] },
      );

      await service.resolve(admin, 'd1', { resolution: 'refunded_to_client' });

      expect(rpcArgs(rpc, 'escrow_settle')[0]).toMatchObject({
        p_next: 'refunded',
      });
    });

    it('lets only one of two admins resolving at once move the money', async () => {
      const { service } = build(
        {
          disputes: [ok({ id: 'd1', job_id: 'j1', status: 'open' })],
          escrow_transactions: [ok(disputed)],
        },
        { escrow_settle: [ok(null)] },
      );

      await expect(
        service.resolve(admin, 'd1', { resolution: 'released_to_provider' }),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses an already-resolved dispute', async () => {
      const { service } = build({
        disputes: [ok({ id: 'd1', job_id: 'j1', status: 'resolved' })],
      });

      await expect(
        service.resolve(admin, 'd1', { resolution: 'refunded_to_client' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
