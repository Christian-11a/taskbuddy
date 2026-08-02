import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EscrowService, type EscrowRow } from './escrow.service';
import { DisputesService } from './disputes.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { WalletService } from '../wallet/wallet.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as admin.service.spec.ts — results consumed per `.from()`. */
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
    for (const method of [
      'select',
      'update',
      'insert',
      'eq',
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
  return { supabase: { admin: { from } } as unknown as SupabaseService, calls };
}

/** Escrow only ever asks the wallet for a balance. */
function createWalletMock(balance = 100_000) {
  const balanceFor = jest.fn(() => Promise.resolve(balance));
  return {
    wallet: { balanceFor } as unknown as WalletService,
    balanceFor,
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
        escrow_transactions: [{ data: heldEscrow, error: null }],
        wallet_transactions: [okLedger()],
      });
      const service = new EscrowService(
        supabase,
        createWalletMock(2000).wallet,
      );

      const result = await service.hold('j1', 'p1');

      expect(result).toMatchObject({ status: 'held', amount: 1500 });
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
      });
      const service = new EscrowService(supabase, createWalletMock(200).wallet);

      await expect(service.hold('j1', 'p1')).rejects.toThrow(
        /Insufficient wallet balance/,
      );
      // Nothing was held and nobody was debited.
      expect(calls.some((c) => c.table === 'escrow_transactions')).toBe(false);
      expect(ledgerWrites(calls)).toEqual([]);
    });

    it('no-ops for a job posted without a budget', async () => {
      const { wallet, balanceFor } = createWalletMock();
      const { supabase, calls } = createSupabaseMock({
        jobs: [
          {
            data: { id: 'j1', title: 'Old job', budget: null, client_id: 'c1' },
            error: null,
          },
        ],
      });
      const service = new EscrowService(supabase, wallet);

      expect(await service.hold('j1', 'p1')).toBeNull();
      expect(calls.some((c) => c.table === 'escrow_transactions')).toBe(false);
      // Bails before it ever asks about money.
      expect(balanceFor).not.toHaveBeenCalled();
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
        escrow_transactions: [
          { data: null, error: { message: 'duplicate', code: '23505' } },
          { data: heldEscrow, error: null }, // findByJob fallback
        ],
      });
      const service = new EscrowService(
        supabase,
        createWalletMock(5000).wallet,
      );

      const result = await service.hold('j1', 'p1');

      expect(result).toMatchObject({ id: 'e1' });
      expect(ledgerWrites(calls)).toEqual([]);
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

    it('leaves a disputed escrow alone and pays nobody', async () => {
      const { supabase, calls } = createSupabaseMock({
        escrow_transactions: [
          { data: { ...heldEscrow, status: 'disputed' }, error: null },
        ],
      });
      const service = new EscrowService(supabase, createWalletMock().wallet);

      expect(await service.release('j1')).toBeNull();
      expect(ledgerWrites(calls)).toEqual([]);
    });
  });

  describe('cancelForJob', () => {
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
      const service = new DisputesService(supabase, escrow);

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
      const service = new DisputesService(supabase, escrow);

      await expect(
        service.raise(client, 'j1', { reason: 'Too late' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a client who does not own the job', async () => {
      const { supabase } = createSupabaseMock({
        escrow_transactions: [{ data: heldEscrow, error: null }],
      });
      const escrow = new EscrowService(supabase, createWalletMock().wallet);
      const service = new DisputesService(supabase, escrow);

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
      const service = new DisputesService(supabase, escrow);

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
      const service = new DisputesService(supabase, escrow);

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
      const service = new DisputesService(supabase, escrow);

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
      const service = new DisputesService(supabase, escrow);

      await expect(
        service.resolve(admin, 'd1', { resolution: 'refunded_to_client' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
