import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import HOJobDetailScreen from '../HOJobDetailScreen';
import { ApiError, api } from '../../../../src/lib/api';
import { showToast } from '../../../../src/components/Toast';
import ContentSkeleton from '../../../../src/components/ui/ContentSkeleton';

jest.mock('../../../../src/components/Toast', () => ({ showToast: jest.fn() }));

jest.mock('../../../../src/lib/api', () => ({
  api: {
    getJob: jest.fn(),
    getProvider: jest.fn(),
    jobDispute: jest.fn(),
    completeJob: jest.fn(),
    cancelJob: jest.fn(),
    jobApplications: jest.fn(),
    triggerRecommendations: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));

const inProgressJob = {
  id: 'job-1',
  client_id: 'client-1',
  category_id: 1,
  title: 'Fix the sink',
  description: 'Leaky kitchen sink',
  urgency: 'normal' as const,
  status: 'in_progress' as const,
  address: '123 Main St',
  latitude: 14.6,
  longitude: 121.0,
  posted_at: new Date().toISOString(),
  assigned_provider_id: 'provider-1',
  assigned_at: new Date().toISOString(),
  completed_at: null,
  budget: 1500,
  scheduled_at: '2026-10-05T09:30:00.000Z',
  photo_urls: [],
  created_at: new Date().toISOString(),
  job_tasks: [],
};

describe('HOJobDetailScreen — Confirm Completion asks first (QA #6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getJob as jest.Mock).mockResolvedValue(inProgressJob);
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });

  it('does not call completeJob until the confirmation dialog is confirmed', async () => {
    (api.completeJob as jest.Mock).mockResolvedValue({});

    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('Confirm job is done')).toBeTruthy());

    fireEvent.press(screen.getByText('Confirm job is done'));

    // The dialog is open; completeJob must not have fired yet.
    expect(api.completeJob).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText(/stays held until it ends/)).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Yes, Mark Complete'));
    });

    await waitFor(() => expect(api.completeJob).toHaveBeenCalledWith('job-1'));
  });

  it('shows the scheduled date and time, not just the date', async () => {
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText(/Oct 5, 2026 ·/)).toBeTruthy());
  });

  it('pressing "Not Yet" closes the dialog without calling completeJob (code-review finding)', async () => {
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('Confirm job is done')).toBeTruthy());
    fireEvent.press(screen.getByText('Confirm job is done'));
    await waitFor(() => expect(screen.getByLabelText('Not Yet')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Not Yet'));

    expect(api.completeJob).not.toHaveBeenCalled();
    // The dialog closed: its confirm button is no longer on screen.
    await waitFor(() => expect(screen.queryByLabelText('Yes, Mark Complete')).toBeNull());
  });

  it('surfaces an error, instead of silently succeeding, when completeJob rejects (code-review finding)', async () => {
    (api.completeJob as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('Confirm job is done')).toBeTruthy());
    fireEvent.press(screen.getByText('Confirm job is done'));
    await waitFor(() => expect(screen.getByLabelText('Yes, Mark Complete')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Yes, Mark Complete'));
    });

    // runAction only trusts an ApiError's own .message for display; a plain
    // Error (like a raw network failure) falls back to this generic text —
    // so the assertion is on that, not the mock's literal message.
    await waitFor(() =>
      expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy(),
    );
    // Not stuck mid-action: the button is usable again for a retry.
    expect(screen.getByText('Confirm job is done')).toBeTruthy();
  });
});

describe('HOJobDetailScreen — the budget reads like the job lists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });

  it.each<[number, string]>([
    [1, '₱1.00'],
    [800, '₱800.00'],
    [1500, '₱1,500.00'],
  ])('a budget of %p shows as %s in the header, with two decimals', async (budget, shown) => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, budget });

    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText(shown)).toBeTruthy();
  });
});

