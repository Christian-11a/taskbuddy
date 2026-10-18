/**
 * paymentRows.ts
 *
 * Pure logic behind the client's Payments screen: which jobs have a payment, where the money is,
 * how a row reads from the client's point of view (money out, on hold, money back), month grouping,
 * summary totals and filters. No wallet or balance wording: this is a read-only history.
 */

import type { Dispute, Job } from './api';
import { peso } from './format';
import { heldAmount } from './heldMoney';

const DAY_MS = 86_400_000;
export const PAYMENT_WINDOW_DAYS = 90;
export const PAYMENT_ROW_CAP = 30;

export type PaymentState = 'held' | 'released' | 'refunded' | 'refunding' | 'settled';
export type PaymentFilter = 'all' | 'paid' | 'held' | 'refunds';

export const PAYMENT_FILTERS: { key: PaymentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'held', label: 'On hold' },
  { key: 'refunds', label: 'Refunds' },
];

export interface PaymentRow {
  jobId: string;
  title: string;
  amount: number;
  date: string;
  state: PaymentState;
  providerName?: string | null;
}

type EscrowInfo = { status?: string } | null | undefined;

/** Where a hired job's money is. Mirrors the wording of cancelledPayment in jobDetailView. */
export function paymentState(
  job: Pick<Job, 'status' | 'budget'>,
  escrow: EscrowInfo,
  resolution: Dispute['resolution'] | undefined,
): PaymentState {
  if (job.status === 'cancelled') {
    if (resolution === 'released_to_provider') return 'released';
    if (resolution === 'refunded_to_client') return 'refunded';
    if (resolution === 'reviewed') return 'settled';
    if (escrow?.status === 'refunded') return 'refunded';
    if (escrow?.status === 'released') return 'released';
    return 'refunding';
  }
  if (escrow?.status === 'released') return 'released';
  if (escrow?.status === 'refunded') return 'refunded';
  if (escrow?.status === 'held' || escrow?.status === 'disputed') return 'held';
  return job.status === 'completed' ? 'released' : 'held';
}

/** A hired job with a price: the only kind that has a payment. */
export function isPaidJob(job: Job): boolean {
  return !!job.assigned_provider_id && Number(job.budget ?? 0) > 0
    && !['open', 'recommending', 'expired'].includes(job.status);
}

export function jobDate(job: Job): string {
  return job.assigned_at ?? job.posted_at ?? job.created_at;
}

/** Hired jobs from the last 90 days, newest first, at most 30. */
export function recentPaidJobs(jobs: Job[], now: Date): Job[] {
  const since = now.getTime() - PAYMENT_WINDOW_DAYS * DAY_MS;
  return jobs
    .filter((job) => isPaidJob(job) && new Date(jobDate(job)).getTime() >= since)
    .sort((a, b) => new Date(jobDate(b)).getTime() - new Date(jobDate(a)).getTime())
    .slice(0, PAYMENT_ROW_CAP);
}

/** Held on active jobs, by the same rule as the Home card. */
export function heldOnActiveJobs(jobs: Job[], now: Date): number {
  return jobs.reduce((sum, job) => sum + (isPaidJob(job) ? heldAmount(job, now) ?? 0 : 0), 0);
}

function inMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/** Paid this month: payments released to a provider, dated this month. Held money is not counted. */
export function paidThisMonth(rows: PaymentRow[], now: Date): number {
  return rows.filter((r) => r.state === 'released' && inMonth(r.date, now)).reduce((s, r) => s + r.amount, 0);
}

/** Refunded this month: money that has come back, dated this month. A refund on its way is not counted. */
export function refundedThisMonth(rows: PaymentRow[], now: Date): number {
  return rows.filter((r) => r.state === 'refunded' && inMonth(r.date, now)).reduce((s, r) => s + r.amount, 0);
}

export function filterRows(rows: PaymentRow[], filter: PaymentFilter): PaymentRow[] {
  switch (filter) {
    case 'paid': return rows.filter((r) => r.state === 'released');
    case 'held': return rows.filter((r) => r.state === 'held');
    case 'refunds': return rows.filter((r) => r.state === 'refunded' || r.state === 'refunding');
    default: return rows;
  }
}

export interface MonthGroup {
  key: string;
  title: string;
  summary: string;
  rows: PaymentRow[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** Rows grouped by calendar month, newest month first, with a "Paid ₱X · Refunded ₱Y" line. */
export function groupByMonth(rows: PaymentRow[]): MonthGroup[] {
  const sorted = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const groups: MonthGroup[] = [];
  for (const row of sorted) {
    const d = new Date(row.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, summary: '', rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  for (const g of groups) {
    const paid = g.rows.filter((r) => r.state === 'released').reduce((s, r) => s + r.amount, 0);
    const refunded = g.rows.filter((r) => r.state === 'refunded').reduce((s, r) => s + r.amount, 0);
    g.summary = `Paid ${peso(paid)} · Refunded ${peso(refunded)}`;
  }
  return groups;
}

export type AmountTone = 'ink' | 'green' | 'grey';
export type PaymentIcon = 'out' | 'in' | null;
export type PillKind = 'onHold' | 'processing' | 'reviewed';

export interface RowView {
  /** The amount as drawn, with sign: "−₱300.00", "+₱300.00" or "₱300.00". */
  amountText: string;
  tone: AmountTone;
  icon: PaymentIcon;
  pill?: { kind: PillKind; label: string };
  caption: string;
  /** Read aloud for the whole row; never says "minus". */
  a11yLabel: string;
}

function pesos(amount: number): string {
  const whole = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${whole} pesos`;
}

/** How one payment reads to the client. */
export function rowView(row: PaymentRow): RowView {
  const amount = peso(row.amount);
  const who = row.providerName?.trim() || 'your provider';
  const spoken = pesos(row.amount);
  switch (row.state) {
    case 'released':
      return { amountText: `−${amount}`, tone: 'ink', icon: 'out', caption: `Paid to ${who}`,
        a11yLabel: `Paid ${spoken} to ${who}` };
    case 'held':
      return { amountText: `−${amount}`, tone: 'ink', icon: null, pill: { kind: 'onHold', label: 'On hold' },
        caption: 'Held until you confirm the job is done',
        a11yLabel: `${spoken} on hold until you confirm the job is done` };
    case 'refunded':
      return { amountText: `+${amount}`, tone: 'green', icon: 'in', caption: 'Refunded to your payment method',
        a11yLabel: `Refunded ${spoken}` };
    case 'refunding':
      return { amountText: `+${amount}`, tone: 'grey', icon: null, pill: { kind: 'processing', label: 'Processing' },
        caption: 'Refund on its way', a11yLabel: `Refund of ${spoken} is on its way` };
    default:
      return { amountText: amount, tone: 'grey', icon: null, pill: { kind: 'reviewed', label: 'Reviewed' },
        caption: 'Settled by admin review', a11yLabel: `${spoken}, reviewed by admin` };
  }
}
