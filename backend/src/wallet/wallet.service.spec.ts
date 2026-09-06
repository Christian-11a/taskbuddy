import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { AdminActionsService } from '../admin/admin-actions.service';
import type { Profile } from '../common/types';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

/** Same chainable stand-in as admin.service.spec.ts — results consumed per `.from()`. */
function createSupabaseMock(results: QueryResult[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const from = jest.fn(() => {
    const result = results.shift() ?? {
      data: null,
      error: { message: 'no mock result' },
    };
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    for (const method of [
      'select',
      'insert',
      'update',
      'eq',
      'order',
      'range',
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

/**
 * Only `issueRecoveryCredit` writes to the audit trail; every other method
 * gets this and never touches it.
 */
function createAdminActionsMock() {
  const record = jest.fn().mockResolvedValue(undefined);
  return { mock: { record } as unknown as AdminActionsService, record };
}

const user = { id: 'u1', role: 'client' } as Profile;
const admin = { id: 'a1', role: 'admin' } as Profile;

describe('WalletService', () => {
  describe('balanceFor', () => {
    it('nets completed credits against completed debits', async () => {
      const { supabase } = createSupabaseMock([
        {
          data: [
            { direction: 'credit', amount: '1000.00' },
            { direction: 'debit', amount: '250.50' },
            { direction: 'credit', amount: '0.50' },
          ],
          error: null,
        },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      expect(await service.balanceFor('u1')).toBe(750);
    });
  });

  describe('availableBalanceFor', () => {
    it('reserves anything already promised to a pending withdrawal', async () => {
      // Without the reservation the same peso funds a hire and a payout, and
      // whichever settles second takes the ledger negative.
      const { supabase } = createSupabaseMock([
        { data: [{ direction: 'credit', amount: '1000.00' }], error: null },
        { data: [{ amount: '400.00' }], error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      expect(await service.availableBalanceFor('u1')).toBe(600);
    });
  });

  describe('requestWithdrawal', () => {
    it('files a pending request rather than a completed debit', async () => {
      // There is no payout rail. A row saying `completed` would assert money
      // had moved when nothing had.
      const { supabase, calls } = createSupabaseMock([
        { data: [{ direction: 'credit', amount: '900.00' }], error: null },
        { data: [], error: null },
        { data: { id: 't2' }, error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.requestWithdrawal(user, {
        amount: 300,
        destination: 'GCash 0917-000-0000',
      });

      const insert = calls.find((c) => c.method === 'insert');
      expect(insert?.args[0]).toMatchObject({
        kind: 'withdrawal',
        direction: 'debit',
        status: 'pending',
        withdrawal_destination: 'GCash 0917-000-0000',
      });
    });

    it('refuses more than the available balance', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: [{ direction: 'credit', amount: '100.00' }], error: null },
        { data: [], error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.requestWithdrawal(user, { amount: 500, destination: 'GCash' }),
      ).rejects.toThrow(BadRequestException);
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('counts a pending request against the next one', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: [{ direction: 'credit', amount: '1000.00' }], error: null },
        { data: [{ amount: '800.00' }], error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.requestWithdrawal(user, { amount: 500, destination: 'GCash' }),
      ).rejects.toThrow(BadRequestException);
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });
  });

  describe('settleWithdrawal', () => {
    it('completes the row only while it is still pending', async () => {
      const { supabase, calls } = createSupabaseMock([
        {
          data: {
            id: 'w1',
            profile_id: 'u1',
            amount: '300.00',
            status: 'pending',
          },
          error: null,
        },
        { data: [{ direction: 'credit', amount: '900.00' }], error: null },
        { data: { id: 'w1', status: 'completed' }, error: null },
        { data: null, error: null }, // notification
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.settleWithdrawal(admin, 'w1', 'GC-99');

      const update = calls.find((c) => c.method === 'update');
      expect(update?.args[0]).toMatchObject({
        status: 'completed',
        review_note: 'GC-99',
        reviewed_by: 'a1',
      });
      // The status is re-asserted in the WHERE clause so two admins clicking
      // at once produce one settlement, not two payouts.
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' &&
            c.args[0] === 'status' &&
            c.args[1] === 'pending',
        ),
      ).toBe(true);
    });

    it('refuses when the balance no longer covers it', async () => {
      // Escrow may have spent the money between the request and the payout.
      const { supabase, calls } = createSupabaseMock([
        {
          data: {
            id: 'w1',
            profile_id: 'u1',
            amount: '300.00',
            status: 'pending',
          },
          error: null,
        },
        { data: [{ direction: 'credit', amount: '100.00' }], error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(service.settleWithdrawal(admin, 'w1')).rejects.toThrow(
        BadRequestException,
      );
      expect(calls.some((c) => c.method === 'update')).toBe(false);
    });

    it('refuses a request someone already settled', async () => {
      const { supabase, calls } = createSupabaseMock([
        {
          data: {
            id: 'w1',
            profile_id: 'u1',
            amount: '300.00',
            status: 'completed',
          },
          error: null,
        },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(service.settleWithdrawal(admin, 'w1')).rejects.toThrow(
        BadRequestException,
      );
      expect(calls.some((c) => c.method === 'update')).toBe(false);
    });
  });

  describe('create (deprecated alias)', () => {
    it('refuses a credit — funding may only come from a Stripe webhook', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 't1' }, error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      // Anything else here is free money: this endpoint needs only a valid JWT,
      // and the balance it would create spends like paid-for balance in escrow.
      await expect(
        service.create(user, {
          direction: 'credit',
          amount: 500,
          title: 'Add money',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('routes an old-shaped debit into the same pending request', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: [{ direction: 'credit', amount: '900.00' }], error: null },
        { data: [], error: null },
        { data: { id: 't2' }, error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.create(user, {
        direction: 'debit',
        amount: 300,
        title: 'Withdraw',
      });

      const insert = calls.find((c) => c.method === 'insert');
      expect(insert?.args[0]).toMatchObject({
        kind: 'withdrawal',
        status: 'pending',
      });
    });
  });

  describe('listForAdmin', () => {
    it('returns rows and total, filtered by kind/direction/status', async () => {
      const rows = [
        {
          id: 't1',
          kind: 'topup',
          direction: 'credit',
          amount: '1000.00',
          profile: { id: 'u1', full_name: 'Eduard' },
        },
      ];
      const { supabase, calls } = createSupabaseMock([
        { data: rows, error: null, count: 1 },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      const result = await service.listForAdmin({
        kind: 'topup',
        direction: 'credit',
        status: 'completed',
      });

      expect(result).toEqual({ transactions: rows, total: 1 });
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' && c.args[0] === 'kind' && c.args[1] === 'topup',
        ),
      ).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' &&
            c.args[0] === 'direction' &&
            c.args[1] === 'credit',
        ),
      ).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' &&
            c.args[0] === 'status' &&
            c.args[1] === 'completed',
        ),
      ).toBe(true);
    });

    it('defaults to no filters and total 0 on an empty ledger', async () => {
      const { supabase } = createSupabaseMock([
        { data: [], error: null, count: 0 },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(service.listForAdmin({})).resolves.toEqual({
        transactions: [],
        total: 0,
      });
    });

    it('throws BadRequestException on query error', async () => {
      const { supabase } = createSupabaseMock([
        { data: null, error: { message: 'boom' } },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(service.listForAdmin({})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
  describe('issueRecoveryCredit', () => {
    const activeRecipient = { id: 'u1', deleted_at: null };

    it('writes a completed credit tagged as a recovery voucher', async () => {
      // The only path in the API that adds balance outside a settled Stripe
      // charge or an escrow release. `kind` is set here, never read from the
      // body — a caller who could name it could tag their own credit
      // `payout` and inflate reported platform revenue.
      const { supabase, calls } = createSupabaseMock([
        { data: activeRecipient, error: null },
        { data: { id: 'w1' }, error: null },
        { data: null, error: null },
      ]);
      const { mock, record } = createAdminActionsMock();
      const service = new WalletService(supabase, mock);

      const result = await service.issueRecoveryCredit(admin, {
        profile_id: 'u1',
        amount: 500,
        title: 'Sorry for the bad experience',
      });

      expect(result).toMatchObject({ id: 'w1' });
      const inserted = calls.find((c) => c.method === 'insert')
        ?.args[0] as Record<string, unknown>;
      expect(inserted).toMatchObject({
        profile_id: 'u1',
        direction: 'credit',
        kind: 'recovery_credit',
        status: 'completed',
        amount: 500,
        job_id: null,
      });
      expect(record).toHaveBeenCalledWith(
        admin,
        'wallet.issue_recovery_credit',
        'wallet_transactions',
        'w1',
        expect.objectContaining({ profile_id: 'u1', amount: 500 }),
      );
    });

    it('tells the recipient the credit arrived', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: activeRecipient, error: null },
        { data: { id: 'w1' }, error: null },
        { data: null, error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.issueRecoveryCredit(admin, {
        profile_id: 'u1',
        amount: 250,
        title: 'Trust credit',
      });

      const notification = calls
        .filter((c) => c.method === 'insert')
        .map((c) => c.args[0] as Record<string, unknown>)
        .find((row) => row.recipient_id !== undefined);
      expect(notification).toMatchObject({
        recipient_id: 'u1',
        type: 'wallet_update',
        title: 'Trust credit issued',
      });
    });

    it('ties the credit to a job both parties are actually on', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: activeRecipient, error: null },
        {
          data: { client_id: 'u1', assigned_provider_id: 'p9' },
          error: null,
        },
        { data: { id: 'w1' }, error: null },
        { data: null, error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await service.issueRecoveryCredit(admin, {
        profile_id: 'u1',
        amount: 500,
        title: 'Compensation',
        job_id: 'j1',
      });

      const inserted = calls.find((c) => c.method === 'insert')
        ?.args[0] as Record<string, unknown>;
      expect(inserted).toMatchObject({ job_id: 'j1' });
    });

    it('refuses a job the recipient has nothing to do with', async () => {
      // The job_id makes the credit render inside that job's history; a
      // mistyped id would file somebody's compensation against a stranger.
      const { supabase, calls } = createSupabaseMock([
        { data: activeRecipient, error: null },
        {
          data: { client_id: 'someone-else', assigned_provider_id: 'p9' },
          error: null,
        },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.issueRecoveryCredit(admin, {
          profile_id: 'u1',
          amount: 500,
          title: 'Compensation',
          job_id: 'j1',
        }),
      ).rejects.toThrow('That job does not belong to the recipient');
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('refuses a deleted account, whose balance nobody could ever reach', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 'u1', deleted_at: '2026-08-01T00:00:00Z' }, error: null },
      ]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.issueRecoveryCredit(admin, {
          profile_id: 'u1',
          amount: 500,
          title: 'Trust credit',
        }),
      ).rejects.toThrow(/deleted/);
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('reports an unknown recipient as 404, not a failed insert', async () => {
      const { supabase } = createSupabaseMock([{ data: null, error: null }]);
      const service = new WalletService(
        supabase,
        createAdminActionsMock().mock,
      );

      await expect(
        service.issueRecoveryCredit(admin, {
          profile_id: 'u1',
          amount: 500,
          title: 'Trust credit',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
