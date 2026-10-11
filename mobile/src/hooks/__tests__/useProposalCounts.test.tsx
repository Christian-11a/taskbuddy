import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProposalCounts, useProposalCountsStatus } from '../useProposalCounts';
import { api, type Job, type JobApplication } from '../../lib/api';

jest.mock('../../lib/api', () => ({
  api: { jobApplications: jest.fn() },
}));

function job(id: string, status: Job['status']): Job {
  return { id, title: id, status, posted_at: '2026-10-01T09:00:00' } as Job;
}

function application(status: JobApplication['status']): JobApplication {
  return { id: `app-${status}`, status } as JobApplication;
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('counts the pending proposals on each open job', async () => {
  (api.jobApplications as jest.Mock).mockImplementation(async (id: string) =>
    id === 'a'
      ? [application('pending'), application('pending'), application('accepted')]
      : [application('rejected')],
  );
  const jobs = [job('a', 'open'), job('b', 'recommending'), job('c', 'confirmed')];

  const { result } = renderHook(() => useProposalCounts(jobs));

  await waitFor(() => expect(result.current).toEqual({ a: 2, b: 0 }));
  expect(api.jobApplications).toHaveBeenCalledTimes(2);
  expect(api.jobApplications).not.toHaveBeenCalledWith('c');
});

it('leaves a job without a count when its lookup fails', async () => {
  (api.jobApplications as jest.Mock).mockImplementation(async (id: string) => {
    if (id === 'a') throw new Error('offline');
    return [application('pending')];
  });
  const jobs = [job('a', 'open'), job('b', 'open')];

  const { result } = renderHook(() => useProposalCounts(jobs));

  await waitFor(() => expect(result.current).toEqual({ b: 1 }));
  expect(result.current).not.toHaveProperty('a');
});

it('makes no lookups when no job is open', () => {
  const jobs = [job('c', 'confirmed'), job('d', 'completed')];

  const { result } = renderHook(() => useProposalCounts(jobs));

  expect(result.current).toEqual({});
  expect(api.jobApplications).not.toHaveBeenCalled();
});

it('looks again when the jobs are reloaded', async () => {
  (api.jobApplications as jest.Mock)
    .mockResolvedValueOnce([application('pending')])
    .mockResolvedValueOnce([]);

  const { result, rerender } = renderHook(
    ({ list }: { list: Job[] }) => useProposalCounts(list),
    { initialProps: { list: [job('a', 'open')] } },
  );
  await waitFor(() => expect(result.current).toEqual({ a: 1 }));

  rerender({ list: [job('a', 'open')] });

  await waitFor(() => expect(result.current).toEqual({ a: 0 }));
  expect(api.jobApplications).toHaveBeenCalledTimes(2);
});

it('is loading until every looked-up job has an answer, and a failed lookup is an answer', async () => {
  let answerA: (applications: JobApplication[]) => void = () => {};
  (api.jobApplications as jest.Mock).mockImplementation((id: string) =>
    id === 'a'
      ? new Promise<JobApplication[]>((resolve) => {
        answerA = resolve;
      })
      : Promise.reject(new Error('offline')),
  );
  const jobs = [job('a', 'open'), job('b', 'open')];

  const { result } = renderHook(() => useProposalCountsStatus(jobs));

  expect(result.current.loading).toBe(true);
  await act(async () => {
    answerA([application('pending')]);
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.counts).toEqual({ a: 1 });
});
