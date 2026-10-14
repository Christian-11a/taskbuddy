import type { Job } from './api';
import { distanceLabel, urgencyMeta } from './format';

/**
 * Pure rules behind the provider Feed: which booking leads the screen, which
 * open jobs already carry this provider's pending application, and the counts
 * on the urgency pills.
 */

export type FeedUrgency = 'all' | 'urgent' | 'normal' | 'flexible';

/** Hired by a client and not started yet: the Feed's call-to-action goes to these first. */
const HIRED_STATUSES: readonly Job['status'][] = ['assigned', 'confirmed'];
/** Bookings the provider is due to work, hired or already started. */
const BOOKING_STATUSES: readonly Job['status'][] = ['assigned', 'confirmed', 'in_progress'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What the provider Feed's hero card shows:
 * - booking: the next booking, hired or still ahead;
 * - working: a job already started whose time has passed;
 * - none: nothing booked, so the card invites the provider to find work.
 */
export type ProviderHero =
  | {
      kind: 'booking';
      job: Job;
      /** The scheduled start, or null when the client has not picked a date. */
      when: Date | null;
      /** Other bookings starting in the next seven days. The hero shows the line only above zero. */
      moreThisWeek: number;
    }
  | { kind: 'working'; job: Job; when: Date | null }
  | { kind: 'none' };

function scheduledMs(job: Job): number | null {
  if (!job.scheduled_at) return null;
  const time = Date.parse(job.scheduled_at);
  return Number.isNaN(time) ? null : time;
}

/** The job with the earliest date. Undated jobs only win when no job has a date; ties keep list order. */
function soonest(jobs: readonly Job[]): Job | null {
  let best: Job | null = null;
  let bestAt = Infinity;
  for (const job of jobs) {
    const at = scheduledMs(job) ?? Infinity;
    if (best === null || at < bestAt) {
      best = job;
      bestAt = at;
    }
  }
  return best;
}

function startsAhead(job: Job, nowMs: number): boolean {
  const at = scheduledMs(job);
  return BOOKING_STATUSES.includes(job.status) && at !== null && at >= nowMs;
}

/**
 * The job the Feed leads with.
 * 1. A hired job (assigned or confirmed) waiting to be started. The soonest
 *    one wins, even with no date or a date that has passed, so the "Open"
 *    button that starts the work is never out of reach.
 * 2. Otherwise the soonest booking still ahead (scheduled now or later).
 * 3. Otherwise a job already in progress, whose time has passed.
 * 4. Otherwise nothing is booked.
 */
export function pickProviderHero(assigned: readonly Job[], now: Date): ProviderHero {
  const nowMs = now.getTime();
  const hero = soonest(assigned.filter((job) => HIRED_STATUSES.includes(job.status)))
    ?? soonest(assigned.filter((job) => startsAhead(job, nowMs)));
  if (!hero) {
    const working = soonest(assigned.filter((job) => job.status === 'in_progress'));
    if (!working) return { kind: 'none' };
    const workingAt = scheduledMs(working);
    return { kind: 'working', job: working, when: workingAt === null ? null : new Date(workingAt) };
  }

  const heroAt = scheduledMs(hero);
  const moreThisWeek = assigned.filter((job) => {
    if (job.id === hero.id || !BOOKING_STATUSES.includes(job.status)) return false;
    const at = scheduledMs(job);
    return at !== null && at >= nowMs && at < nowMs + WEEK_MS;
  }).length;
  return { kind: 'booking', job: hero, when: heroAt === null ? null : new Date(heroAt), moreThisWeek };
}

/**
 * The job ids this provider has a pending application on. `api.myApplications`
 * returns rows whose job sits under `jobs.id`; anything malformed is skipped.
 */
export function appliedJobIds(rows: readonly unknown[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    if (typeof row !== 'object' || row === null) continue;
    const { status, jobs } = row as { status?: unknown; jobs?: unknown };
    const id = typeof jobs === 'object' && jobs !== null ? (jobs as { id?: unknown }).id : undefined;
    if (status === 'pending' && typeof id === 'string') ids.add(id);
  }
  return ids;
}

/** The grey line under a feed row: "Applied · waiting" once the provider has applied, else the distance and urgency. */
export function feedRowMeta(job: Job, applied: boolean): string {
  if (applied) return 'Applied · waiting';
  return [distanceLabel(job.distance_km), urgencyMeta(job.urgency).label].filter(Boolean).join(' · ');
}

/** The part of `api.browseJobs`' summary the pill counts read. */
export interface FeedSummary {
  open_count: number;
  urgent_count: number;
}

/**
 * The number on each urgency pill. The server filters by urgency before it
 * counts, so a summary only describes the urgency that was loaded. An "all"
 * load gives All and Urgent from the summary and Normal and Flexible from the
 * loaded page; a single-urgency load gives only that pill a count.
 */
export function feedFilterCounts(
  loaded: FeedUrgency,
  summary: FeedSummary | null | undefined,
  jobs: readonly Job[],
): Partial<Record<FeedUrgency, number>> {
  const inPage = (urgency: FeedUrgency) => jobs.filter((job) => job.urgency === urgency).length;
  if (loaded === 'all') {
    return {
      all: summary?.open_count ?? jobs.length,
      urgent: summary?.urgent_count ?? inPage('urgent'),
      normal: inPage('normal'),
      flexible: inPage('flexible'),
    };
  }
  const counts: Partial<Record<FeedUrgency, number>> = {};
  counts[loaded] = summary?.open_count ?? jobs.length;
  return counts;
}