describe('FullTest homeowner job details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });

  it('shows the provider acceptance address and distance from the job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...inProgressJob,
      provider_accept_address: 'Quezon City',
      provider_accept_latitude: 14.61,
      provider_accept_longitude: 121,
    });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText(/Accepted from Quezon City.*from your job/);
  });

  it('shows the whole job address, with no line limit', async () => {
    const address = 'Blk 4 Lot 12 Sampaguita Street, Barangay Mayaman, Lipa City, Batangas, Philippines 4217';
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, address });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByText(address)).toBeTruthy();
    expect(screen.getByText(address).props.numberOfLines).toBeUndefined();
  });

  it('hides the accepted-from line when the provider accepted from the job itself (0 m away)', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...inProgressJob,
      provider_accept_address: 'Arturo Tanco Drive',
      provider_accept_latitude: inProgressJob.latitude,
      provider_accept_longitude: inProgressJob.longitude,
    });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Jane Provider');
    expect(screen.queryByText(/Accepted from/)).toBeNull();
  });

  it('hides the accepted-from line when its distance is unknown', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...inProgressJob,
      provider_accept_address: 'Quezon City',
      provider_accept_latitude: null,
      provider_accept_longitude: null,
    });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Jane Provider');
    expect(screen.queryByText(/Accepted from/)).toBeNull();
  });

  it('leaves out the Job Photos heading when the job has no photos', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, photo_urls: [] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Jane Provider');
    expect(screen.queryByText('Job Photos')).toBeNull();
  });

  it('shows the Job Photos heading above the photos when there are some', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, photo_urls: ['https://test/one'] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByText('Job Photos')).toBeTruthy();
    expect(screen.getByLabelText('Open job photo 1')).toBeTruthy();
  });

  it('hides offers after hiring and completion until the checklist is done', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob,
      job_tasks: [{ id: 't1', label: 'Fix tap', position: 0, is_done: false }] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Jane Provider');
    expect(screen.queryByTestId('job-detail-view-offers')).toBeNull();
    expect(screen.queryByText('Confirm job is done')).toBeNull();
  });

  it.each([1, 4])('shows a post-completion dispute only within three days (age %i)', async (days) => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'completed',
      completed_at: new Date(Date.now() - days * 86400000).toISOString(),
      warranty_expires_at: new Date(Date.now() + (3 - days) * 86400000).toISOString() });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Jane Provider');
    // The complaint moved into the ⋮ menu: offered there inside the warranty, and no menu at all after it.
    if (days < 3) {
      fireEvent.press(screen.getByLabelText('More job actions'));
      expect(await screen.findByText('Report a problem')).toBeTruthy();
    } else {
      expect(screen.queryByLabelText('More job actions')).toBeNull();
    }
  });
});

it('preserves client job details when closing the shared image viewer', async () => {
  (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, photo_urls: ['https://test/one', 'https://test/two'] });
  (api.getProvider as jest.Mock).mockResolvedValue({ profiles: { full_name: 'Provider' } });
  (api.jobDispute as jest.Mock).mockResolvedValue(null);
  render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
  fireEvent.press(await screen.findByLabelText('Open job photo 2'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe('https://test/two');
  fireEvent.press(screen.getByLabelText('Close photo'));
  expect(screen.queryByTestId('full-photo')).toBeNull();
  expect(screen.getByText('Confirm job is done')).toBeTruthy();
});

describe('HOJobDetailScreen — Cancel Job once the work is done', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });
  const task = (is_done: boolean, position: number) => ({ id: `t${position}`, job_id: 'job-1', label: `Task ${position}`, is_done, position });

  it('keeps Cancel Job while tasks are still open', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, job_tasks: [task(true, 1), task(false, 2)] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('More job actions'));
    expect(await screen.findByText('Cancel job')).toBeTruthy();
  });

  it('hides Cancel Job when every task is done, leaving Confirm Completion', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, job_tasks: [task(true, 1), task(true, 2)] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByText('Confirm job is done')).toBeTruthy();
    // Nothing is left for the ⋮ menu to hold, so there is no menu button at all.
    expect(screen.queryByLabelText('More job actions')).toBeNull();
    expect(screen.queryByText('Cancel job')).toBeNull();
  });

  it('keeps Cancel Job for an in-progress job with no task list', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, job_tasks: [] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('More job actions'));
    expect(await screen.findByText('Cancel job')).toBeTruthy();
  });
});

