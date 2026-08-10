import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import type { SupabaseService } from '../supabase/supabase.service';
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
    for (const method of ['select', 'insert', 'eq', 'order', 'range']) {
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

const user = { id: 'u1', role: 'client' } as Profile;

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
      const service = new WalletService(supabase);

      expect(await service.balanceFor('u1')).toBe(750);
    });
  });

  describe('create', () => {
    it('refuses a credit — funding may only come from a Stripe webhook', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: { id: 't1' }, error: null },
      ]);
      const service = new WalletService(supabase);

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

    it('tags a debit as a withdrawal when funds allow', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: [{ direction: 'credit', amount: '900.00' }], error: null },
        { data: { id: 't2' }, error: null },
      ]);
      const service = new WalletService(supabase);

      await service.create(user, {
        direction: 'debit',
        amount: 300,
        title: 'Withdraw',
      });

      const insert = calls.find((c) => c.method === 'insert');
      expect(insert?.args[0]).toMatchObject({ kind: 'withdrawal' });
    });

    it('refuses a debit larger than the balance', async () => {
      const { supabase, calls } = createSupabaseMock([
        { data: [{ direction: 'credit', amount: '100.00' }], error: null },
      ]);
      const service = new WalletService(supabase);

      await expect(
        service.create(user, {
          direction: 'debit',
          amount: 500,
          title: 'Withdraw',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(calls.some((c) => c.method === 'insert')).toBe(false);
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
      const service = new WalletService(supabase);

      const result = await service.listForAdmin({
        kind: 'topup',
        direction: 'credit',
        status: 'completed',
      });

      expect(result).toEqual({ transactions: rows, total: 1 });
      expect(
        calls.some(
          (c) => c.method === 'eq' && c.args[0] === 'kind' && c.args[1] === 'topup',
        ),
      ).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' && c.args[0] === 'direction' && c.args[1] === 'credit',
        ),
      ).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'completed',
        ),
      ).toBe(true);
    });

    it('defaults to no filters and total 0 on an empty ledger', async () => {
      const { supabase } = createSupabaseMock([
        { data: [], error: null, count: 0 },
      ]);
      const service = new WalletService(supabase);

      await expect(service.listForAdmin({})).resolves.toEqual({
        transactions: [],
        total: 0,
      });
    });

    it('throws BadRequestException on query error', async () => {
      const { supabase } = createSupabaseMock([
        { data: null, error: { message: 'boom' } },
      ]);
      const service = new WalletService(supabase);

      await expect(service.listForAdmin({})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
