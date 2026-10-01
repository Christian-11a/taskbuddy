import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPJobDetailScreen from '../SPJobDetailScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    getJob: jest.fn(),
    jobDispute: jest.fn().mockResolvedValue(null),
    myApplications: jest.fn(),
    applyToJob: jest.fn(),
  },
  ApiError: class ApiError extends Error {
    status?: number;
    code?: string;
    constructor(message: string, status?: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const JOB_ID = 'job-1';
const PROVIDER_ID = 'provider-1';

const openJob = {
  id: JOB_ID,
  client_id: 'client-1',
  category_id: 1,
  title: 'Fix the sink',
  description: 'Leaky kitchen sink',
  urgency: 'normal' as const,
  status: 'open' as const,
  address: '123 Main St',
  latitude: 14.6,
  longitude: 121.0,
  posted_at: new Date().toISOString(),
  assigned_provider_id: null,
  assigned_at: null,
  completed_at: null,
  budget: 500,
  scheduled_at: null,
  photo_urls: [],
  created_at: new Date().toISOString(),
  job_tasks: [],
};

describe('SPJobDetailScreen — proposal submission refreshes the applications cache (P9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: PROVIDER_ID },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
  });

  it('reloads myApplications after a successful proposal, hiding Submit Proposal', async () => {
    (api.myApplications as jest.Mock)
      .mockResolvedValueOnce([]) // initial load: no application yet
      .mockResolvedValueOnce([
        { id: 'app-1', status: 'pending', jobs: { id: JOB_ID } },
      ]); // after reload: the just-sent proposal
    (api.applyToJob as jest.Mock).mockResolvedValue({ id: 'app-1' });

    render(
      <SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />,
    );

    // Wait for the job + applications to load and the button to appear.
    await waitFor(() => expect(screen.getByTestId('btn-submit-proposal')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-submit-proposal'));
    fireEvent.changeText(screen.getByTestId('proposal-message'), 'I can start tomorrow.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-send'));
    });

    // The bug: without reloading `myApps`, this button stays visible and a
    // second tap 400s as a duplicate application.
    await waitFor(() => expect(api.myApplications as jest.Mock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('btn-submit-proposal')).toBeNull());
    expect(screen.getByText('Proposal Pending')).toBeTruthy();
  });
});

describe('SPJobDetailScreen — cancelled booking shows a locked row (declined-job visibility)', () => {
  const cancelledJob = {
    ...openJob,
    status: 'cancelled' as const,
    assigned_provider_id: PROVIDER_ID,
    assigned_at: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: PROVIDER_ID },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.getJob as jest.Mock).mockResolvedValue(cancelledJob);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('shows a locked "Booking Cancelled" row instead of an empty action bar', async () => {
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('Booking Cancelled')).toBeTruthy());
    expect(screen.getByText('CANCELLED BOOKING')).toBeTruthy();
    expect(screen.queryByTestId('btn-submit-proposal')).toBeNull();
  });
});

describe('FullTest provider job details', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('renders job photos before the provider submits a proposal', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, photo_urls: ['https://example.test/photo.jpg'] });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect((await screen.findByLabelText('Job photo 1')).props.source).toEqual({ uri: 'https://example.test/photo.jpg' });
    expect(screen.getByTestId('btn-submit-proposal')).toBeTruthy();
  });

  it('keeps the checklist locked before Start Job and does not claim completion', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'confirmed', assigned_provider_id: PROVIDER_ID,
      job_tasks: [{ id: 'task-1', label: 'Fix tap', position: 0, is_done: false }] });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Start Job');
    expect(screen.getByRole('checkbox').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText('Waiting for client to confirm completion')).toBeNull();
  });

  it('offers the existing dispute screen for a cancelled job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'cancelled', assigned_provider_id: PROVIDER_ID });
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);
    fireEvent.press(await screen.findByText('Request Admin Review'));
    expect(onNavigate).toHaveBeenCalledWith('Dispute Filing', JOB_ID);
  });
});