describe('HOJobDetailScreen — offers, the main action and the ⋮ menu', () => {
  const CANCEL_HINT = 'Cancelling after hiring asks the provider to agree. Your money comes back once they do.';
  const openJob = { ...inProgressJob, status: 'open' as const, assigned_provider_id: null, job_tasks: [] };
  const taskOf = (is_done: boolean, position: number) => ({
    id: `t${position}`, job_id: 'job-1', label: `Task ${position}`, is_done, position, completed_at: null,
  });
  const application = (id: string, name: string, status: 'pending' | 'rejected') => ({
    id, job_id: 'job-1', provider_id: `p-${id}`, status, source: 'organic' as const, cover_message: null,
    applied_at: new Date().toISOString(), decided_at: null,
    provider: {
      id: `p-${id}`, full_name: name, avatar_url: null, city: null,
      provider_profiles: { is_verified: true, cached_avg_rating: 4, cached_completed_jobs: 2 },
    },
  });
  const renderJob = (onNavigate = jest.fn(), onBack = jest.fn()) =>
    render(<HOJobDetailScreen jobId="job-1" onBack={onBack} onNavigate={onNavigate} />);

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
  });

  it('offers the first two pending proposals, and the review button opens Job Applications', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockResolvedValue([
      application('a1', 'Ana Cruz', 'pending'),
      application('a2', 'Ben Reyes', 'pending'),
      application('a3', 'Cy Dela Rosa', 'pending'),
      application('a4', 'Dee Lim', 'rejected'),
    ]);
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    expect(await screen.findByText('Ana Cruz')).toBeTruthy();
    expect(screen.getByText('Ben Reyes')).toBeTruthy();
    expect(screen.queryByText('Cy Dela Rosa')).toBeNull();
    expect(screen.queryByText('Dee Lim')).toBeNull();

    fireEvent.press(await screen.findByText('Review proposals (3)'));
    expect(onNavigate).toHaveBeenCalledWith('Job Applications', 'job-1');
  });

  it('See all opens Job Applications', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    fireEvent.press(await screen.findByText('See all'));
    expect(onNavigate).toHaveBeenCalledWith('Job Applications', 'job-1');
  });

  it('a job that fails to load shows the error in a card, and Try again loads it again', async () => {
    (api.getJob as jest.Mock).mockRejectedValueOnce(new Error('Could not reach TaskBuddy.')).mockResolvedValue(openJob);
    renderJob();

    const card = await screen.findByTestId('error-card');
    expect(within(card).getByText("Couldn't load this job")).toBeTruthy();
    expect(within(card).getByText('Could not reach TaskBuddy.')).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No offers yet')).toBeTruthy();
    expect(screen.queryByTestId('error-card')).toBeNull();
  });

  it('with no proposals yet, find providers is the main action and reports how many were invited', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.triggerRecommendations as jest.Mock).mockResolvedValue({ run_id: null, pool_size: 4, notified: 2 });
    renderJob();

    expect(await screen.findByText('No offers yet')).toBeTruthy();
    expect(within(screen.getByTestId('empty-card')).getByText('No offers yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Find providers'));
    expect(await screen.findByText('We invited 2 matched providers to apply.')).toBeTruthy();
    expect(api.triggerRecommendations).toHaveBeenCalledWith('job-1');
  });

  it('a failed proposals lookup does not block the job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockRejectedValue(new Error('offline'));
    renderJob();

    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(screen.getByText('Find providers')).toBeTruthy();
    expect(screen.queryByText('No offers yet')).toBeNull();
  });

  it('a failed proposals lookup still offers View offers, which opens Job Applications, and claims no count', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockRejectedValue(new Error('offline'));
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    fireEvent.press(await screen.findByText('View offers'));
    expect(onNavigate).toHaveBeenCalledWith('Job Applications', 'job-1');
    expect(screen.getByText('Find providers')).toBeTruthy();
    expect(screen.queryByText(/Review proposals/)).toBeNull();
    expect(screen.queryByText('No offers yet')).toBeNull();
  });

  it('a booked job: the main button messages the provider', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'confirmed', job_tasks: [] });
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    fireEvent.press(await screen.findByText('Message Jane Provider'));
    expect(onNavigate).toHaveBeenCalledWith('Chat', 'job-1');
  });

  it('a finished job with no review offers Leave a review', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...inProgressJob, status: 'completed',
      warranty_expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
    });
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    fireEvent.press(await screen.findByText('Leave a review'));
    expect(onNavigate).toHaveBeenCalledWith('Leave Review', 'job-1');
  });

  it('a finished job that already has a review shows the badge and no review button', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'completed', has_review: true });
    renderJob();

    expect(await screen.findByText('Review submitted')).toBeTruthy();
    expect(screen.queryByText('Leave a review')).toBeNull();
  });

  it('an expired job offers to post it again for the same category', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...inProgressJob, status: 'expired', assigned_provider_id: null,
      posted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    });
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    fireEvent.press(await screen.findByText('Post again'));
    expect(onNavigate).toHaveBeenCalledWith('Create Job', '1');
  });

  it('a cancelled job with a cancellation waiting: the case is the main action', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'cancelled' });
    (api.jobDispute as jest.Mock).mockResolvedValue({
      id: 'd1', job_id: 'job-1', reason: 'Cancelled after hire', details: null, status: 'open',
      resolution: null, resolution_note: null, resolved_at: null, created_at: new Date().toISOString(),
      cancellation_state: 'pending',
    });
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    expect(await screen.findByText('Waiting for Jane Provider to agree')).toBeTruthy();
    fireEvent.press(screen.getByText('View case'));
    expect(onNavigate).toHaveBeenCalledWith('Dispute Status', 'job-1');
  });

  it('the ⋮ menu offers Cancel job, with its hint only when a provider is hired', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    const first = renderJob();
    fireEvent.press(await screen.findByLabelText('More job actions'));
    expect(await screen.findByText('Cancel job')).toBeTruthy();
    expect(screen.queryByText(CANCEL_HINT)).toBeNull();
    first.unmount();

    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'confirmed', job_tasks: [] });
    renderJob();
    fireEvent.press(await screen.findByLabelText('More job actions'));
    expect(await screen.findByText(CANCEL_HINT)).toBeTruthy();
  });

  it('Cancel job opens the same red confirmation, and Keep Job leaves the job alone', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'confirmed', job_tasks: [] });
    renderJob();

    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));
    expect(await screen.findByText('Cancel this job?')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Keep Job'));
    await waitFor(() => expect(screen.queryByText('Cancel this job?')).toBeNull());
    expect(api.cancelJob).not.toHaveBeenCalled();
  });

  it('confirming Cancel Job calls the cancel endpoint, then leaves the screen', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'confirmed', job_tasks: [] });
    (api.cancelJob as jest.Mock).mockResolvedValue({});
    const onBack = jest.fn();
    renderJob(jest.fn(), onBack);

    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Cancel Job'));
    });

    await waitFor(() => expect(api.cancelJob).toHaveBeenCalledWith('job-1'));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it('report a problem from the menu opens the complaint form', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'confirmed', job_tasks: [] });
    const onNavigate = jest.fn();
    renderJob(onNavigate);

    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Report a problem'));
    expect(onNavigate).toHaveBeenCalledWith('Dispute Filing', 'job-1');
  });

  it('the status card shows the task count while the provider works', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, job_tasks: [taskOf(true, 1), taskOf(false, 2)] });
    renderJob();

    expect(await screen.findByText('WORKING')).toBeTruthy();
    expect(screen.getByText('1 of 2 tasks done.')).toBeTruthy();
  });
});

