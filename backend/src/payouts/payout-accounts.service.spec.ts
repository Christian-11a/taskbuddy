import { PayoutAccountsService } from './payout-accounts.service';
import type { Profile } from '../common/types';

/** Tiny thenable query builder: every chained call returns itself. */
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit']) {
    b[m] = jest.fn(() => b);
  }
  b.then = (resolve: (r: unknown) => unknown) => resolve(result);
  return b;
}

describe('PayoutAccountsService.history', () => {
  it('adds the withheld commission to payout rows only', async () => {
    const ledger = [
      { id: 't1', kind: 'payout', job_id: 'j1', amount: 850 },
      { id: 't2', kind: 'topup', job_id: null, amount: 500 },
    ];
    const tables: Record<string, ReturnType<typeof builder>> = {
      wallet_transactions: builder({ data: ledger, error: null }),
      escrow_transactions: builder({
        data: [{ job_id: 'j1', commission_amount: '150.00' }],
        error: null,
      }),
    };
    const supabase = { admin: { from: (t: string) => tables[t] } };
    const service = new PayoutAccountsService(supabase as never, {} as never);

    const rows = await service.history({ id: 'p1' } as Profile);

    expect(rows).toEqual([
      { id: 't1', kind: 'payout', job_id: 'j1', amount: 850, commission_amount: 150 },
      { id: 't2', kind: 'topup', job_id: null, amount: 500, commission_amount: null },
    ]);
  });
});
