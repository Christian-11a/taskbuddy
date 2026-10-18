import type { Job } from '../api';
import { jobRowStatus } from '../jobRowStatus';

function job(status: Job['status']): Job {
  return { id: 'job-1', title: 'Plumbing: Fix toilet', status, scheduled_at: null } as Job;
}

describe('jobRowStatus', () => {
  it('marks open jobs with pending proposals as needing the homeowner', () => {
    expect(jobRowStatus(job('open'), 2)).toEqual({ tone: 'needsYou', meta: '2 proposals to review' });
    expect(jobRowStatus(job('recommending'), 1)).toEqual({ tone: 'needsYou', meta: '1 proposal to review' });
  });

  it('marks open jobs without pending proposals as waiting, including while the count is unknown', () => {
    expect(jobRowStatus(job('open'), 0)).toEqual({ tone: 'waiting', meta: 'Open · waiting for proposals' });
    expect(jobRowStatus(job('recommending'))).toEqual({ tone: 'waiting', meta: 'Open · waiting for proposals' });
  });

  it('shows booked jobs as confirmed or in progress', () => {
    expect(jobRowStatus(job('confirmed'))).toEqual({ tone: 'booked', meta: 'Confirmed' });
    expect(jobRowStatus(job('assigned'))).toEqual({ tone: 'booked', meta: 'Confirmed' });
    expect(jobRowStatus(job('in_progress'))).toEqual({ tone: 'booked', meta: 'In progress' });
  });

  it('shows finished jobs as done, with how they ended', () => {
    expect(jobRowStatus(job('completed'))).toEqual({ tone: 'done', meta: 'Completed' });
    expect(jobRowStatus(job('cancelled'))).toEqual({ tone: 'done', meta: 'Cancelled' });
    expect(jobRowStatus(job('expired'))).toEqual({ tone: 'done', meta: 'Expired' });
  });
});

describe('jobRowStatus disputed', () => {
  it('shows a disputed badge in a warning tone whatever the work status', () => {
    const disputed = { ...job('in_progress'), display_status: 'disputed' } as Job;
    expect(jobRowStatus(disputed)).toEqual({ tone: 'needsYou', meta: 'Disputed' });
  });

  it('falls back to the work status when display_status is not disputed', () => {
    const shown = { ...job('completed'), display_status: 'completed' } as Job;
    expect(jobRowStatus(shown)).toEqual({ tone: 'done', meta: 'Completed' });
  });
});