describe('HOJobDetailScreen — a job action cannot start twice', () => {
  const hiredJob = { ...inProgressJob, status: 'confirmed' as const, job_tasks: [] };

  /** A promise the test settles by hand, so an action can be seen while it is still running. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
  });

  it('two quick taps on Cancel Job call the cancel endpoint once', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hiredJob);
    const cancel = deferred<unknown>();
    (api.cancelJob as jest.Mock).mockReturnValue(cancel.promise);
    const onBack = jest.fn();
    render(<HOJobDetailScreen jobId="job-1" onBack={onBack} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));
    const confirm = await screen.findByLabelText('Cancel Job');
    // Both taps land before React re-renders, so they reach the same handler.
    act(() => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });

    expect(api.cancelJob).toHaveBeenCalledTimes(1);
    await act(async () => cancel.resolve({}));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(api.cancelJob).toHaveBeenCalledTimes(1);
  });

  it('while Cancel Job is running, the ⋮ menu cannot open the confirmation again', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hiredJob);
    const cancel = deferred<unknown>();
    (api.cancelJob as jest.Mock).mockReturnValue(cancel.promise);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));
    fireEvent.press(await screen.findByLabelText('Cancel Job'));
    expect(api.cancelJob).toHaveBeenCalledTimes(1);

    // The ⋮ button stays, and its Cancel job row does nothing while the first cancel is pending.
    fireEvent.press(screen.getByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));
    expect(screen.queryByText('Cancel this job?')).toBeNull();

    await act(async () => cancel.resolve({}));
    expect(api.cancelJob).toHaveBeenCalledTimes(1);
  });

  it('two quick taps on Yes, Mark Complete call completeJob once', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(inProgressJob);
    const complete = deferred<unknown>();
    (api.completeJob as jest.Mock).mockReturnValue(complete.promise);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByText('Confirm job is done'));
    const yes = await screen.findByLabelText('Yes, Mark Complete');
    act(() => {
      fireEvent.press(yes);
      fireEvent.press(yes);
    });

    expect(api.completeJob).toHaveBeenCalledTimes(1);
    await act(async () => complete.resolve({}));
    expect(api.completeJob).toHaveBeenCalledTimes(1);
  });

  it('two quick taps on Find providers send one invitation request', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'open', assigned_provider_id: null, job_tasks: [] });
    const invite = deferred<unknown>();
    (api.triggerRecommendations as jest.Mock).mockReturnValue(invite.promise);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    const find = await screen.findByText('Find providers');
    act(() => {
      fireEvent.press(find);
      fireEvent.press(find);
    });

    expect(api.triggerRecommendations).toHaveBeenCalledTimes(1);
    await act(async () => invite.resolve({ run_id: null, pool_size: 0, notified: 0 }));
    expect(await screen.findByText('No providers matched yet. You can try again later while the job remains open.')).toBeTruthy();
    expect(api.triggerRecommendations).toHaveBeenCalledTimes(1);
  });

  it('a second tap on Find providers while the first request runs says why it was ignored', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'open', assigned_provider_id: null, job_tasks: [] });
    const invite = deferred<unknown>();
    (api.triggerRecommendations as jest.Mock).mockReturnValue(invite.promise);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    const find = await screen.findByText('Find providers');
    act(() => {
      fireEvent.press(find);
      fireEvent.press(find);
    });

    expect(api.triggerRecommendations).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Still working on your last request. Please wait.', 'info');
    await act(async () => invite.resolve({ run_id: null, pool_size: 0, notified: 0 }));
  });

  it('a second tap on Cancel Job while the cancel runs says why it was ignored', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hiredJob);
    const cancel = deferred<unknown>();
    (api.cancelJob as jest.Mock).mockReturnValue(cancel.promise);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));
    const confirm = await screen.findByLabelText('Cancel Job');
    act(() => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });

    expect(api.cancelJob).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Still working on your last request. Please wait.', 'info');
    await act(async () => cancel.resolve({}));
  });

  it('a ⋮ menu row dimmed while an action runs cannot be pressed, so it shows no notice', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hiredJob);
    const cancel = deferred<unknown>();
    (api.cancelJob as jest.Mock).mockReturnValue(cancel.promise);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));
    fireEvent.press(await screen.findByLabelText('Cancel Job'));
    expect(api.cancelJob).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('More job actions'));
    fireEvent.press(await screen.findByText('Cancel job'));

    expect(api.cancelJob).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => cancel.resolve({}));
  });
});

describe('HOJobDetailScreen — every control has an accessible name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });

  it('names the back arrow, the ⋮ menu and the proposals of an open job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'open', assigned_provider_id: null, job_tasks: [] });
    (api.jobApplications as jest.Mock).mockResolvedValue([{
      id: 'a1', job_id: 'job-1', provider_id: 'p-a1', status: 'pending', source: 'organic', cover_message: null,
      applied_at: new Date().toISOString(), decided_at: null,
      provider: { id: 'p-a1', full_name: 'Ana Cruz', avatar_url: null, city: null, provider_profiles: { is_verified: true, cached_avg_rating: 4, cached_completed_jobs: 2 } },
    }]);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('Ana Cruz')).toBeTruthy();
    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });

  it('names the controls of a job in progress, with its checklist', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, job_tasks: [{ id: 't1', job_id: 'job-1', label: 'Check the trap', is_done: false, position: 1, completed_at: null }] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });
});

describe('HOJobDetailScreen — Find providers says why it failed', () => {
  const UNREACHABLE =
    "We couldn't reach the matching service just now. Your job is still open and providers can see it. Try again in a few minutes.";
  const GENERIC = 'Something went wrong on our side. Please try again in a moment.';
  const openJob = { ...inProgressJob, status: 'open' as const, assigned_provider_id: null, job_tasks: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });

  it.each<[string, unknown]>([
    ['a 500 from the server', new ApiError('Internal server error', 500)],
    ['a 503 from the server', new ApiError('Service Unavailable', 503)],
    ['a network failure', new TypeError('Network request failed')],
  ])('after %s, the banner says the matching service could not be reached, not the generic message', async (_label, error) => {
    (api.triggerRecommendations as jest.Mock).mockRejectedValue(error);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByText('Find providers'));

    expect(await screen.findByText(UNREACHABLE)).toBeTruthy();
    expect(screen.queryByText(GENERIC)).toBeNull();
  });

  it('keeps Find providers usable, and a retry that succeeds clears the message', async () => {
    (api.triggerRecommendations as jest.Mock)
      .mockRejectedValueOnce(new ApiError('Internal server error', 500))
      .mockResolvedValueOnce({ run_id: null, pool_size: 4, notified: 2 });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByText('Find providers'));
    expect(await screen.findByText(UNREACHABLE)).toBeTruthy();

    fireEvent.press(screen.getByText('Find providers'));
    expect(await screen.findByText('We invited 2 matched providers to apply.')).toBeTruthy();
    expect(screen.queryByText(UNREACHABLE)).toBeNull();
    expect(api.triggerRecommendations).toHaveBeenCalledTimes(2);
  });

  it('a 400 keeps the server explanation instead of the matching-service message', async () => {
    (api.triggerRecommendations as jest.Mock).mockRejectedValue(
      new ApiError('This job is no longer looking for providers', 400),
    );
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByText('Find providers'));

    expect(await screen.findByText('This job is no longer looking for providers')).toBeTruthy();
    expect(screen.queryByText(UNREACHABLE)).toBeNull();
  });
});

describe('HOJobDetailScreen — the automatic invite line on an open job', () => {
  const AUTO_INVITE = 'We also invite matched providers automatically if nobody applies soon.';
  const openJob = { ...inProgressJob, status: 'open' as const, assigned_provider_id: null, job_tasks: [] };
  const pendingApplication = {
    id: 'a1', job_id: 'job-1', provider_id: 'p-a1', status: 'pending', source: 'organic', cover_message: null,
    applied_at: new Date().toISOString(), decided_at: null,
    provider: {
      id: 'p-a1', full_name: 'Ana Cruz', avatar_url: null, city: null,
      provider_profiles: { is_verified: true, cached_avg_rating: 4, cached_completed_jobs: 2 },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });

  it('shows under the waiting card when nobody has applied, while Find providers is offered', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText(AUTO_INVITE)).toBeTruthy();
    expect(screen.getByText('Waiting for offers')).toBeTruthy();
    expect(screen.getByText('Find providers')).toBeTruthy();
  });

  it('waits for the proposals lookup before it says nobody has applied', async () => {
    let answer!: (value: unknown[]) => void;
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    await screen.findByText('Fix the sink');
    expect(screen.queryByText(AUTO_INVITE)).toBeNull();

    await act(async () => answer([]));
    expect(await screen.findByText(AUTO_INVITE)).toBeTruthy();
  });

  it('is left out once a proposal is waiting, because the job already has offers', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockResolvedValue([pendingApplication]);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('1 proposal waiting')).toBeTruthy();
    expect(screen.queryByText(AUTO_INVITE)).toBeNull();
  });

  it('is left out when the proposals did not load, so the job is not claimed to have none', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.jobApplications as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('Open for offers')).toBeTruthy();
    expect(screen.queryByText(AUTO_INVITE)).toBeNull();
    expect(screen.getByText('Find providers')).toBeTruthy();
  });

  it('is left out once a provider is hired', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'confirmed', job_tasks: [] });
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('Message Jane Provider')).toBeTruthy();
    expect(screen.queryByText(AUTO_INVITE)).toBeNull();
  });
});

describe('HOJobDetailScreen — a reload keeps the job on screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.getJob as jest.Mock).mockResolvedValue(inProgressJob);
    (api.getProvider as jest.Mock).mockResolvedValue({ profile_id: 'provider-1', profiles: { full_name: 'Jane Provider' }, cached_completed_jobs: 1 });
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
  });

  it('shows the skeleton only while no job has loaded yet', () => {
    (api.getJob as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(screen.UNSAFE_queryByType(ContentSkeleton)).toBeTruthy();
    expect(screen.queryByTestId('refresh-bar')).toBeNull();
  });

  it('keeps the job under a thin progress line while it reloads, with no skeleton', async () => {
    const { rerender } = render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Fix the sink')).toBeTruthy());

    (api.getJob as jest.Mock).mockReturnValue(new Promise(() => {}));
    rerender(<HOJobDetailScreen jobId="job-2" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(screen.getByText('Fix the sink')).toBeTruthy();
    expect(screen.getByTestId('refresh-bar')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ContentSkeleton)).toBeNull();
  });
});
