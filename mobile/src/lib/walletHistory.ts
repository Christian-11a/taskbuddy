import type { WalletTransaction } from './api';
import { dateKeyOf, parseDateKey, timeOf } from './localDate';

/** The filter pills on the Wallet history, in display order. */
export type WalletFilter = 'all' | 'in' | 'out' | 'held';

/** Whose wallet the history is. A homeowner's money pills read Added and Spent. */
export type WalletRole = 'homeowner' | 'provider';

const FILTER_KEYS: readonly WalletFilter[] = ['all', 'in', 'out', 'held'];

const FILTER_LABELS: Record<WalletRole, Record<WalletFilter, string>> = {
  homeowner: { all: 'All', in: 'Added', out: 'Spent', held: 'Held' },
  provider: { all: 'All', in: 'Money in', out: 'Money out', held: 'Held' },
};

/**
 * The filter pills for a wallet's history, in display order. The labels and what
 * Spent matches both depend on the role: see `matchesWalletFilter`.
 */
export function walletFiltersFor(role: WalletRole): readonly { key: WalletFilter; label: string }[] {
  return FILTER_KEYS.map((key) => ({ key, label: FILTER_LABELS[role][key] }));
}

/**
 * The jobs whose escrow hold came back. The backend never edits a hold when its job
 * is refunded; it adds a separate credit of kind `refund` on the same `job_id`
 * (migrations 0028 and 0040). A refund with no job cannot match any hold.
 */
export function refundedJobIds(txns: readonly WalletTransaction[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const txn of txns) {
    if (txn.direction === 'credit' && txn.kind === 'refund' && txn.job_id != null) ids.add(txn.job_id);
  }
  return ids;
}

/**
 * Which pill a transaction falls under. `refunded` is `refundedJobIds` of the whole
 * history, so the answer can depend on the other rows.
 *
 * In (Added, or Money in) is every credit. Held is the escrow hold, the debit taken
 * when a job is assigned, for both roles. Out is every other debit. For a homeowner
 * an escrow hold also counts as Spent, unless a refund came back for its job: a hold
 * that stayed is money paid for a job, and it can be in Spent and Held at once. For
 * a provider, Money out never counts an escrow hold.
 */
export function matchesWalletFilter(
  txn: WalletTransaction,
  filter: WalletFilter,
  role: WalletRole,
  refunded: ReadonlySet<string>,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'in':
      return txn.direction === 'credit';
    case 'out':
      if (txn.direction !== 'debit') return false;
      if (txn.kind !== 'escrow_hold') return true;
      return role === 'homeowner' && !(txn.job_id != null && refunded.has(txn.job_id));
    case 'held':
      return txn.kind === 'escrow_hold';
  }
}

export function filterWalletTransactions(
  txns: readonly WalletTransaction[],
  filter: WalletFilter,
  role: WalletRole,
): WalletTransaction[] {
  const refunded = refundedJobIds(txns);
  return txns.filter((txn) => matchesWalletFilter(txn, filter, role, refunded));
}

/** The number on each filter pill, counted from the loaded transactions. */
export function countWalletByFilter(
  txns: readonly WalletTransaction[],
  role: WalletRole,
): Record<WalletFilter, number> {
  const refunded = refundedJobIds(txns);
  const counts: Record<WalletFilter, number> = { all: 0, in: 0, out: 0, held: 0 };
  for (const txn of txns) {
    for (const key of FILTER_KEYS) {
      if (matchesWalletFilter(txn, key, role, refunded)) counts[key] += 1;
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
