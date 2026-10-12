/**
 * Calendar-day helpers in the device's local time zone. A job's date is the
 * day it happens where the homeowner is, so days are compared locally, never in UTC.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms of an ISO timestamp, or null when it is missing or not a date. */
export function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

/** "YYYY-MM-DD" for the local calendar day of `date`. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD" for the local day of an ISO timestamp, or null when it has no valid date. */
export function dateKeyOf(iso: string | null | undefined): string | null {
  const time = timeOf(iso);
  return time === null ? null : dateKey(new Date(time));
}

/** Local midnight of a "YYYY-MM-DD" key. */
export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Epoch ms of the local midnight that starts the day holding `time`. */
export function startOfLocalDay(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Epoch ms of the local midnight `days` calendar days after `dayStart` (itself a local midnight). */
export function addLocalDays(dayStart: number, days: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}
