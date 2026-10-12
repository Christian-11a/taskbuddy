import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import SPJobDetailScreen from '../SPJobDetailScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    getJob: jest.fn(),
    jobDispute: jest.fn().mockResolvedValue(null),
    myApplications: jest.fn(),
    applyToJob: jest.fn(),
    startJob: jest.fn(),
    withdrawApplication: jest.fn(),
    updateJobTask: jest.fn(),
    conversations: jest.fn(),
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
    await waitFor(() => expect(screen.getByLabelText('Send proposal')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Send proposal'));
    fireEvent.changeText(screen.getByTestId('proposal-message'), 'I can start tomorrow.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-send'));
    });

    // The bug: without reloading `myApps`, this button stays visible and a
    // second tap 400s as a duplicate application.
    await waitFor(() => expect(api.myApplications as jest.Mock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByLabelText('Send proposal')).toBeNull());
    expect(screen.getByText('Your proposal is in')).toBeTruthy();
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

  it('shows the cancelled status card instead of an empty action bar', async () => {
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('This job was cancelled')).toBeTruthy());
    expect(screen.getByText('CANCELLED')).toBeTruthy();
    expect(screen.queryByLabelText('Send proposal')).toBeNull();
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
    expect(screen.getByLabelText('Send proposal')).toBeTruthy();
  });

  it('a job that cannot be loaded shows the error in a card, and Try again loads it again', async () => {
    (api.getJob as jest.Mock).mockRejectedValueOnce(new Error('Job was filled')).mockResolvedValue(openJob);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    const card = await screen.findByTestId('error-card');
    expect(within(card).getByText("This job isn't available")).toBeTruthy();
    expect(within(card).getByText('Job was filled')).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Send proposal')).toBeTruthy();
  });

  it('a job with no photos says so inside the card', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByText('No photos attached')).toBeTruthy();
    expect(within(screen.getByTestId('empty-card')).getByText('No photos attached')).toBeTruthy();
  });

  it('keeps the checklist locked before Start Job and does not claim completion', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'confirmed', assigned_provider_id: PROVIDER_ID,
      job_tasks: [{ id: 'task-1', label: 'Fix tap', position: 0, is_done: false }] });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Start job');
    expect(screen.getByRole('checkbox').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText('Waiting for client to confirm completion')).toBeNull();
    expect(screen.queryByText('Accept Booking')).toBeNull();
  });

  it('starts confirmed work after the provider confirms, without accepting the booking again', async () => {
    const confirmed = { ...openJob, status: 'confirmed', assigned_provider_id: PROVIDER_ID };
    (api.getJob as jest.Mock).mockResolvedValueOnce(confirmed)
      .mockResolvedValue({ ...confirmed, status: 'in_progress' });
    (api.startJob as jest.Mock).mockResolvedValue({ ...confirmed, status: 'in_progress' });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    fireEvent.press(await screen.findByText('Start job'));
    fireEvent.press(screen.getByLabelText("I'm here, start job"));
    await waitFor(() => expect(api.startJob).toHaveBeenCalledWith(JOB_ID));
    expect(api.startJob).toHaveBeenCalledTimes(1);
    await screen.findByText('WORKING');
    expect(screen.queryByText('Start job')).toBeNull();
  });

  it('Start job asks first and does not start the job on its own', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'confirmed', assigned_provider_id: PROVIDER_ID });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    fireEvent.press(await screen.findByText('Start job'));
    expect(screen.getByText('Start the job now?')).toBeTruthy();
    expect(screen.getByText("Do this when you're at 123 Main St. The client gets a notification that you've started.")).toBeTruthy();
    expect(api.startJob).not.toHaveBeenCalled();
  });

  it('Not yet closes the confirm and does not start the job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'confirmed', assigned_provider_id: PROVIDER_ID });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    fireEvent.press(await screen.findByText('Start job'));
    fireEvent.press(screen.getByLabelText('Not yet'));
    await waitFor(() => expect(screen.queryByText('Start the job now?')).toBeNull());
    expect(api.startJob).not.toHaveBeenCalled();
    expect(screen.getByText('Start job')).toBeTruthy();
  });

  it('lets a legacy assigned booking start without another acceptance', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'assigned', assigned_provider_id: PROVIDER_ID });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Start job');
    expect(screen.queryByText('Accept Booking')).toBeNull();
  });

  it('offers the existing dispute screen for a cancelled job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'cancelled', assigned_provider_id: PROVIDER_ID });
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);
    fireEvent.press(await screen.findByLabelText('More job actions'));
    fireEvent.press(screen.getByText('Report a problem'));
    expect(onNavigate).toHaveBeenCalledWith('Dispute Filing', JOB_ID);
  });
  it.each([1, 4])('offers warranty review only during the three-day window (age %i)', async (days) => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'completed', assigned_provider_id: PROVIDER_ID,
      completed_at: new Date(Date.now() - days * 86400000).toISOString(),
      warranty_expires_at: new Date(Date.now() + (3 - days) * 86400000).toISOString() });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText(openJob.title);
    if (days < 3) {
      fireEvent.press(screen.getByLabelText('More job actions'));
      expect(await screen.findByText('Report a problem')).toBeTruthy();
    } else {
      expect(screen.queryByLabelText('More job actions')).toBeNull();
    }
  });

});

