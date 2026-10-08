import type { WalletTransaction } from './api';
import { dateKeyOf, parseDateKey, timeOf } from './localDate';

/** The filter pills on the Wallet history, in display order. */
export type WalletFilter = 'all' | 'in' | 'out' | 'held';

export const WALLET_FILTERS: readonly { key: WalletFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Money in' },
  { key: 'out', label: 'Money out' },
  { key: 'held', label: 'Held' },
];

/**
 * Which pill a transaction falls under. Money in is every credit. Held is the
 * escrow hold, the debit taken when a job is assigned. Money out is every other
 * debit, so an escrow hold is never counted there too.
 */
export function matchesWalletFilter(txn: WalletTransaction, filter: WalletFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'in':
      return txn.direction === 'credit';
    case 'out':
      return txn.direction === 'debit' && txn.kind !== 'escrow_hold';
    case 'held':
      return txn.kind === 'escrow_hold';
  }
}

export function filterWalletTransactions(
  txns: readonly WalletTransaction[],
  filter: WalletFilter,
): WalletTransaction[] {
  return txns.filter((txn) => matchesWalletFilter(txn, filter));
}

/** The number on each filter pill, counted from the loaded transactions. */
export function countWalletByFilter(txns: readonly WalletTransaction[]): Record<WalletFilter, number> {
  const counts: Record<WalletFilter, number> = { all: 0, in: 0, out: 0, held: 0 };
  for (const txn of txns) {
    for (const { key } of WALLET_FILTERS) {
      if (matchesWalletFilter(txn, key)) counts[key] += 1;
    }
  }
  return counts;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", "Oct 6", or "Sep 30, 2025" for a day in an earlier year. `day` is a local midnight. */
export function walletDayLabel(day: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (isSameDay(day, today)) return 'Today';
  if (isSameDay(day, yesterday)) return 'Yesterday';
  const monthDay = `${MONTHS[day.getMonth()]} ${day.getDate()}`;
  return day.getFullYear() === now.getFullYear() ? monthDay : `${monthDay}, ${day.getFullYear()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface WalletDaySection {
  /** The local "YYYY-MM-DD" day, or "undated". */
  key: string;
  label: string;
  transactions: WalletTransaction[];
}

/**
 * The history grouped by the local calendar day each transaction was created on:
 * newest day first, and newest transaction first within a day. A transaction
 * with no valid date goes last, under "Earlier".
 */
export function groupWalletByDay(txns: readonly WalletTransaction[], now: Date): WalletDaySection[] {
  const dated: { key: string; txn: WalletTransaction }[] = [];
  const undated: WalletTransaction[] = [];
  for (const txn of txns) {
    const key = dateKeyOf(txn.created_at);
    if (key === null) undated.push(txn);
    else dated.push({ key, txn });
  }
  dated.sort((a, b) => (timeOf(b.txn.created_at) ?? 0) - (timeOf(a.txn.created_at) ?? 0));

  const sections: WalletDaySection[] = [];
  for (const { key, txn } of dated) {
    const last = sections[sections.length - 1];
    if (last && last.key === key) {
      last.transactions.push(txn);
    } else {
      sections.push({ key, label: walletDayLabel(parseDateKey(key), now), transactions: [txn] });
    }
  }
  if (undated.length > 0) {
    sections.push({ key: 'undated', label: 'Earlier', transactions: undated });
  }
  return sections;
}
