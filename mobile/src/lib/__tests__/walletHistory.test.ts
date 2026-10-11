import type { WalletTransaction } from '../api';
import {
  countWalletByFilter,
  filterWalletTransactions,
  groupWalletByDay,
  matchesWalletFilter,
  walletDayLabel,
  walletFiltersFor,
} from '../walletHistory';

// Friday 9 October 2026, mid-afternoon, local time.
const NOW = new Date(2026, 9, 9, 15, 0);

function at(year: number, monthIndex: number, day: number, hour = 9, minute = 0): string {
  return new Date(year, monthIndex, day, hour, minute).toISOString();
}

function txn(
  id: string,
  fields: Partial<WalletTransaction> & Pick<WalletTransaction, 'direction' | 'kind'>,
): WalletTransaction {
  return {
    id,
    profile_id: 'homeowner',
    status: 'completed',
    amount: 100,
    title: id,
    job_id: null,
    created_at: at(2026, 9, 9),
    ...fields,
  } as WalletTransaction;
}

const topUp = txn('topup', { direction: 'credit', kind: 'topup' });
const voucher = txn('voucher', { direction: 'credit', kind: 'recovery_credit' });
const refund = txn('refund', { direction: 'credit', kind: 'refund' });
const hold = txn('hold', { direction: 'debit', kind: 'escrow_hold' });
const pendingWithdrawal = txn('withdrawal', { direction: 'debit', kind: 'withdrawal', status: 'pending' });
const adjustment = txn('adjustment', { direction: 'debit', kind: 'adjustment' });

const ledger = [topUp, voucher, refund, hold, pendingWithdrawal, adjustment];

const ids = (list: WalletTransaction[]) => list.map((item) => item.id);

describe('Wallet history filters', () => {
  it('All keeps every transaction in its original order', () => {
    expect(ids(filterWalletTransactions(ledger, 'all'))).toEqual(ids(ledger));
  });

  it('In is every credit, including vouchers and refunds', () => {
    expect(ids(filterWalletTransactions(ledger, 'in'))).toEqual(['topup', 'voucher', 'refund']);
  });

  it('Out is every debit except escrow holds, including pending withdrawals', () => {
    expect(ids(filterWalletTransactions(ledger, 'out'))).toEqual(['withdrawal', 'adjustment']);
    expect(matchesWalletFilter(hold, 'out')).toBe(false);
    expect(matchesWalletFilter(pendingWithdrawal, 'out')).toBe(true);
  });

  it('Held is only the escrow holds', () => {
    expect(ids(filterWalletTransactions(ledger, 'held'))).toEqual(['hold']);
  });

  it('counts each pill from the loaded transactions, and in and out add up to every debit or credit', () => {
    expect(countWalletByFilter(ledger)).toEqual({ all: 6, in: 3, out: 2, held: 1 });
    expect(countWalletByFilter([])).toEqual({ all: 0, in: 0, out: 0, held: 0 });
  });
});

describe('walletFiltersFor', () => {
  it('labels a homeowner wallet Added and Spent, in the same order', () => {
    expect(walletFiltersFor('homeowner')).toEqual([
      { key: 'all', label: 'All' },
      { key: 'in', label: 'Added' },
      { key: 'out', label: 'Spent' },
      { key: 'held', label: 'Held' },
    ]);
  });

  it('keeps Money in and Money out for a provider wallet', () => {
    expect(walletFiltersFor('provider')).toEqual([
      { key: 'all', label: 'All' },
      { key: 'in', label: 'Money in' },
      { key: 'out', label: 'Money out' },
      { key: 'held', label: 'Held' },
    ]);
  });
});

describe('walletDayLabel', () => {
  it('reads Today, then Yesterday, then month and day', () => {
    expect(walletDayLabel(new Date(2026, 9, 9), NOW)).toBe('Today');
    expect(walletDayLabel(new Date(2026, 9, 8), NOW)).toBe('Yesterday');
    expect(walletDayLabel(new Date(2026, 9, 6), NOW)).toBe('Oct 6');
  });

  it('adds the year only for a day in an earlier year', () => {
    expect(walletDayLabel(new Date(2025, 8, 30), NOW)).toBe('Sep 30, 2025');
  });
});

describe('groupWalletByDay', () => {
  it('groups by local calendar day with newest day first, and labels each day', () => {
    const sections = groupWalletByDay(
      [
        txn('oct6', { direction: 'debit', kind: 'escrow_hold', created_at: at(2026, 9, 6, 18) }),
        txn('today', { direction: 'credit', kind: 'topup', created_at: at(2026, 9, 9, 8) }),
        txn('yesterday', { direction: 'credit', kind: 'refund', created_at: at(2026, 9, 8, 12) }),
      ],
      NOW,
    );

    expect(sections.map((section) => section.label)).toEqual(['Today', 'Yesterday', 'Oct 6']);
    expect(sections.map((section) => ids(section.transactions))).toEqual([['today'], ['yesterday'], ['oct6']]);
  });

  it('keeps the newest transaction first within a day, whatever order the list arrives in', () => {
    const sections = groupWalletByDay(
      [
        txn('early', { direction: 'credit', kind: 'topup', created_at: at(2026, 9, 9, 7) }),
        txn('late', { direction: 'debit', kind: 'escrow_hold', created_at: at(2026, 9, 9, 16) }),
        txn('mid', { direction: 'credit', kind: 'refund', created_at: at(2026, 9, 9, 11) }),
      ],
      NOW,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Today');
    expect(ids(sections[0].transactions)).toEqual(['late', 'mid', 'early']);
  });

  it('puts both ends of one local day under the same heading', () => {
    const sections = groupWalletByDay(
      [
        txn('just-after-midnight', { direction: 'credit', kind: 'topup', created_at: at(2026, 9, 8, 0, 10) }),
        txn('just-before-midnight', { direction: 'debit', kind: 'withdrawal', created_at: at(2026, 9, 8, 23, 50) }),
      ],
      NOW,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Yesterday');
    expect(ids(sections[0].transactions)).toEqual(['just-before-midnight', 'just-after-midnight']);
  });

  it('puts a transaction without a valid date last, under Earlier', () => {
    const sections = groupWalletByDay(
      [
        txn('no-date', { direction: 'credit', kind: 'adjustment', created_at: 'not a date' }),
        txn('today', { direction: 'credit', kind: 'topup', created_at: at(2026, 9, 9, 8) }),
      ],
      NOW,
    );

    expect(sections.map((section) => section.label)).toEqual(['Today', 'Earlier']);
    expect(ids(sections[1].transactions)).toEqual(['no-date']);
  });

  it('returns no sections when there are no transactions', () => {
    expect(groupWalletByDay([], NOW)).toEqual([]);
  });
});
