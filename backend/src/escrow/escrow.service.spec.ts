import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EscrowService, type EscrowRow } from './escrow.service';
import { DisputesService } from './disputes.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { WalletService } from '../wallet/wallet.service';
import type { AdminActionsService } from '../admin/admin-actions.service';
import type { Profile } from '../common/types';

function createAdminActionsMock() {
  const record = jest.fn().mockResolvedValue(undefined);
  return { mock: { record } as unknown as AdminActionsService, record };
}

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as admin.service.spec.ts — results consumed per `.from()`. */
function createSupabaseMock(resultsByTable: Record<string, QueryResult[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
  const from = jest.fn((table: string) => {
    const result =
      resultsByTable[table]?.shift() ??
      // Every payOut reads the commission rate (0023). Defaulting it to zero
      // here means the tests written before commission existed keep describing
      // exactly the case they were written for: the platform takes nothing.
      (table === 'platform_settings'
        ? { data: { commission_rate: 0 }, error: null }
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

/**
 * Escrow only ever asks the wallet for a balance — the available one since
 * 0023, so a peso promised to a pending withdrawal cannot also fund a hire.
 */
function createWalletMock(balance = 100_000) {
  const balanceFor = jest.fn(() => Promise.resolve(balance));
  const availableBalanceFor = jest.fn(() => Promise.resolve(balance));
  return {
    wallet: { balanceFor, availableBalanceFor } as unknown as WalletService,
    balanceFor,
    availableBalanceFor,
  };
}

/** Every successful ledger write consumes one queued wallet_transactions result. */
const okLedger = (): QueryResult => ({ data: null, error: null });

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

const client = { id: 'c1', role: 'client' } as Profile;
const admin = { id: 'a1', role: 'admin' } as Profile;

/** Pull the wallet rows a call inserted, in order. */
function ledgerWrites(
  calls: { table: string; method: string; args: unknown[] }[],
) {
  return calls
    .filter((c) => c.table === 'wallet_transactions' && c.method === 'insert')
    .map((c) => c.args[0] as Record<string, unknown>);
}

describe('EscrowService', () => {
  describe('listForAdmin', () => {
    it('uses a paginated transactions search RPC and returns its rows and exact total', async () => {
      const rows = [{ id: 'e1', jobs: { title: 'Fix sink' } }];
      const { supabase, calls, rpc } = createSupabaseMock({});
      rpc.mockResolvedValue({
        data: [{ rows, total: 17 }],
        error: null,
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await expect(
        service.listForAdmin({
          search: 'Ramos',
          status: 'held',
          limit: 5,
          offset: 10,
        }),
      ).resolves.toEqual({ transactions: rows, total: 17 });
      expect(rpc).toHaveBeenCalledWith('admin_list_transactions', {
        p_search_term: 'Ramos',
        p_status: 'held',
        p_limit: 5,
        p_offset: 10,
      });
      expect(calls).toEqual([]);
    });

    it('retains the exact transactions total when the requested page is empty', async () => {
      const { supabase, rpc } = createSupabaseMock({});
      rpc.mockResolvedValue({ data: [{ rows: [], total: 17 }], error: null });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await expect(
        service.listForAdmin({ search: 'Ramos', limit: 5, offset: 100 }),
      ).resolves.toStrictEqual({ transactions: [], total: 17 });
    });
  });

  describe('hold', () => {
    it('debits the client and records a held escrow', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              budget: 1500,
              client_id: 'c1',
            },
            error: null,
          },
        ],
        escrow_transactions: [
          // hold() looks for an existing row before inserting, so a second
          // hire cannot silently inherit the first one's money.
          { data: null, error: null },
          { data: heldEscrow, error: null },
        ],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(
        supabase,
        createWalletMock(2000).wallet,
      );

      const result = await service.hold('j1', 'p1');

      expect(result.escrow).toMatchObject({ status: 'held', amount: 1500 });
      expect(result.placed).toBe(true);
      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({
          profile_id: 'c1',
          direction: 'debit',
          kind: 'escrow_hold',
          amount: 1500,
          job_id: 'j1',
        }),
      ]);
    });

    it('blocks the hire when the client cannot cover the budget', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              budget: 1500,
              client_id: 'c1',
            },
            error: null,
          },
        ],
        escrow_transactions: [{ data: null, error: null }],
      });
      const service = new EscrowService(supabase, createWalletMock(200).wallet);

      await expect(service.hold('j1', 'p1')).rejects.toThrow(
        /Insufficient wallet balance/,
      );
      // Nothing was written and nobody was debited. (The read that looks for
      // an existing hold is fine; it is the insert that must not happen.)
      expect(
        calls.some(
          (c) => c.table === 'escrow_transactions' && c.method === 'insert',
        ),
      ).toBe(false);
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('no-ops for a job posted without a budget', async () => {
      const { wallet, availableBalanceFor } = createWalletMock();
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: { id: 'j1', title: 'Old job', budget: null, client_id: 'c1' },
            error: null,
          },
        ],
      });
      const service = new EscrowService(supabase, wallet);

      expect(await service.hold('j1', 'p1')).toEqual({
        escrow: null,
        placed: false,
      });
      expect(calls.some((c) => c.table === 'escrow_transactions')).toBe(false);
      // Bails before it ever asks about money.
      expect(availableBalanceFor).not.toHaveBeenCalled();
    });

    it('does not debit twice when the job is already held', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              budget: 1500,
              client_id: 'c1',
            },
            error: null,
          },
        ],
        escrow_transactions: [{ data: heldEscrow, error: null }],
      });
      const service = new EscrowService(
        supabase,
        createWalletMock(5000).wallet,
      );

      const result = await service.hold('j1', 'p1');

      expect(result.escrow).toMatchObject({ id: 'e1' });
      expect(ledgerWrites(calls)).toEqual([]);
      expect(
        calls.some(
          (c) => c.table === 'escrow_transactions' && c.method === 'insert',
        ),
      ).toBe(false);
      // The load-bearing half: nothing was debited, so this caller must not be
      // told it placed the hold. ApplicationsService.accept rolls back on
      // `placed`, and a true here would refund a hire that succeeded.
      expect(result.placed).toBe(false);
    });

    it('refuses to inherit a hold placed for a different provider', async () => {
      // Two accepts landing together would otherwise assign the job to one
      // provider while the money sits held for another.
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              budget: 1500,
              client_id: 'c1',
            },
            error: null,
          },
        ],
        escrow_transactions: [{ data: heldEscrow, error: null }],
      });
      const service = new EscrowService(
        supabase,
        createWalletMock(5000).wallet,
      );

      await expect(service.hold('j1', 'p2')).rejects.toThrow(ConflictException);
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('revives a hold that a failed hire rolled back, debiting again', async () => {
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              budget: 1500,
              client_id: 'c1',
            },
            error: null,
          },
        ],
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'cancelled' }, error: null },
          { data: heldEscrow, error: null },
        ],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(
        supabase,
        createWalletMock(5000).wallet,
      );

      const result = await service.hold('j1', 'p1');

      // Without the re-debit the retry would adopt an empty row and hire
      // someone against money that had already gone back to the client.
      expect(result.escrow).toMatchObject({ status: 'held' });
      expect(result.placed).toBe(true);
      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({ kind: 'escrow_hold', amount: 1500 }),
      ]);
    });

    it('refuses to re-hold an escrow that has already been released', async () => {
      const { supabase } = createSupabaseMock({
        jobs: [
          {
            data: {
              id: 'j1',
              title: 'Fix sink',
              budget: 1500,
              client_id: 'c1',
            },
            error: null,
          },
        ],
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
      });
      const service = new EscrowService(
        supabase,
        createWalletMock(5000).wallet,
      );

      await expect(service.hold('j1', 'p1')).rejects.toThrow(ConflictException);
    });
  });

  describe('commission', () => {
    /** A release with a rate configured. */
    function releaseWith(rate: number, budget = 1500) {
      return createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, amount: budget }, error: null },
          {
            data: { ...heldEscrow, amount: budget, status: 'released' },
            error: null,
          },
        ],
        platform_settings: [{ data: { commission_rate: rate }, error: null }],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
      });
    }

    it('pays the provider the whole budget while the rate is zero', async () => {
      // The default, and the point of the default: applying 0023 changes no
      // figure anywhere until an admin deliberately sets a rate.
      const { supabase, calls } = releaseWith(0);
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.release('j1');

      expect(ledgerWrites(calls)[0]).toMatchObject({
        kind: 'payout',
        amount: 1500,
      });
    });

    it('withholds the configured cut and credits the provider the remainder', async () => {
      const { supabase, calls } = releaseWith(0.15);
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.release('j1');

      expect(ledgerWrites(calls)[0]).toMatchObject({
        kind: 'payout',
        amount: 1275, // 1500 less 15%
      });
      // The withheld amount has no ledger row of its own — the platform is not
      // a profile — so escrow is where it is recorded.
      const escrowUpdate = calls.find(
        (c) => c.table === 'escrow_transactions' && c.method === 'update',
      );
      expect(escrowUpdate?.args[0]).toMatchObject({
        status: 'released',
        commission_amount: 225,
      });
    });

    it('rounds to centavos rather than carrying float noise into the ledger', async () => {
      // 1000.05 * 0.075 = 75.00375 — a payout of 925.04625 pesos is not a
      // number the ledger can hold, let alone one anyone can be paid.
      const { supabase, calls } = releaseWith(0.075, 1000.05);
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.release('j1');

      expect(ledgerWrites(calls)[0]).toMatchObject({ amount: 925.05 });
      const escrowUpdate = calls.find(
        (c) => c.table === 'escrow_transactions' && c.method === 'update',
      );
      expect(escrowUpdate?.args[0]).toMatchObject({ commission_amount: 75 });
    });

    it('falls back to no commission when the settings row cannot be read', async () => {
      // A settings read that fails must not strand a provider's payout, and
      // zero is the direction that errs in the user's favour.
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null },
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
        platform_settings: [{ data: null, error: { message: 'boom' } }],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.release('j1');

      expect(ledgerWrites(calls)[0]).toMatchObject({ amount: 1500 });
    });
  });

  describe('release', () => {
    it('marks released and credits the provider as a payout', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null },
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      const result = await service.release('j1');

      expect(result).toMatchObject({ status: 'released' });
      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({
          profile_id: 'p1',
          direction: 'credit',
          // `payout` is what the admin revenue query counts.
          kind: 'payout',
          amount: 1500,
          job_id: 'j1',
        }),
      ]);
    });

    it('raises rather than reporting a payout that did not happen', async () => {
      // This used to return null. A caller that reads silence as success —
      // a retried webhook, a future payout rail — would believe the provider
      // had been paid.
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await expect(service.release('j1')).rejects.toThrow(ConflictException);
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('raises when the job never had an escrow hold at all', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [{ data: null, error: null }],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await expect(service.release('j1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('releaseIfHeld', () => {
    it('pays out a held escrow, same as release', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null },
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      expect(await service.releaseIfHeld('j1')).toMatchObject({
        status: 'released',
      });
      expect(ledgerWrites(calls)[0]).toMatchObject({ kind: 'payout' });
    });

    it('leaves a disputed escrow alone and pays nobody', async () => {
      // Frozen until an admin decides it either way — not an error, and not a
      // payout.
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'disputed' }, error: null },
        ],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      expect(await service.releaseIfHeld('j1')).toBeNull();
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('returns null for a job posted without a budget', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [{ data: null, error: null }],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      expect(await service.releaseIfHeld('j1')).toBeNull();
    });

    it('still raises on an escrow that was already released', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await expect(service.releaseIfHeld('j1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('releaseHoldForFailedHire', () => {
    it('returns the money when an accept failed after its hold was placed', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null },
          { data: { ...heldEscrow, status: 'cancelled' }, error: null },
        ],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.releaseHoldForFailedHire('j1');

      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({
          profile_id: 'c1',
          direction: 'credit',
          kind: 'refund',
          amount: 1500,
        }),
      ]);
    });

    it('credits nobody when the hold moved on before the rollback ran', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null },
          { data: null, error: null }, // the update matched nothing
        ],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.releaseHoldForFailedHire('j1');

      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('does nothing when there is no live hold to undo', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [{ data: null, error: null }],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.releaseHoldForFailedHire('j1');

      expect(ledgerWrites(calls)).toEqual([]);
    });
  });

  describe('cancelForJob', () => {
    it('credits nobody when another cancel got there first', async () => {
      // A client tapping Cancel while the provider taps Decline: two
      // endpoints, one escrow, both reading 'held'. The conditional update
      // matches no row for the loser, and without that check both would
      // credit the client — refunding one hold twice.
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null },
          { data: null, error: null }, // the update matched nothing
        ],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      expect(await service.cancelForJob('j1')).toBeNull();
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('leaves a disputed escrow for an admin rather than refunding it', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'disputed' }, error: null },
        ],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      expect(await service.cancelForJob('j1')).toBeNull();
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('cancels and returns the held funds to the client', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null },
          { data: { ...heldEscrow, status: 'cancelled' }, error: null },
        ],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      const result = await service.cancelForJob('j1');

      expect(result).toMatchObject({ status: 'cancelled' });
      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({
          profile_id: 'c1',
          direction: 'credit',
          // `refund`, never `payout` — a cancelled job is not revenue.
          kind: 'refund',
          amount: 1500,
        }),
      ]);
    });
  });

  describe('refund', () => {
    it('credits the client back and tags the row as a refund', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'refunded' }, error: null },
        ],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      await service.refund(heldEscrow);

      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({
          profile_id: 'c1',
          direction: 'credit',
          kind: 'refund',
          amount: 1500,
        }),
      ]);
    });
  });
});

