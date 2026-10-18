import type { Job } from '../api';
import { jobRowStatus } from '../jobRowStatus';

function job(status: Job['status']): Job {
  return { id: 'job-1', title: 'Job', status } as Job;
}

describe('jobRowStatus', () => {
  it('shows an open job with no proposals as waiting for proposals', () => {
    expect(jobRowStatus(job('open'))).toEqual({ tone: 'waiting', meta: 'Open · waiting for proposals' });
    expect(jobRowStatus(job('open'), 0)).toEqual({ tone: 'waiting', meta: 'Open · waiting for proposals' });
  });

  it('treats a recommending job the same way as an open one', () => {
    expect(jobRowStatus(job('recommending'))).toEqual({ tone: 'waiting', meta: 'Open · waiting for proposals' });
  });

  it('asks the homeowner to review pending proposals on an open job', () => {
    expect(jobRowStatus(job('open'), 2)).toEqual({ tone: 'needsYou', meta: '2 proposals to review' });
    expect(jobRowStatus(job('recommending'), 1)).toEqual({ tone: 'needsYou', meta: '1 proposal to review' });
  });

  it('shows booked jobs as confirmed or in progress, whatever the proposal count', () => {
    expect(jobRowStatus(job('confirmed'), 3)).toEqual({ tone: 'booked', meta: 'Confirmed' });
    expect(jobRowStatus(job('assigned'))).toEqual({ tone: 'booked', meta: 'Confirmed' });
    expect(jobRowStatus(job('in_progress'))).toEqual({ tone: 'booked', meta: 'In progress' });
  });

  it('shows finished jobs as done, with their outcome', () => {
    expect(jobRowStatus(job('completed'))).toEqual({ tone: 'done', meta: 'Completed' });
    expect(jobRowStatus(job('cancelled'))).toEqual({ tone: 'done', meta: 'Cancelled' });
    expect(jobRowStatus(job('expired'))).toEqual({ tone: 'done', meta: 'Expired' });
  });

  it('falls back to the raw status for a status the app does not know', () => {
    expect(jobRowStatus(job('archived' as Job['status']))).toEqual({ tone: 'done', meta: 'archived' });
  });
});
