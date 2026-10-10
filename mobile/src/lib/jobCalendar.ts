import type { Job } from './api';
import { dateKey, dateKeyOf, parseDateKey, timeOf } from './localDate';

/** Jobs that are over for good, so they are not waiting for a date. */
const FINISHED_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled', 'expired']);

/** What the month grid draws for one day. */
export interface CalendarMark {
  /** At least one job falls on this day: a dot. */
  marked?: boolean;
  /** The day the homeowner picked. */
  selected?: boolean;
  /** Today, drawn as a ring. */
  today?: boolean;
}

/**
 * A job belongs on the calendar while it can still happen: not once it is
 * cancelled or expired, and not an unfilled job whose date has passed.
 */
export function isOnCalendar(job: Job, now: Date): boolean {
  const scheduled = timeOf(job.scheduled_at);
  if (scheduled === null) return false;
  if (job.status === 'cancelled' || job.status === 'expired') return false;
  const unfilled = job.status === 'open' || job.status === 'recommending';
  return !(unfilled && scheduled < now.getTime());
}

/** The calendar jobs that fall on one day ("YYYY-MM-DD"), in the order given. */
export function jobsOnDay(jobs: readonly Job[], key: string, now: Date): Job[] {
  return jobs.filter((job) => isOnCalendar(job, now) && dateKeyOf(job.scheduled_at) === key);
}

/** Live jobs with no date yet, newest posted first. */
export function unscheduledJobs(jobs: readonly Job[]): Job[] {
  return jobs
    .filter((job) => timeOf(job.scheduled_at) === null && !FINISHED_STATUSES.has(job.status))
    .sort((a, b) => (timeOf(b.posted_at) ?? 0) - (timeOf(a.posted_at) ?? 0));
}

/** The marks for the month grid: a dot on each day with jobs, the picked day selected, today flagged. */
export function calendarMarks(
  jobs: readonly Job[],
  now: Date,
  selectedKey: string,
): Record<string, CalendarMark> {
  const marks: Record<string, CalendarMark> = {};
  for (const job of jobs) {
    const key = dateKeyOf(job.scheduled_at);
    if (key && isOnCalendar(job, now)) marks[key] = { ...marks[key], marked: true };
  }
  marks[selectedKey] = { ...marks[selectedKey], selected: true };
  const todayKey = dateKey(now);
  marks[todayKey] = { ...marks[todayKey], today: true };
  return marks;
}

/** How many calendar jobs fall on each day ("YYYY-MM-DD"), for the day labels. Days with none are left out. */
export function calendarCounts(jobs: readonly Job[], now: Date): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const job of jobs) {
    const key = dateKeyOf(job.scheduled_at);
    if (key && isOnCalendar(job, now)) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** "YYYY-MM-01" for the month `delta` months away from the month of `key`. */
export function shiftMonth(key: string, delta: number): string {
  const month = parseDateKey(key);
  return dateKey(new Date(month.getFullYear(), month.getMonth() + delta, 1));
}

/** "October 2026" */
export function monthTitle(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "Fri, Oct 9" */
export function dayHeading(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Friday, October 9", for screen readers. */
export function dayLabel(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** A calendar day for screen readers: "October 10, 1 job", "October 7, today", "October 7, today, 2 jobs". */
export function calendarDayLabel(key: string, today: boolean, jobCount: number): string {
  const day = parseDateKey(key).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const jobs = jobCount > 0 ? `${jobCount} job${jobCount === 1 ? '' : 's'}` : '';
  return [day, today ? 'today' : '', jobs].filter(Boolean).join(', ');
}
