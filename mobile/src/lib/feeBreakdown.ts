import { peso } from './format';

/** The platform fee the backend sends on a job for the provider (api.ts Job.fee). */
export interface JobFee {
  /** A fraction, e.g. 0.15 for 15%. */
  rate: number;
  amount: number;
  provider_receives: number;
}

export interface FeeRows {
  /** "₱1,000.00" */
  price: string;
  /** "Platform fee (15%)" */
  feeLabel: string;
  /** "−₱150.00" */
  fee: string;
  /** "₱850.00" */
  receives: string;
  /** One line for screen readers: "Job price ₱1,000.00 · Platform fee (15%) −₱150.00 · You receive ₱850.00" */
  summary: string;
}

const MINUS = '−';

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** The fee and the job price, or null when either is missing or unreadable. */
function readFee(budget: number | string | null | undefined, fee: JobFee | null | undefined) {
  if (!fee) return null;
  const price = finiteNumber(budget);
  const rate = finiteNumber(fee.rate);
  const amount = finiteNumber(fee.amount);
  const receives = finiteNumber(fee.provider_receives);
  if (price === null || rate === null || amount === null || receives === null) return null;
  return { price, rate, amount, receives };
}

/** The rate as a percent with no trailing .0: 0.15 → "15", 0.125 → "12.5". */
export function feePercent(rate: number): string {
  return String(Math.round(rate * 10000) / 100);
}

/**
 * Before a provider proposes: the job price, the platform fee and what the
 * provider receives. Null when the fee is not on the job, so nothing shows.
 */
export function feeRows(budget: number | string | null | undefined, fee: JobFee | null | undefined): FeeRows | null {
  const f = readFee(budget, fee);
  if (!f) return null;
  const percent = feePercent(f.rate);
  const price = peso(f.price);
  const feeText = `${MINUS}${peso(f.amount)}`;
  const receives = peso(f.receives);
  const feeLabel = `Platform fee (${percent}%)`;
  return {
    price,
    feeLabel,
    fee: feeText,
    receives,
    summary: `Job price ${price} · ${feeLabel} ${feeText} · You receive ${receives}`,
  };
}

/** A booked or working job: what the provider will get once the client confirms. */
export function bookedPayoutLine(fee: JobFee | null | undefined): string | null {
  const receives = finiteNumber(fee?.provider_receives);
  if (receives === null) return null;
  return `You'll receive ${peso(receives)} when the client confirms the job is done.`;
}

/** A completed job whose payment was released: what was paid out, and the fee taken. */
export function paidOutLine(budget: number | string | null | undefined, fee: JobFee | null | undefined): string | null {
  const f = readFee(budget, fee);
  if (!f) return null;
  return `Paid out ${peso(f.receives)} (${peso(f.price)} ${MINUS} ${peso(f.amount)} fee)`;
}
