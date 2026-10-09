/**
 * My Work (provider): what a provider is doing, grouped by where each job stands.
 *
 * Two lists feed it: the jobs the provider is hired for (`GET /jobs/assigned`)
 * and the proposals they sent (`GET /applications/mine`). Both load once. The
 * rows, filter counts and groups are worked out here on the device, so the
 * numbers on the pills always match the rows under them.
 */

import type { JobRowTone } from '../components/ui/JobRow';
import type { Job } from './api';
import { timeOf } from './localDate';

/** The filter pills on My Work, in display order. */
export type MyWorkFilter = 'all' | 'applied' | 'booked' | 'working' | 'done' | 'closed';

/** The status group a row sits in. Every filter except All is one group. */
export type MyWorkGroup = Exclude<MyWorkFilter, 'all'>;

export const MY_WORK_FILTERS: readonly { key: MyWorkFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'applied', label: 'Applied' },
  { key: 'booked', label: 'Booked' },
  { key: 'working', label: 'Working' },
  { key: 'done', label: 'Done' },
  { key: 'closed', label: 'Closed' },
];

/** The order the groups are listed in under All. */
const GROUP_ORDER: readonly MyWorkGroup[] = ['working', 'booked', 'applied', 'done', 'closed'];

/** The heading over each group under All. The screen shows it in capitals. */
export const MY_WORK_GROUP_LABELS: Record<MyWorkGroup, string> = {
  working: 'Working',
  booked: 'Booked',
  applied: 'Applied',
  done: 'Done',
  closed: 'Closed',
};

/** A proposal as `GET /applications/mine` returns it, with the job it is for. */
export interface MyWorkApplication {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  applied_at?: string | null;
  decided_at?: string | null;
  jobs: { id: string; title: string; status: string; budget?: number | null } | null;
}

/** One row on My Work, already placed in its group. */
export interface MyWorkRow {
  /** Unique on the screen: `job:<id>` for a hired job, `proposal:<id>` for a proposal. */
  key: string;
  jobId: string;
  group: MyWorkGroup;
  title: string;
  /** The status line under the title, e.g. "Working · 1/2 tasks done". */
  meta: string;
  tone: JobRowTone;
  budget: number | null;
  /** The job's scheduled date (ISO). Proposals have none: that list does not carry it. */
  scheduledAt: string | null;
  /** Epoch ms of `scheduledAt`, or null when the job has no date. */
  scheduledTime: number | null;
  /** Epoch ms of the latest thing that happened: finished, assigned, proposal sent or decided. */
  latestAt: number;
}

/** A section of rows on the screen. */
export interface MyWorkSection {
  group: MyWorkGroup;
  /** Heading shown under All. Absent under one filter, where the pill already names the group. */
  label?: string;
  rows: MyWorkRow[];
}

type HiredGroup = Exclude<MyWorkGroup, 'applied'>;

/** Which group a hired job is in, by its status. Statuses not listed here are left off the screen. */
const HIRED_GROUP: Partial<Record<string, HiredGroup>> = {
  in_progress: 'working',
  assigned: 'booked',
  confirmed: 'booked',
  completed: 'done',
  cancelled: 'closed',
  expired: 'closed',
};

const TONE: Record<MyWorkGroup, JobRowTone> = {
  working: 'booked',
  booked: 'booked',
  applied: 'applied',
  done: 'done',
  closed: 'done',
};

/**
 * Turns the provider's hired jobs and proposals into rows. A proposal that was
 * accepted is left out, because its job is already listed as a hired job. A job
 * that appears in both lists is listed once, as the hired job.
 */
export function buildMyWorkRows(
  applications: readonly MyWorkApplication[],
  assignedJobs: readonly Job[],
): MyWorkRow[] {
  const hired = assignedJobs
    .map(hiredRow)
    .filter((row): row is MyWorkRow => row !== null);
  const hiredJobIds = new Set(hired.map((row) => row.jobId));
  const proposals = applications
    .map(proposalRow)
    .filter((row): row is MyWorkRow => row !== null && !hiredJobIds.has(row.jobId));
  return [...hired, ...proposals];
}

