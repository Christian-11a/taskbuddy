import type { Job, JobApplication } from './api';

const OPEN_STATUSES: readonly string[] = ['open', 'recommending'];
const BOOKED_STATUSES: readonly string[] = ['confirmed', 'assigned', 'in_progress'];

/** Home checks pending proposals on this many open jobs, newest first. */
export const PROPOSAL_CHECK_LIMIT = 5;

/** Applications per job id from `api.jobApplications`; undefined when that lookup failed or has not finished. */
export type ApplicationsByJob = Record<string, JobApplication[] | undefined>;

/**
 * What Home's hero card shows. Every loaded Home has one kind:
 * - proposals: open jobs with proposals to review (`pending` is the only applicant list the hero uses, so "N applied" and "N proposals waiting" always agree);
 * - working: a job under way, which may need the client's confirmation;
 * - booking: the next booking, or a booked job whose time has passed or was never set;
 * - searching: an open job with no proposals yet;
 * - empty: no job that needs the client; `hasPastJobs` says whether they have finished or cancelled jobs.
 */
export type HomeHero =
  | { kind: 'proposals'; job: Job; pending: JobApplication[] }
  | { kind: 'working'; job: Job; needsConfirmation: boolean; providerName: string | null }
  | { kind: 'booking'; job: Job; when: Date | null; upcoming: boolean; providerName: string | null }
  | { kind: 'searching'; job: Job }
  | { kind: 'empty'; hasPastJobs: boolean };

function postedAt(job: Job): number {
  const posted = Date.parse(job.posted_at);
  if (!Number.isNaN(posted)) return posted;
  const created = Date.parse(job.created_at);
  return Number.isNaN(created) ? 0 : created;
}

function scheduledAt(job: Job): number | null {
  if (!job.scheduled_at) return null;
  const time = Date.parse(job.scheduled_at);
  return Number.isNaN(time) ? null : time;
}

/** The open jobs Home checks for proposals: newest posted first, at most PROPOSAL_CHECK_LIMIT. */
export function proposalCandidates(jobs: Job[]): Job[] {
  return jobs
    .filter((job) => OPEN_STATUSES.includes(job.status))
    .sort((a, b) => postedAt(b) - postedAt(a))
    .slice(0, PROPOSAL_CHECK_LIMIT);
}

export function pendingApplicants(applications: JobApplication[] | undefined): JobApplication[] {
  return (applications ?? []).filter((application) => application.status === 'pending');
}

/**
 * The one thing that needs the homeowner. Always a kind, once the jobs have loaded.
 * 1. Proposals: the checked open job with the most pending proposals. Ties go
 *    to the newest job, because proposalCandidates is newest first and only a
 *    strictly larger count replaces the current pick.
 * 2. Working: the first job in progress. It needs the client's confirmation
 *    when its checklist is all done (the same rule as the job screen).
 * 3. Booking: the soonest booking still ahead. Failing that, a booked job whose
 *    time has passed or was never set.
 * 4. Searching: the newest open job, which has no proposals yet.
 * 5. Empty: nothing above applies.
 * A failed or missing proposal lookup counts as no proposals.
 */
export function pickHomeHero(jobs: Job[], applicationsByJob: ApplicationsByJob, now: Date): HomeHero {
  let proposal: { job: Job; pending: JobApplication[] } | null = null;
  for (const job of proposalCandidates(jobs)) {
    const pending = pendingApplicants(applicationsByJob[job.id]);
    if (pending.length > 0 && (proposal === null || pending.length > proposal.pending.length)) {
      proposal = { job, pending };
    }
  }
  if (proposal !== null) {
    return { kind: 'proposals', job: proposal.job, pending: proposal.pending };
  }

  const working = jobs.find((job) => job.status === 'in_progress');
  if (working !== undefined) {
    // A job list without its checklist does not claim the work is done.
    const tasks = working.job_tasks;
    return {
      kind: 'working',
      job: working,
      needsConfirmation: tasks !== undefined && tasks.every((task) => task.is_done),
      providerName: working.assigned_provider?.full_name || null,
    };
  }

  const nowMs = now.getTime();
  let booking: { job: Job; at: number } | null = null;
  for (const job of jobs) {
    const at = scheduledAt(job);
    if (!BOOKED_STATUSES.includes(job.status) || at === null || at <= nowMs) continue;
    if (booking === null || at < booking.at) booking = { job, at };
  }
  if (booking !== null) {
    return {
      kind: 'booking',
      job: booking.job,
      when: new Date(booking.at),
      upcoming: true,
      providerName: booking.job.assigned_provider?.full_name || null,
    };
  }
  const booked = jobs.find((job) => BOOKED_STATUSES.includes(job.status));
  if (booked !== undefined) {
    const at = scheduledAt(booked);
    return {
      kind: 'booking',
      job: booked,
      when: at === null ? null : new Date(at),
      upcoming: false,
      providerName: booked.assigned_provider?.full_name || null,
    };
  }

  const open = proposalCandidates(jobs)[0];
  if (open !== undefined) {
    return { kind: 'searching', job: open };
  }
  return { kind: 'empty', hasPastJobs: jobs.length > 0 };
}