describe('SPJobDetailScreen — withdrawing a pending proposal', () => {
  const pending = { id: 'app-1', status: 'pending' as const, jobs: { id: JOB_ID } };

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
  });

  it('asks first, then withdraws the proposal and reloads the applications', async () => {
    (api.myApplications as jest.Mock)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ ...pending, status: 'withdrawn' }]);
    (api.withdrawApplication as jest.Mock).mockResolvedValue({});
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Withdraw proposal'));
    expect(screen.getByText('Withdraw your proposal?')).toBeTruthy();
    expect(api.withdrawApplication).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Withdraw'));
    });
    await waitFor(() => expect(api.withdrawApplication).toHaveBeenCalledWith('app-1'));
    await waitFor(() => expect(api.myApplications).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Withdraw your proposal?')).toBeNull());
  });

  it('keeps the proposal when the client cancels the confirm', async () => {
    (api.myApplications as jest.Mock).mockResolvedValue([pending]);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByLabelText('Withdraw proposal'));
    fireEvent.press(screen.getByLabelText('Keep it'));

    await waitFor(() => expect(screen.queryByText('Withdraw your proposal?')).toBeNull());
    expect(api.withdrawApplication).not.toHaveBeenCalled();
    expect(screen.getByText('Your proposal is in')).toBeTruthy();
  });

  it('offers no withdraw once the proposal was not selected', async () => {
    (api.myApplications as jest.Mock).mockResolvedValue([{ ...pending, status: 'rejected' }]);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    await screen.findByText("Your proposal wasn't accepted");
    expect(screen.queryByLabelText('Withdraw proposal')).toBeNull();
  });
});

