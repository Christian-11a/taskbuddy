import type { Job, JobApplication } from './api';

const OPEN_STATUSES: readonly string[] = ['open', 'recommending'];
const BOOKED_STATUSES: readonly string[] = ['confirmed', 'assigned', 'in_progress'];

/** Home checks pending proposals on this many open jobs, newest first. */
export const PROPOSAL_CHECK_LIMIT = 5;

/** Applications per job id from `api.jobApplications`; undefined when that lookup failed or has not finished. */
export type ApplicationsByJob = Record<string, JobApplication[] | undefined>;

/** What Home's hero card shows: proposals to review, or the next booking. */
export type HomeHero =
  | { kind: 'proposals'; job: Job; pending: JobApplication[]; applied: number }
  | { kind: 'booking'; job: Job; when: Date; providerName: string | null };

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
 * The one thing that needs the homeowner, or null when nothing does.
 * 1. Proposals: the checked open job with the most pending proposals. Ties go
 *    to the newest job, because proposalCandidates is newest first and only a
 *    strictly larger count replaces the current pick.
 * 2. Next booking: the soonest confirmed, assigned or in-progress job that is
 *    still in the future.
 * A failed or missing lookup counts as no proposals, so rule 2 applies.
 */
export function pickHomeHero(jobs: Job[], applicationsByJob: ApplicationsByJob, now: Date): HomeHero | null {
  let proposal: { job: Job; pending: JobApplication[] } | null = null;
  for (const job of proposalCandidates(jobs)) {
    const pending = pendingApplicants(applicationsByJob[job.id]);
    if (pending.length > 0 && (proposal === null || pending.length > proposal.pending.length)) {
      proposal = { job, pending };
    }
  }
  if (proposal !== null) {
    // Everyone who applied and has not withdrawn, including declined applicants.
    const applied = (applicationsByJob[proposal.job.id] ?? []).filter((a) => a.status !== 'withdrawn').length;
    return { kind: 'proposals', job: proposal.job, pending: proposal.pending, applied };
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
      providerName: booking.job.assigned_provider?.full_name || null,
    };
  }
  return null;
}
