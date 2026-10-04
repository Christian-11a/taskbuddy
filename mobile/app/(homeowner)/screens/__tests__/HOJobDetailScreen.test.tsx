import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOJobDetailScreen from '../HOJobDetailScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    getJob: jest.fn(),
    getProvider: jest.fn(),
    jobDispute: jest.fn(),
    completeJob: jest.fn(),
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

    await waitFor(() => expect(screen.getByText('Confirm Completion')).toBeTruthy());

    fireEvent.press(screen.getByText('Confirm Completion'));

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

    await waitFor(() => expect(screen.getByText('Confirm Completion')).toBeTruthy());
    fireEvent.press(screen.getByText('Confirm Completion'));
    await waitFor(() => expect(screen.getByLabelText('Not Yet')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Not Yet'));

    expect(api.completeJob).not.toHaveBeenCalled();
    // The dialog closed: its confirm button is no longer on screen.
    await waitFor(() => expect(screen.queryByLabelText('Yes, Mark Complete')).toBeNull());
  });

  it('surfaces an error, instead of silently succeeding, when completeJob rejects (code-review finding)', async () => {
    (api.completeJob as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('Confirm Completion')).toBeTruthy());
    fireEvent.press(screen.getByText('Confirm Completion'));
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
    expect(screen.getByText('Confirm Completion')).toBeTruthy();
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

  it('hides offers after hiring and completion until the checklist is done', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob,
      job_tasks: [{ id: 't1', label: 'Fix tap', position: 0, is_done: false }] });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Jane Provider');
    expect(screen.queryByTestId('job-detail-view-offers')).toBeNull();
    expect(screen.queryByText('Confirm Completion')).toBeNull();
  });

  it.each([1, 4])('shows a post-completion dispute only within three days (age %i)', async (days) => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...inProgressJob, status: 'completed',
      completed_at: new Date(Date.now() - days * 86400000).toISOString(),
      warranty_expires_at: new Date(Date.now() + (3 - days) * 86400000).toISOString() });
    render(<HOJobDetailScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Jane Provider');
    expect(!!screen.queryByText('File a Complaint')).toBe(days < 3);
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
  expect(screen.getByText('Confirm Completion')).toBeTruthy();
});
