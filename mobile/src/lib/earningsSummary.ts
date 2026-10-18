import type { PaymentHistoryEntry } from './api';
import { heldAmount, type HoldInput } from './heldMoney';

/** Payout rows only, newest first as the server sends them. */
export function payoutRows(rows: PaymentHistoryEntry[] | null | undefined): PaymentHistoryEntry[] {
  return (rows ?? []).filter((row) => row.kind === 'payout');
}

function sameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export interface EarningsSummary {
  paidThisMonth: number;
  paidTotal: number;
  onItsWay: number;
  /** Null when no payout row carries a fee figure (older server): the card is hidden. */
  feesThisMonth: number | null;
}

/** Money sent to the provider's account: withdrawal debits. They carry no job_id, so they cannot be matched to one release. */
export function sentRows(rows: PaymentHistoryEntry[] | null | undefined): PaymentHistoryEntry[] {
  return (rows ?? []).filter((row) => row.kind === 'withdrawal' && row.direction === 'debit');
}

/** Totals for the Earnings screen. Released credits (the 'payout' rows) are what the provider earned; each is always completed. */
export function summarizeEarnings(
  rows: PaymentHistoryEntry[] | null | undefined,
  jobs: HoldInput[] | null | undefined,
  now: Date,
): EarningsSummary {
  const payouts = payoutRows(rows);
  const sent = payouts;
  const paidTotal = sent.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const paidThisMonth = sent
    .filter((row) => sameMonth(row.created_at, now))
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const hasFees = payouts.some((row) => row.commission_amount != null);
  const feesThisMonth = hasFees
    ? sent
        .filter((row) => sameMonth(row.created_at, now))
        .reduce((sum, row) => sum + Number(row.commission_amount ?? 0), 0)
    : null;
  const onItsWay = (jobs ?? []).reduce((sum, job) => sum + (heldAmount(job, now) ?? 0), 0);
  return { paidThisMonth, paidTotal, onItsWay, feesThisMonth };
}
