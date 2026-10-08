import type { Job, JobApplication } from './api';

/** Pending proposal counts keyed by job id. A job with no entry has an unknown count. */
export type ProposalCounts = Readonly<Record<string, number>>;

/** How many of the newest open jobs get a proposal lookup on each load. */
export const PROPOSAL_LOOKUP_LIMIT = 10;

/** Open jobs are the ones that still take proposals. */
export function isOpenJob(job: Pick<Job, 'status'>): boolean {
  return job.status === 'open' || job.status === 'recommending';
}

/** Ids of the newest open jobs (at most `limit`) whose proposals are looked up. */
export function proposalLookupIds(jobs: readonly Job[], limit = PROPOSAL_LOOKUP_LIMIT): string[] {
  return jobs
    .filter(isOpenJob)
    .sort((a, b) => postedTime(b) - postedTime(a))
    .slice(0, limit)
    .map((job) => job.id);
}

/** Proposals still waiting for the homeowner's decision. */
export function countPendingProposals(applications: readonly Pick<JobApplication, 'status'>[]): number {
  return applications.filter((application) => application.status === 'pending').length;
}

function postedTime(job: Pick<Job, 'posted_at'>): number {
  const time = new Date(job.posted_at).getTime();
  return Number.isNaN(time) ? 0 : time;
}
