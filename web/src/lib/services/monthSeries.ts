// ─── Month series helpers ─────────────────────────────────────────────────────
// Shared by the API mapping (mapAnalytics.ts) and the browser fallback
// (browserAnalytics.ts), so both produce the same series. Months are keys
// "YYYY-MM"; the window ends at the current UTC month.

export const SERIES_MONTHS = 12;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/**
 * Current calendar month as "YYYY-MM", in UTC.
 * Months are UTC to match the backend analytics; Manila months would need a backend change.
 */
export function currentMonthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** Shifts a "YYYY-MM" key by whole months: addMonths("2026-01", -1) === "2025-12". */
export function addMonths(key: string, delta: number): string {
  const match = MONTH_KEY.exec(key);
  if (!match) throw new Error(`Not a YYYY-MM month key: ${key}`);
  const index = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The calendar month before a "YYYY-MM" key: previousMonth("2026-01") === "2025-12". */
export function previousMonth(key: string): string {
  return addMonths(key, -1);
}

/** `count` consecutive month keys, oldest first, ending at `endMonth`. */
export function monthsEndingAt(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(endMonth, i - (count - 1)));
}

/**
 * Fills the window of `count` months ending at `endMonth` with one point per
 * month, oldest first. Months with no entry are 0. Entries outside the window
 * are dropped; duplicate months are summed.
 */
export function fillMonths(
  points: readonly { month: string; amount: number }[],
  endMonth: string,
  count: number = SERIES_MONTHS,
): { month: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const { month, amount } of points) {
    if (!Number.isFinite(amount)) continue;
    sums.set(month, (sums.get(month) ?? 0) + amount);
  }
  return monthsEndingAt(endMonth, count).map((month) => ({
    month,
    amount: Math.round((sums.get(month) ?? 0) * 100) / 100,
  }));
}

/** Percent change from `previous` to `current`, or null when there is nothing to compare against (previous is 0). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Value of a series at one month key; 0 when the month is absent. */
export function monthValue(points: readonly { month: string; value: number }[], key: string): number {
  return points.find((p) => p.month === key)?.value ?? 0;
}

/** "Oct" or "Oct 2026". Keys that are not "YYYY-MM" (e.g. already a label) are returned unchanged. */
export function monthLabel(key: string, withYear: boolean): string {
  const match = MONTH_KEY.exec(key);
  if (!match) return key;
  const name = MONTH_NAMES[Number(match[2]) - 1] ?? key;
  return withYear ? `${name} ${match[1]}` : name;
}

/** Whether a series spans a year boundary, so its labels need the year. */
export function spansYears(points: readonly { month: string }[]): boolean {
  if (points.length < 2) return false;
  const first = points[0].month.slice(0, 4);
  const last = points[points.length - 1].month.slice(0, 4);
  return first !== last;
}

/** Chart points with display labels; the year is shown when the range crosses a year boundary. */
export function toChartSeries<T extends { month: string; value: number }>(points: readonly T[]): { month: string; value: number }[] {
  const withYear = spansYears(points);
  return points.map((p) => ({ month: monthLabel(p.month, withYear), value: p.value }));
}
