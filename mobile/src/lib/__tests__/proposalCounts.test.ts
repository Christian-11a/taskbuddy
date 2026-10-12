import type { Job, JobApplication } from '../api';
import {
  PROPOSAL_LOOKUP_LIMIT,
  countPendingProposals,
  isOpenJob,
  proposalLookupIds,
} from '../proposalCounts';

function job(id: string, status: Job['status'], postedAt = '2026-10-01T09:00:00'): Job {
  return { id, title: id, status, posted_at: postedAt } as Job;
}

function application(status: JobApplication['status']): JobApplication {
  return { id: `app-${status}`, status } as JobApplication;
}

describe('isOpenJob', () => {
  it('counts only jobs that still take proposals', () => {
    expect(isOpenJob(job('a', 'open'))).toBe(true);
    expect(isOpenJob(job('a', 'recommending'))).toBe(true);
    for (const status of ['assigned', 'confirmed', 'in_progress', 'completed', 'cancelled', 'expired'] as const) {
      expect(isOpenJob(job('a', status))).toBe(false);
    }
  });
});

describe('proposalLookupIds', () => {
  it('returns the open jobs, newest posted first', () => {
    const jobs = [
      job('older', 'open', '2026-10-01T09:00:00'),
      job('booked', 'confirmed', '2026-10-08T09:00:00'),
      job('newest', 'recommending', '2026-10-05T09:00:00'),
    ];
    expect(proposalLookupIds(jobs)).toEqual(['newest', 'older']);
  });

  it('looks up at most the limit, which is 10 by default', () => {
    const jobs = Array.from({ length: 12 }, (_, i) =>
      job(`job-${i}`, 'open', `2026-10-${String(i + 1).padStart(2, '0')}T09:00:00`),
    );
    const ids = proposalLookupIds(jobs);
    expect(PROPOSAL_LOOKUP_LIMIT).toBe(10);
    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe('job-11');
    expect(ids).not.toContain('job-0');
    expect(proposalLookupIds(jobs, 3)).toEqual(['job-11', 'job-10', 'job-9']);
  });

  it('puts a job with an unreadable posting date last', () => {
    const jobs = [job('bad', 'open', 'not a date'), job('good', 'open', '2026-10-01T09:00:00')];
    expect(proposalLookupIds(jobs)).toEqual(['good', 'bad']);
  });
});

describe('countPendingProposals', () => {
  it('counts only the proposals still waiting for a decision', () => {
    expect(countPendingProposals([
      application('pending'),
      application('accepted'),
      application('pending'),
      application('rejected'),
      application('withdrawn'),
    ])).toBe(2);
    expect(countPendingProposals([])).toBe(0);
  });
});