describe('DisputesService', () => {
  describe('raise', () => {
    it('marks the escrow disputed and notifies the provider', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: heldEscrow, error: null }, // findByJob
          { data: { ...heldEscrow, status: 'disputed' }, error: null }, // markDisputed
        ],
        disputes: [{ data: { id: 'd1', status: 'open' }, error: null }],
        notifications: [{ data: null, error: null }],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const service = new DisputesService(
        supabase,
        escrow,
        createAdminActionsMock().mock,
      );

      const result = await service.raise(client, 'j1', { reason: 'No show' });

      expect(result).toMatchObject({ id: 'd1' });
      const update = calls.find(
        (c) => c.table === 'escrow_transactions' && c.method === 'update',
      );
      expect(update?.args[0]).toEqual({ status: 'disputed' });
      expect(
        calls.some((c) => c.table === 'notifications' && c.method === 'insert'),
      ).toBe(true);
      // Disputing freezes the money; it must not move yet.
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('refuses when the money is no longer held', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const service = new DisputesService(
        supabase,
        escrow,
        createAdminActionsMock().mock,
      );

      await expect(
        service.raise(client, 'j1', { reason: 'Too late' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a client who does not own the job', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [{ data: heldEscrow, error: null }],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const service = new DisputesService(
        supabase,
        escrow,
        createAdminActionsMock().mock,
      );

      await expect(
        service.raise({ id: 'other', role: 'client' } as Profile, 'j1', {
          reason: 'Nope',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a second open dispute on the same escrow', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [{ data: heldEscrow, error: null }],
        disputes: [
          { data: null, error: { message: 'duplicate', code: '23505' } },
        ],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const service = new DisputesService(
        supabase,
        escrow,
        createAdminActionsMock().mock,
      );

      await expect(
        service.raise(client, 'j1', { reason: 'Again' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolve', () => {
    it('pays the provider when released', async () => {
      const { supabase, calls } = createSupabaseMock({
        disputes: [
          { data: { id: 'd1', job_id: 'j1', status: 'open' }, error: null },
          { data: { id: 'd1', status: 'resolved' }, error: null },
        ],
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'disputed' }, error: null },
          { data: { ...heldEscrow, status: 'released' }, error: null },
        ],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
        notifications: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const { mock: adminActions, record } = createAdminActionsMock();
      const service = new DisputesService(supabase, escrow, adminActions);

      await service.resolve(admin, 'd1', {
        resolution: 'released_to_provider',
      });

      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({
          profile_id: 'p1',
          kind: 'payout',
          amount: 1500,
        }),
      ]);
      expect(record).toHaveBeenCalledWith(
        admin,
        'dispute.resolve',
        'disputes',
        'd1',
        { resolution: 'released_to_provider', note: null },
      );
    });

    it('returns the money to the client when refunded', async () => {
      const { supabase, calls } = createSupabaseMock({
        disputes: [
          { data: { id: 'd1', job_id: 'j1', status: 'open' }, error: null },
          { data: { id: 'd1', status: 'resolved' }, error: null },
        ],
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'disputed' }, error: null },
          { data: { ...heldEscrow, status: 'refunded' }, error: null },
        ],
        jobs: [{ data: { title: 'Fix sink' }, error: null }],
        wallet_transactions: [okLedger()],
        notifications: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const service = new DisputesService(
        supabase,
        escrow,
        createAdminActionsMock().mock,
      );

      await service.resolve(admin, 'd1', { resolution: 'refunded_to_client' });

      expect(ledgerWrites(calls)).toEqual([
        expect.objectContaining({
          profile_id: 'c1',
          kind: 'refund',
          amount: 1500,
        }),
      ]);
    });

    it('refuses an already-resolved dispute', async () => {
      const { supabase } = createSupabaseMock({
        disputes: [
          { data: { id: 'd1', job_id: 'j1', status: 'resolved' }, error: null },
        ],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const service = new DisputesService(
        supabase,
        escrow,
        createAdminActionsMock().mock,
      );

      await expect(
        service.resolve(admin, 'd1', { resolution: 'refunded_to_client' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