describe('SPJobDetailScreen — status card, one main action and the client card', () => {
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const hired = {
    ...openJob,
    status: 'confirmed' as const,
    assigned_provider_id: PROVIDER_ID,
    scheduled_at: inDays(5),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
    (api.conversations as jest.Mock).mockResolvedValue([]);
  });

  it('a pending proposal shows what was sent, and Find more jobs opens the Feed', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.myApplications as jest.Mock).mockResolvedValue([
      {
        id: 'app-1',
        status: 'pending',
        jobs: { id: JOB_ID },
        applied_at: '2026-10-07T12:00:00.000Z',
        cover_message: 'I can do this on Oct 14.',
      },
    ]);
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    expect(await screen.findByText('Your proposal is in')).toBeTruthy();
    expect(screen.getByText('Your proposal')).toBeTruthy();
    expect(screen.getByText('I can do this on Oct 14.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Find more jobs'));
    expect(onNavigate).toHaveBeenCalledWith('Dashboard');
  });

  it('an unverified provider is sent to Verification from the main button', async () => {
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: false, refreshProfile: jest.fn() });
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByLabelText('Verify to apply'));
    expect(onNavigate).toHaveBeenCalledWith('Verification');
  });

  it('a booked job starts from the main button and opens the decline dialog from the link', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hired);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByLabelText('Start job')).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Can't make it? Decline booking"));
    expect(await screen.findByText('Decline Booking')).toBeTruthy();
  });

  it('a working job lets the provider tick a task and then message the client', async () => {
    const working = {
      ...hired,
      status: 'in_progress' as const,
      job_tasks: [{ id: 'task-1', label: 'Fix tap', position: 0, is_done: false, completed_at: null }],
    };
    (api.getJob as jest.Mock).mockResolvedValue(working);
    (api.updateJobTask as jest.Mock).mockResolvedValue(working);
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByLabelText('Fix tap'));
    await waitFor(() => expect(api.updateJobTask).toHaveBeenCalledWith(JOB_ID, 'task-1', true));

    fireEvent.press(screen.getByLabelText('Message client'));
    expect(onNavigate).toHaveBeenCalledWith('Chat', JOB_ID);
  });

  it('a hired job shows the homeowner from the conversation list and opens the chat', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hired);
    (api.conversations as jest.Mock).mockResolvedValue([
      {
        id: 'conv-1',
        job_id: JOB_ID,
        job_title: 'Fix the sink',
        job_status: 'confirmed',
        counterpart_name: 'Maria Santos',
        counterpart_avatar_url: null,
        last_message_at: null,
        created_at: '2026-10-01T00:00:00.000Z',
      },
    ]);
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    expect(await screen.findByText('Maria Santos')).toBeTruthy();
    expect(screen.getByText('Client')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Message Maria Santos'));
    expect(onNavigate).toHaveBeenCalledWith('Chat', JOB_ID);
  });

  it('a hired job with no conversation yet shows Client', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hired);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    // The name falls back to "Client", and the role line under it says "Client" as well.
    expect(await screen.findAllByText('Client')).toHaveLength(2);
  });

  it('keeps the homeowner name on screen when the job is opened again, while the list reloads', async () => {
    const conversation = {
      id: 'conv-1',
      job_id: JOB_ID,
      job_title: 'Fix the sink',
      job_status: 'confirmed',
      counterpart_name: 'Maria Santos',
      counterpart_avatar_url: null,
      last_message_at: null,
      created_at: '2026-10-01T00:00:00.000Z',
    };
    (api.getJob as jest.Mock).mockResolvedValue(hired);
    (api.conversations as jest.Mock).mockResolvedValue([conversation]);
    const first = render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByText('Maria Santos')).toBeTruthy();
    first.unmount();

    // The second visit asks for the list again, and that request does not finish while the test looks.
    (api.conversations as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('Client')).toBeTruthy();
    expect(screen.getByText('Maria Santos')).toBeTruthy();
    // Only the role line says "Client": the name is still the homeowner's, not the fallback.
    expect(screen.getAllByText('Client')).toHaveLength(1);
  });

  it('a completed job shows the earnings and View in wallet opens the Wallet', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...hired,
      status: 'completed',
      completed_at: inDays(-2),
      warranty_expires_at: inDays(1),
    });
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    expect(await screen.findByText('Job price')).toBeTruthy();
    expect(screen.getByText('Released to you')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('View in wallet'));
    expect(onNavigate).toHaveBeenCalledWith('Wallet');
  });

  it('an open complaint on a booked job says so and keeps Start job as the main action', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(hired);
    (api.jobDispute as jest.Mock).mockResolvedValue({ id: 'd-1', status: 'open', escrow_transactions: null });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('Complaint awaiting admin review')).toBeTruthy();
    expect(screen.getByLabelText('Start job')).toBeTruthy();
  });

  it('a cancelled job with a pending cancellation opens the complaint status as its main action', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...hired, status: 'cancelled' });
    (api.jobDispute as jest.Mock).mockResolvedValue({
      id: 'd-1',
      status: 'open',
      cancellation_state: 'pending',
      cancellation_deadline: inDays(2),
      escrow_transactions: null,
    });
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    expect(await screen.findByText('The client asked to cancel')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('View Complaint Status'));
    expect(onNavigate).toHaveBeenCalledWith('Dispute Status', JOB_ID);
  });
});

it('opens the selected job image and keeps details intact on close', async () => {
  (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
  (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, photo_urls: ['https://test/portrait', 'https://test/landscape'] });
  (api.myApplications as jest.Mock).mockResolvedValue([]);
  render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
  fireEvent.press(await screen.findByLabelText('Open job photo 2'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe('https://test/landscape');
  expect(screen.getByTestId('full-photo').props.resizeMode).toBe('contain');
  fireEvent.press(screen.getByLabelText('Close photo'));
  expect(screen.queryByTestId('full-photo')).toBeNull();
  expect(screen.getByLabelText('Open job photo 2')).toBeTruthy();
});

describe('SPJobDetailScreen — every control has an accessible name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
    (api.conversations as jest.Mock).mockResolvedValue([]);
  });

  it('names the back arrow, the ⋮ menu and the main action of an open job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });
});
