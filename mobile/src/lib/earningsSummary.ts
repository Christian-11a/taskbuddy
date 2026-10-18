import type { PaymentHistoryEntry } from './api';
import { heldAmount, type HoldInput } from './heldMoney';
import { peso } from './format';

/** The job fields "On its way" reads: the held-money fields plus the provider's cut and complaint state. */
export type EarningsJob = HoldInput & {
  display_status?: string | null;
  fee?: { provider_receives?: number | string | null } | null;
};

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
  /** Money held for jobs in progress, in what the provider receives, without jobs under a complaint. */
  onItsWay: number;
  /** Money held on jobs with a complaint open: not on its way until the case is settled. */
  onHold: number;
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
  jobs: EarningsJob[] | null | undefined,
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
  let onItsWay = 0;
  let onHold = 0;
  for (const job of jobs ?? []) {
    const held = heldAmount(job, now);
    if (held === null) continue;
    const receives = Number(job.fee?.provider_receives);
    const amount = job.fee?.provider_receives != null && Number.isFinite(receives) && receives > 0 ? receives : held;
    if (job.display_status === 'disputed') onHold += amount;
    else onItsWay += amount;
  }
  return { paidThisMonth, paidTotal, onItsWay, onHold, feesThisMonth };
}

export interface ReleasedGroup {
  key: string;
  title: string;
  summary: string;
  rows: PaymentHistoryEntry[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** Released rows grouped by calendar month, newest first, each with a "Released ₱X · Fees ₱Y" line. */
export function groupReleasedByMonth(rows: PaymentHistoryEntry[]): ReleasedGroup[] {
  const sorted = [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const groups: ReleasedGroup[] = [];
  for (const row of sorted) {
    const d = new Date(row.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, summary: '', rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  for (const g of groups) {
    const released = g.rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const fees = g.rows.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
    const hasFees = g.rows.some((r) => r.commission_amount != null);
    g.summary = hasFees ? `Released ${peso(released)} · Fees ${peso(fees)}` : `Released ${peso(released)}`;
  }
  return groups;
}

/** Whole pesos read as "255 pesos", others with centavos. */
export function spokenPesos(amount: number | string): string {
  const n = Number(amount);
  return `${Number.isInteger(n) ? String(n) : n.toFixed(2)} pesos`;
}
