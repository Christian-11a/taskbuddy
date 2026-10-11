import type { WalletTransaction } from '../api';
import {
  countWalletByFilter,
  filterWalletTransactions,
  groupWalletByDay,
  matchesWalletFilter,
  refundedJobIds,
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

// Escrow holds on two jobs. Job 2's hold came back as a refund on the same job_id; job 1's stayed paid.
const paidHold = txn('paid-hold', { direction: 'debit', kind: 'escrow_hold', job_id: 'job-1' });
const refundedHold = txn('refunded-hold', { direction: 'debit', kind: 'escrow_hold', job_id: 'job-2' });
const refundForJob2 = txn('refund-for-job-2', { direction: 'credit', kind: 'refund', job_id: 'job-2' });

const ids = (list: WalletTransaction[]) => list.map((item) => item.id);

describe('Wallet history filters', () => {
  it('All keeps every transaction in its original order', () => {
    expect(ids(filterWalletTransactions(ledger, 'all', 'homeowner'))).toEqual(ids(ledger));
  });

  it('In is every credit, including vouchers and refunds', () => {
    expect(ids(filterWalletTransactions(ledger, 'in', 'homeowner'))).toEqual(['topup', 'voucher', 'refund']);
  });

  it('Spent is every debit for a homeowner, including an escrow hold whose job was not refunded', () => {
    expect(ids(filterWalletTransactions(ledger, 'out', 'homeowner'))).toEqual(['hold', 'withdrawal', 'adjustment']);
    expect(matchesWalletFilter(hold, 'out', 'homeowner', refundedJobIds(ledger))).toBe(true);
    expect(matchesWalletFilter(pendingWithdrawal, 'out', 'homeowner', refundedJobIds(ledger))).toBe(true);
  });

  it('Held is only the escrow holds', () => {
    expect(ids(filterWalletTransactions(ledger, 'held', 'homeowner'))).toEqual(['hold']);
  });

  it('counts each pill from the loaded transactions, and in and out add up to every debit or credit', () => {
    expect(countWalletByFilter(ledger, 'homeowner')).toEqual({ all: 6, in: 3, out: 3, held: 1 });
    expect(countWalletByFilter([], 'homeowner')).toEqual({ all: 0, in: 0, out: 0, held: 0 });
  });
});

describe('a homeowner escrow hold once its job is refunded', () => {
  const history = [paidHold, refundedHold, refundForJob2];
  const refunded = refundedJobIds(history);

  it.each([
    ['a hold whose job was not refunded: Spent and Held', paidHold, { in: false, out: true, held: true }],
    ['a hold whose job was refunded: Held only', refundedHold, { in: false, out: false, held: true }],
    ['the refund credit: Added only', refundForJob2, { in: true, out: false, held: false }],
    ['a plain debit: Spent only', adjustment, { in: false, out: true, held: false }],
    ['a debit withdrawal: Spent only', pendingWithdrawal, { in: false, out: true, held: false }],
  ])('%s', (_label, transaction, expected) => {
    expect(matchesWalletFilter(transaction, 'in', 'homeowner', refunded)).toBe(expected.in);
    expect(matchesWalletFilter(transaction, 'out', 'homeowner', refunded)).toBe(expected.out);
    expect(matchesWalletFilter(transaction, 'held', 'homeowner', refunded)).toBe(expected.held);
  });

  it('a refund only clears the hold on the same job, and a hold or refund with no job never matches', () => {
    const otherJobRefund = txn('other-refund', { direction: 'credit', kind: 'refund', job_id: 'job-9' });

    expect(ids(filterWalletTransactions([paidHold, otherJobRefund, hold, refund], 'out', 'homeowner')))
      .toEqual(['paid-hold', 'hold']);
    expect(ids(filterWalletTransactions([hold, refund], 'out', 'homeowner'))).toEqual(['hold']);
  });

  it('counts the pills for a history with a refunded hold, and a provider Money out never counts a hold', () => {
    const withRefund = [paidHold, refundedHold, refundForJob2, pendingWithdrawal];

    expect(countWalletByFilter(withRefund, 'homeowner')).toEqual({ all: 4, in: 1, out: 2, held: 2 });
    expect(countWalletByFilter(withRefund, 'provider')).toEqual({ all: 4, in: 1, out: 1, held: 2 });
    expect(matchesWalletFilter(paidHold, 'out', 'provider', refundedJobIds(withRefund))).toBe(false);
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