/** How many rows each filter pill counts. */
export function countMyWork(rows: readonly MyWorkRow[]): Record<MyWorkFilter, number> {
  const counts: Record<MyWorkFilter, number> = {
    all: rows.length,
    applied: 0,
    booked: 0,
    working: 0,
    done: 0,
    closed: 0,
  };
  for (const row of rows) counts[row.group] += 1;
  return counts;
}

/**
 * The sections to show under a filter. Under All, every group that has rows
 * appears in order with its label. Under one filter there is a single flat
 * section with no label. Working and Booked run soonest first; the rest run
 * most recent first.
 */
export function myWorkSections(rows: readonly MyWorkRow[], filter: MyWorkFilter): MyWorkSection[] {
  const groups = filter === 'all' ? GROUP_ORDER : GROUP_ORDER.filter((group) => group === filter);
  return groups.flatMap((group) => {
    const groupRows = rows
      .filter((row) => row.group === group)
      .sort(group === 'working' || group === 'booked' ? bySchedule : byRecent);
    if (groupRows.length === 0) return [];
    return [{ group, label: filter === 'all' ? MY_WORK_GROUP_LABELS[group] : undefined, rows: groupRows }];
  });
}

function hiredRow(job: Job): MyWorkRow | null {
  const group = HIRED_GROUP[job.status];
  if (!group) return null;
  const scheduledTime = timeOf(job.scheduled_at);
  return {
    key: `job:${job.id}`,
    jobId: job.id,
    group,
    title: job.title,
    meta: hiredMeta(job, group),
    tone: TONE[group],
    budget: job.budget ?? null,
    scheduledAt: job.scheduled_at ?? null,
    scheduledTime,
    latestAt: timeOf(job.completed_at) ?? timeOf(job.assigned_at) ?? scheduledTime ?? 0,
  };
}

function hiredMeta(job: Job, group: HiredGroup): string {
  switch (group) {
    case 'working': {
      const tasks = job.job_tasks ?? [];
      if (tasks.length === 0) return 'Working';
      const done = tasks.filter((task) => task.is_done).length;
      return `Working · ${done}/${tasks.length} tasks done`;
    }
    case 'booked':
      // A hire waits for the provider's answer until they confirm it.
      return job.status === 'assigned' ? 'Booked · Awaiting your answer' : 'Booked · Confirmed';
    case 'done':
      return 'Done';
    case 'closed':
      return closedMeta(job.status);
  }
}

function proposalRow(application: MyWorkApplication): MyWorkRow | null {
  const job = application.jobs;
  // An accepted proposal is the hired job, which is listed from the hired jobs.
  if (!job || application.status === 'accepted') return null;
  const base = {
    key: `proposal:${application.id}`,
    jobId: job.id,
    title: job.title,
    budget: job.budget ?? null,
    scheduledAt: null,
    scheduledTime: null,
    latestAt: timeOf(application.decided_at) ?? timeOf(application.applied_at) ?? 0,
  };
  if (job.status === 'cancelled' || job.status === 'expired') {
    return { ...base, group: 'closed', meta: closedMeta(job.status), tone: TONE.closed };
  }
  switch (application.status) {
    case 'pending':
      return { ...base, group: 'applied', meta: 'Applied · waiting', tone: TONE.applied };
    case 'rejected':
      return { ...base, group: 'closed', meta: 'Closed · Not selected', tone: TONE.closed };
    case 'withdrawn':
      return { ...base, group: 'closed', meta: 'Closed · Withdrawn', tone: TONE.closed };
    default:
      return null;
  }
}

function closedMeta(status: string): string {
  return `Closed · ${status === 'expired' ? 'Expired' : 'Cancelled'}`;
}

/** Soonest first, with rows that have no date last. */
function bySchedule(a: MyWorkRow, b: MyWorkRow): number {
  if (a.scheduledTime === b.scheduledTime) return a.title.localeCompare(b.title);
  if (a.scheduledTime === null) return 1;
  if (b.scheduledTime === null) return -1;
  return a.scheduledTime - b.scheduledTime;
}

/** Most recent first. */
function byRecent(a: MyWorkRow, b: MyWorkRow): number {
  return b.latestAt - a.latestAt || a.title.localeCompare(b.title);
}
