import type { Job } from './api';
import { addLocalDays, startOfLocalDay, timeOf } from './localDate';
import { isOpenJob, type ProposalCounts } from './proposalCounts';

/** The filter pills on My Jobs, in display order. */
export type JobListFilter = 'all' | 'needs' | 'booked' | 'waiting' | 'done' | 'closed';

export const JOB_LIST_FILTERS: readonly { key: JobListFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs', label: 'Needs you' },
  { key: 'booked', label: 'Booked' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Done' },
  { key: 'closed', label: 'Closed' },
];

const BOOKED_STATUSES: ReadonlySet<string> = new Set(['assigned', 'confirmed', 'in_progress']);
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'expired']);

/** Jobs that are over: completed, cancelled or expired. */
const FINISHED_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled', 'expired']);

/** Done and Closed are one newest-first list; the other filters group by date. */
const FLAT_FILTERS: ReadonlySet<JobListFilter> = new Set(['done', 'closed']);

const scheduledAt = (job: Job): number => timeOf(job.scheduled_at) ?? 0;
const postedAt = (job: Job): number => timeOf(job.posted_at) ?? 0;
const isFinished = (job: Job): boolean => FINISHED_STATUSES.has(job.status);

/** Whether a job belongs under a filter pill. "Needs you" and "Waiting" split open jobs by pending proposals. */
export function matchesJobFilter(job: Job, filter: JobListFilter, proposals: ProposalCounts): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'needs':
      return isOpenJob(job) && (proposals[job.id] ?? 0) > 0;
    case 'waiting':
      return isOpenJob(job) && (proposals[job.id] ?? 0) === 0;
    case 'booked':
      return BOOKED_STATUSES.has(job.status);
    case 'done':
      return job.status === 'completed';
    case 'closed':
      return CLOSED_STATUSES.has(job.status);
  }
}

export function filterJobs(jobs: readonly Job[], filter: JobListFilter, proposals: ProposalCounts): Job[] {
  return jobs.filter((job) => matchesJobFilter(job, filter, proposals));
}

/** The number on each filter pill, counted from the loaded jobs. */
export function countJobsByFilter(jobs: readonly Job[], proposals: ProposalCounts): Record<JobListFilter, number> {
  const counts: Record<JobListFilter, number> = { all: 0, needs: 0, booked: 0, waiting: 0, done: 0, closed: 0 };
  for (const job of jobs) {
    for (const { key } of JOB_LIST_FILTERS) {
      if (matchesJobFilter(job, key, proposals)) counts[key] += 1;
    }
  }
  return counts;
}

/** Needs you and Waiting split open jobs by their proposal counts. */
const PROPOSAL_FILTERS: ReadonlySet<JobListFilter> = new Set(['needs', 'waiting']);

/**
 * The number on a filter pill, or undefined while it cannot be known yet. Until
 * the proposal counts are in, Needs you and Waiting have no number: a job whose
 * count has not arrived would read as waiting. The other pills need only the jobs.
 */
export function filterPillCount(
  filter: JobListFilter,
  counts: Readonly<Record<JobListFilter, number>>,
  proposalsLoading: boolean,
): number | undefined {
  return proposalsLoading && PROPOSAL_FILTERS.has(filter) ? undefined : counts[filter];
}

export interface JobListSection {
  key: 'thisWeek' | 'later' | 'noDate' | 'earlier' | 'finished' | 'list';
  /** Heading text (the screen shows it in capitals). Absent for the flat list. */
  label?: string;
  jobs: Job[];
}

/**
 * The sections shown under a filter. Needs you, Booked and Waiting group by
 * scheduled date: this week (Sunday to Saturday), later, no date yet, and
 * earlier for dates already past. All groups its live jobs the same way, then
 * adds a FINISHED group last for completed, cancelled and expired jobs, newest
 * posted first, so a finished job never reads as upcoming. Done and Closed are
 * one newest-first list.
 */
export function jobListSections(
  jobs: readonly Job[],
  filter: JobListFilter,
  proposals: ProposalCounts,
  now: Date,
): JobListSection[] {
  const visible = filterJobs(jobs, filter, proposals);
  if (visible.length === 0) return [];
  if (FLAT_FILTERS.has(filter)) {
    return [{ key: 'list', jobs: visible.sort((a, b) => postedAt(b) - postedAt(a)) }];
  }
  if (filter !== 'all') return groupByDate(visible, now);
  const dated = groupByDate(visible.filter((job) => !isFinished(job)), now);
  const finished = visible.filter(isFinished).sort((a, b) => postedAt(b) - postedAt(a));
  return finished.length > 0 ? [...dated, { key: 'finished', label: 'Finished', jobs: finished }] : dated;
}

function groupByDate(jobs: readonly Job[], now: Date): JobListSection[] {
  const today = startOfLocalDay(now.getTime());
  // The next Sunday starts the next week, matching the Sunday-first calendar grid.
  const nextWeek = addLocalDays(today, 7 - now.getDay());
  const thisWeek: Job[] = [];
  const later: Job[] = [];
  const noDate: Job[] = [];
  const earlier: Job[] = [];

  for (const job of jobs) {
    const scheduled = timeOf(job.scheduled_at);
    if (scheduled === null) {
      noDate.push(job);
      continue;
    }
    const day = startOfLocalDay(scheduled);
    if (day < today) earlier.push(job);
    else if (day < nextWeek) thisWeek.push(job);
    else later.push(job);
  }

  const sections: JobListSection[] = [
    { key: 'thisWeek', label: 'This week', jobs: thisWeek.sort((a, b) => scheduledAt(a) - scheduledAt(b)) },
    { key: 'later', label: 'Later', jobs: later.sort((a, b) => scheduledAt(a) - scheduledAt(b)) },
    { key: 'noDate', label: 'No date yet', jobs: noDate.sort((a, b) => postedAt(b) - postedAt(a)) },
    { key: 'earlier', label: 'Earlier', jobs: earlier.sort((a, b) => scheduledAt(b) - scheduledAt(a)) },
  ];
  return sections.filter((section) => section.jobs.length > 0);
}
