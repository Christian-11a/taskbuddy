import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import SPJobDetailScreen from '../SPJobDetailScreen';
import ContentSkeleton from '../../../../src/components/ui/ContentSkeleton';
import { StyleSheet } from 'react-native';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    getJob: jest.fn(),
    myVerification: jest.fn(),
    jobDispute: jest.fn().mockResolvedValue(null),
    myApplications: jest.fn(),
    applyToJob: jest.fn(),
    startJob: jest.fn(),
    withdrawApplication: jest.fn(),
    updateJobTask: jest.fn(),
    conversations: jest.fn(),
    uploadImage: jest.fn(),
    payoutAccount: jest.fn().mockResolvedValue({ id: 'acct-1' }),
    jobChangeRequests: jest.fn().mockResolvedValue([]),
    decideJobChange: jest.fn(),
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

jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///proof.jpg' }] }),
  UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
}));
jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const JOB_ID = 'job-1';
const PROVIDER_ID = 'provider-1';

// The job, complaint and applications reads are cached per job; every test starts from an empty cache.
beforeEach(() => {
  clearAsyncDataCache();
  (api.myVerification as jest.Mock).mockReset();
});

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

  it('a verified provider can send a proposal even when /verifications/me answers the empty shape', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: PROVIDER_ID }, providerProfile: { identity_verified: true, is_verified: true },
      isVerified: true, refreshProfile: jest.fn(),
    });
    (api.myVerification as jest.Mock).mockResolvedValue({ identity: 'none', certificate: 'none', verified: false, services: [] });
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByLabelText('Send proposal')).toBeTruthy();
    expect(screen.queryByLabelText('Get verified')).toBeNull();
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

  it('shows the tasks as a plain list before Start Job, with no checkboxes, and does not claim completion', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'confirmed', assigned_provider_id: PROVIDER_ID,
      job_tasks: [{ id: 'task-1', label: 'Fix tap', position: 0, is_done: false }] });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Start job');
    expect(screen.getByText('What the job includes')).toBeTruthy();
    expect(screen.getByText('Fix tap')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
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
  it('a completed job offers no report, even when an old warranty date is still on the record', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'completed', assigned_provider_id: PROVIDER_ID,
      completed_at: new Date(Date.now() - 86400000).toISOString(),
      warranty_expires_at: new Date(Date.now() + 2 * 86400000).toISOString() });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText(openJob.title);
    expect(screen.queryByLabelText('More job actions')).toBeNull();
    expect(screen.queryByText(/Warranty/i)).toBeNull();
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

    fireEvent.press(await screen.findByLabelText('Get verified'));
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

    (api.uploadImage as jest.Mock).mockResolvedValue('provider-1/proof.jpg');
    fireEvent.press(await screen.findByLabelText('Fix tap'));

    // Ticking done asks for proof first; it cannot be marked done without a photo.
    expect(await screen.findByText('Show the finished task')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark as done', disabled: true })).toBeTruthy();
    expect(api.updateJobTask).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' })));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Mark as done' })));
    await waitFor(() =>
      expect(api.updateJobTask).toHaveBeenCalledWith(JOB_ID, 'task-1', true, ['provider-1/proof.jpg']),
    );
    expect(api.uploadImage).toHaveBeenCalledWith('task-proof', 'file:///proof.jpg');

    fireEvent.press(screen.getByLabelText('Message client'));
    expect(onNavigate).toHaveBeenCalledWith('Chat', JOB_ID);
  });

  it('shows the proof photos under a task that is done', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...hired,
      status: 'in_progress' as const,
      job_tasks: [{
        id: 'task-1', label: 'Fix tap', position: 0, is_done: true, completed_at: '2026-10-16T00:00:00Z',
        proof_photo_urls: ['https://public/proof.jpg'],
      }],
    });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(await screen.findByLabelText('Proof for Fix tap, photo 1 of 1')).toBeTruthy();
  });

  it('lays each task row out centred, with a fixed 24dp box beside the text', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...hired,
      status: 'in_progress' as const,
      job_tasks: [{ id: 'task-1', label: 'Fix tap', position: 0, is_done: false, completed_at: null }],
    });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    const row = await screen.findByTestId('task-row-task-1');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'row', alignItems: 'center', gap: 12 });
    const box = row.findAll((node) => StyleSheet.flatten(node.props.style)?.width === 24)[0];
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ width: 24, height: 24, flexShrink: 0 });
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

  it('a completed job shows the earnings and View payouts opens the Payout Account', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...hired,
      status: 'completed',
      completed_at: inDays(-2),
      warranty_expires_at: inDays(1),
    });
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    expect(await screen.findByText('Job price')).toBeTruthy();
    expect(screen.queryByText('Released to you')).toBeNull();
    fireEvent.press(screen.getByLabelText('View payouts'));
    expect(onNavigate).toHaveBeenCalledWith('Payout Account');
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

describe('SPJobDetailScreen — a reload keeps the job on screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: PROVIDER_ID },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('shows the skeleton only while no job has loaded yet', () => {
    (api.getJob as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(screen.UNSAFE_queryByType(ContentSkeleton)).toBeTruthy();
    expect(screen.queryByTestId('refresh-bar')).toBeNull();
  });

  it('keeps the job under a thin progress line while it reloads, with no skeleton', async () => {
    const { rerender } = render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Fix the sink')).toBeTruthy());

    (api.getJob as jest.Mock).mockReturnValue(new Promise(() => {}));
    rerender(<SPJobDetailScreen jobId="job-2" onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(screen.getByText('Fix the sink')).toBeTruthy();
    expect(screen.getByTestId('refresh-bar')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ContentSkeleton)).toBeNull();
  });
});

describe('SPJobDetailScreen — the Start job dialog says when the job was booked for', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: PROVIDER_ID },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
  });

  /** Opens the Start job dialog for a confirmed job booked at `scheduledAt`. */
  async function openStartDialog(scheduledAt: string | null) {
    (api.getJob as jest.Mock).mockResolvedValue({
      ...openJob,
      status: 'confirmed',
      assigned_provider_id: PROVIDER_ID,
      scheduled_at: scheduledAt,
    });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    fireEvent.press(await screen.findByText('Start job'));
    expect(screen.getByText('Start the job now?')).toBeTruthy();
  }

  it('keeps the dialog as it was for a job booked within 24 hours, with the same button', async () => {
    await openStartDialog(new Date(Date.now() + 3 * HOUR_MS).toISOString());

    expect(screen.getByText("Do this when you're at 123 Main St. The client gets a notification that you've started.")).toBeTruthy();
    expect(screen.getByLabelText("I'm here, start job")).toBeTruthy();
    expect(screen.queryByLabelText('Start now')).toBeNull();
  });

  it('says a job booked more than a day ago was booked for that day, and the button reads Start now', async () => {
    await openStartDialog(new Date(Date.now() - 4 * DAY_MS).toISOString());

    expect(screen.getByText(/This job was booked for .+ \(4 days ago\)\. Start it now\?/)).toBeTruthy();
    expect(screen.getByText(/Do this when you're at 123 Main St\./)).toBeTruthy();
    expect(screen.getByLabelText('Start now')).toBeTruthy();
    expect(api.startJob).not.toHaveBeenCalled();
  });

  it('says a job booked more than a day ahead is booked for that day, and the button reads Start now', async () => {
    await openStartDialog(new Date(Date.now() + 2 * DAY_MS).toISOString());

    expect(screen.getByText(/This job is booked for .+ \(in 2 days\)\. Start it now\?/)).toBeTruthy();
    expect(screen.getByLabelText('Start now')).toBeTruthy();
  });
});

describe('SPJobDetailScreen — payout account before proposing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.getJob as jest.Mock).mockResolvedValue(openJob);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('says ONE STEP LEFT and offers a button to the Payout account screen in place of Send proposal when none is linked', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    await waitFor(() => expect(screen.getByLabelText('Link payout account')).toBeTruthy());
    expect(screen.getByText('ONE STEP LEFT')).toBeTruthy();
    expect(screen.getByText('Link a payout account to send proposals')).toBeTruthy();
    expect(screen.getByText('You are verified. Add a GCash, Maya or bank account so you can get paid, then send your proposal.')).toBeTruthy();
    expect(screen.queryByTestId('payout-note')).toBeNull();
    expect(screen.queryByLabelText('Send proposal')).toBeNull();

    fireEvent.press(screen.getByLabelText('Link payout account'));
    expect(onNavigate).toHaveBeenCalledWith('Payout Account');
  });

  it('keeps Send proposal when the payout lookup fails, and the failure is not cached as linked', async () => {
    (api.payoutAccount as jest.Mock).mockRejectedValue(new Error('network down'));
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Send proposal')).toBeTruthy());
    expect(screen.queryByLabelText('Link payout account')).toBeNull();
    expect(screen.queryByTestId('payout-note')).toBeNull();
    expect(api.payoutAccount).toHaveBeenCalled();
  });

  it('keeps Send proposal when an account is linked', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue({ id: 'acct-1' });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Send proposal')).toBeTruthy());
    expect(screen.queryByTestId('payout-note')).toBeNull();
  });

  it('shows the note, not a generic error, when the server answers 403 payout_account_required', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue({ id: 'acct-1' });
    const { ApiError } = jest.requireMock('../../../../src/lib/api');
    (api.applyToJob as jest.Mock).mockRejectedValue(new ApiError('Forbidden', 403, 'payout_account_required'));
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    await waitFor(() => expect(screen.getByLabelText('Send proposal')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Send proposal'));
    fireEvent.changeText(screen.getByTestId('proposal-message'), 'I can start tomorrow morning.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-send'));
    });

    expect(screen.getByTestId('proposal-payout-note')).toBeTruthy();
    expect(screen.queryByText('Forbidden')).toBeNull();
    fireEvent.press(screen.getByTestId('proposal-link-payout'));
    expect(onNavigate).toHaveBeenCalledWith('Payout Account');
  });

  it('shows a capacity dialog with the server message when sending a proposal answers 409 at the limit', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue({ id: 'acct-1' });
    const { ApiError } = jest.requireMock('../../../../src/lib/api');
    (api.applyToJob as jest.Mock).mockRejectedValue(
      new ApiError('You have 3 pending applications. Wait for a decision before applying again.', 409),
    );
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Send proposal')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Send proposal'));
    fireEvent.changeText(screen.getByTestId('proposal-message'), 'I can start tomorrow morning.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-send'));
    });

    expect(await screen.findByText('Proposal limit reached')).toBeTruthy();
    expect(screen.getByText('You have 3 pending proposals. Wait for a decision before sending another proposal.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByText('Proposal limit reached')).toBeNull());
  });
});

describe('SPJobDetailScreen — dispute banner', () => {
  it('shows the open-complaint banner above the status card and opens the case when pressed', async () => {
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, status: 'in_progress', display_status: 'disputed', assigned_provider_id: PROVIDER_ID });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.conversations as jest.Mock).mockResolvedValue([]);
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    const banner = await screen.findByTestId('dispute-banner');
    expect(within(banner).getByText('A complaint is open. An admin is reviewing it.')).toBeTruthy();
    fireEvent.press(banner);
    expect(onNavigate).toHaveBeenCalledWith('Dispute Status', JOB_ID);
  });
});

describe('SPJobDetailScreen — platform fee breakdown (M15)', () => {
  const fee = { rate: 0.15, amount: 75, provider_receives: 425 };
  const summary = 'Job price ₱500.00 · Platform fee (15%) −₱75.00 · You receive ₱425.00';
  const booked = {
    ...openJob,
    status: 'confirmed' as const,
    assigned_provider_id: PROVIDER_ID,
    scheduled_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
    (api.conversations as jest.Mock).mockResolvedValue([]);
  });

  const renderJob = (job: object) => {
    (api.getJob as jest.Mock).mockResolvedValue(job);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
  };

  it('an open job shows the price, the fee and what the provider receives before a proposal', async () => {
    renderJob({ ...openJob, fee });

    const breakdown = await screen.findByTestId('job-fee-breakdown');
    expect(within(breakdown).getByText('Job price')).toBeTruthy();
    expect(within(breakdown).getByText('₱500.00')).toBeTruthy();
    expect(within(breakdown).getByText('Platform fee (15%)')).toBeTruthy();
    expect(within(breakdown).getByText('−₱75.00')).toBeTruthy();
    expect(within(breakdown).getByText('You receive')).toBeTruthy();
    expect(within(breakdown).getByText('₱425.00')).toBeTruthy();
    expect(screen.getByLabelText(summary)).toBeTruthy();
  });

  it('the proposal sheet repeats the breakdown for the same job', async () => {
    renderJob({ ...openJob, fee });

    fireEvent.press(await screen.findByLabelText('Send proposal'));

    expect(screen.getByTestId('proposal-fee').props.accessibilityLabel).toBe(summary);
  });

  it('a booked job shows the three rows and what the provider will receive once the client confirms', async () => {
    renderJob({ ...booked, fee });

    const breakdown = await screen.findByTestId('job-fee-breakdown');
    expect(within(breakdown).getByText('Job price')).toBeTruthy();
    expect(within(breakdown).getByText('Platform fee (15%)')).toBeTruthy();
    expect(within(breakdown).getByText('You receive')).toBeTruthy();
    expect(within(breakdown).getByText("You'll receive ₱425.00 when the client confirms the job is done.")).toBeTruthy();
    expect(screen.queryByText(/A platform fee is taken/)).toBeNull();
    expect(within(breakdown).getByTestId('job-fee-booked')).toBeTruthy();
    expect(screen.queryByTestId('job-fee-paid-out')).toBeNull();
  });

  it('a job in progress shows the same three rows and timing line as a booked one', async () => {
    renderJob({ ...booked, status: 'in_progress', fee });

    const breakdown = await screen.findByTestId('job-fee-breakdown');
    expect(within(breakdown).getByText('Job price')).toBeTruthy();
    expect(within(breakdown).getByText('Platform fee (15%)')).toBeTruthy();
    expect(within(breakdown).getByText('You receive')).toBeTruthy();
    expect(within(breakdown).getByText("You'll receive ₱425.00 when the client confirms the job is done.")).toBeTruthy();
    expect(screen.queryByText(/A platform fee is taken/)).toBeNull();
  });

  it('a job in progress without a fee shows no figures', async () => {
    renderJob({ ...booked, status: 'in_progress', fee: null });

    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(screen.queryByTestId('job-fee-breakdown')).toBeNull();
    expect(screen.queryByText(/You'll receive/)).toBeNull();
  });

  it('a completed job shows the three rows and what was paid out, less the fee', async () => {
    renderJob({ ...booked, status: 'completed', completed_at: new Date().toISOString(), fee });

    const breakdown = await screen.findByTestId('job-fee-breakdown');
    expect(within(breakdown).getByText('Platform fee (15%)')).toBeTruthy();
    expect(within(breakdown).getByText('Paid out ₱425.00 (₱500.00 − ₱75.00 fee)')).toBeTruthy();
    expect(screen.queryByText(/You'll receive/)).toBeNull();
    expect(screen.queryByText(/A platform fee is taken/)).toBeNull();
  });

  it('a completed job without a fee keeps the fee sentence and shows no figures', async () => {
    renderJob({ ...booked, status: 'completed', completed_at: new Date().toISOString(), fee: null });

    expect(await screen.findByText("A platform fee is taken when it's paid out to your linked GCash, Maya or bank account.")).toBeTruthy();
    expect(screen.queryByTestId('job-fee-breakdown')).toBeNull();
  });

  it('shows no fee line for an open job without a fee', async () => {
    renderJob({ ...openJob, fee: null });
    expect(await screen.findByLabelText('Send proposal')).toBeTruthy();
    expect(screen.queryByTestId('job-fee-breakdown')).toBeNull();
    expect(screen.queryByText(/Platform fee/)).toBeNull();
  });

  it('shows no fee line for a booked or completed job without a fee', async () => {
    renderJob({ ...booked, fee: undefined });
    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(screen.queryByText(/You'll receive/)).toBeNull();
    expect(screen.queryByTestId('job-fee-paid-out')).toBeNull();
  });
});

describe('SPJobDetailScreen — task list by job state, complaint hides Start job, saved reads', () => {
  const tasks = [
    { id: 'task-1', label: 'Fix tap', position: 0, is_done: false, completed_at: null },
    { id: 'task-2', label: 'Clean up', position: 1, is_done: false, completed_at: null },
  ];
  const booked = {
    ...openJob,
    status: 'confirmed' as const,
    assigned_provider_id: PROVIDER_ID,
    scheduled_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    job_tasks: tasks,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
    (api.conversations as jest.Mock).mockResolvedValue([]);
  });

  const renderJob = (job: object) => {
    (api.getJob as jest.Mock).mockResolvedValue(job);
    return render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
  };

  it('an open job lists its tasks as a plain list, with no checkboxes', async () => {
    renderJob({ ...openJob, job_tasks: tasks });

    expect(await screen.findByText('What the job includes')).toBeTruthy();
    expect(screen.getByTestId('task-item-task-1')).toBeTruthy();
    expect(screen.getByText('Clean up')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('a provider with a pending proposal sees the same plain list', async () => {
    (api.myApplications as jest.Mock).mockResolvedValue([{ id: 'app-1', status: 'pending', jobs: { id: JOB_ID } }]);
    renderJob({ ...openJob, job_tasks: tasks });

    expect(await screen.findByText('Your proposal is in')).toBeTruthy();
    expect(screen.getByTestId('task-item-task-2')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('a booked job not yet started lists its tasks plainly, and Start job still asks first', async () => {
    renderJob(booked);

    fireEvent.press(await screen.findByLabelText('Start job'));
    expect(screen.getByText('Start the job now?')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(api.startJob).not.toHaveBeenCalled();
  });

  it('a job in progress shows tickable checkboxes', async () => {
    renderJob({ ...booked, status: 'in_progress' });

    await screen.findByTestId('task-row-task-1');
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(screen.getByLabelText('Fix tap').props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(screen.queryByTestId('task-item-task-1')).toBeNull();
  });

  it('a completed job shows ticked checkboxes with proof photos, read-only', async () => {
    renderJob({
      ...booked,
      status: 'completed',
      completed_at: new Date().toISOString(),
      job_tasks: [
        { ...tasks[0], is_done: true, completed_at: '2026-10-16T00:00:00Z', proof_photo_urls: ['https://public/proof.jpg'] },
        tasks[1],
      ],
    });

    const ticked = await screen.findByLabelText('Fix tap');
    expect(ticked.props.accessibilityState).toEqual({ checked: true, disabled: true });
    expect(screen.getByLabelText('Clean up').props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(screen.getByLabelText('Proof for Fix tap, photo 1 of 1')).toBeTruthy();
  });

  it('an open complaint on a booked job hides Start job and the decline link', async () => {
    renderJob({ ...booked, display_status: 'disputed' });

    expect(await screen.findByTestId('dispute-banner')).toBeTruthy();
    expect(screen.queryByLabelText('Start job')).toBeNull();
    expect(screen.queryByLabelText("Can't make it? Decline booking")).toBeNull();
  });

  it('reopening a job shows the saved job and complaint at once, while the reads run again', async () => {
    (api.jobDispute as jest.Mock).mockResolvedValue({ id: 'd-1', status: 'open', escrow_transactions: null });
    const first = renderJob(booked);
    expect(await screen.findByText('Complaint awaiting admin review')).toBeTruthy();
    first.unmount();

    (api.getJob as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.jobDispute as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);

    expect(screen.getByText('Fix the sink')).toBeTruthy();
    expect(screen.getByText('Complaint awaiting admin review')).toBeTruthy();
  });
});

describe('SPJobDetailScreen — date or time change requests', () => {
  const booked = { ...openJob, status: 'confirmed' as const, assigned_provider_id: PROVIDER_ID, scheduled_at: '2030-10-05T09:30:00.000Z' };
  const request = (by: string) => ({
    id: 'r1', job_id: JOB_ID, requested_by: by, type: 'schedule', new_scheduled_at: '2030-10-07T06:00:00.000Z',
    new_budget: null, reason: 'Late shift', status: 'pending', created_at: new Date().toISOString(),
    expires_at: '2099-01-01T00:00:00.000Z', decided_at: null,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: true, refreshProfile: jest.fn() });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.jobDispute as jest.Mock).mockResolvedValue(null);
    (api.conversations as jest.Mock).mockResolvedValue([]);
    (api.getJob as jest.Mock).mockResolvedValue(booked);
  });

  it('offers the change in the menu when nothing is pending', async () => {
    (api.jobChangeRequests as jest.Mock).mockResolvedValue([]);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    fireEvent.press(await screen.findByLabelText('More job actions'));
    expect(await screen.findByText('Change date or time')).toBeTruthy();
  });

  it('shows Accept and Decline for the client request, and hides the menu row', async () => {
    (api.jobChangeRequests as jest.Mock).mockResolvedValue([request('client-1')]);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByLabelText('Accept')).toBeTruthy();
    expect(screen.getByLabelText('Decline')).toBeTruthy();
    expect(screen.queryByLabelText('Withdraw')).toBeNull();
    expect(screen.queryByText('Change date or time')).toBeNull();
  });

  it('shows Withdraw for my own request', async () => {
    (api.jobChangeRequests as jest.Mock).mockResolvedValue([request(PROVIDER_ID)]);
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByLabelText('Withdraw')).toBeTruthy();
    expect(screen.queryByLabelText('Accept')).toBeNull();
  });

  it('does not offer the change once the job is in progress', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...booked, status: 'in_progress' as const });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Fix the sink');
    expect(screen.queryByText('Change date or time')).toBeNull();
  });

  it('does not offer the change for an open job or while a complaint is open', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob });
    const first = render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Fix the sink');
    expect(screen.queryByText('Change date or time')).toBeNull();
    first.unmount();
    clearAsyncDataCache();
    (api.getJob as jest.Mock).mockResolvedValue({ ...booked, display_status: 'disputed' });
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    await screen.findByText('Fix the sink');
    expect(screen.queryByText('Change date or time')).toBeNull();
  });
});

describe('SPJobDetailScreen — proposing per service', () => {
  const SERVICE = 7;
  const me = (over: object) => ({
    status: 'approved', identity: 'approved', certificate: 'none', verified: false,
    services: [
      { category_id: 1, name: 'Plumbing', primary: true, certificate: 'none' },
      { category_id: SERVICE, name: 'Cleaning', primary: false, certificate: 'approved' },
    ],
    ...over,
  });
  const open = () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...openJob, category_id: SERVICE, service_categories: { name: 'Cleaning' } });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.payoutAccount as jest.Mock).mockResolvedValue({ id: 'acct-1' });
  };
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: PROVIDER_ID }, isVerified: false, refreshProfile: jest.fn() });
  });

  it('lets a provider with only a secondary-service certificate send a proposal (primary not required)', async () => {
    open();
    (api.myVerification as jest.Mock).mockResolvedValue(me({}));
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={jest.fn()} />);
    expect(await screen.findByLabelText('Send proposal')).toBeTruthy();
  });

  it('asks for the service certificate when the ID is approved but that service has none, and opens the certificate step', async () => {
    open();
    (api.myVerification as jest.Mock).mockResolvedValue(me({
      services: [{ category_id: 1, name: 'Plumbing', primary: true, certificate: 'approved' }],
    }));
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);
    expect(await screen.findByText('Upload your Cleaning certificate to send proposals for this job.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Upload certificate'));
    expect(onNavigate).toHaveBeenCalledWith('Verification', undefined, { startAt: 'certificate', categoryId: SERVICE });
  });

  it('asks to verify the ID first when the ID is missing', async () => {
    open();
    (api.myVerification as jest.Mock).mockResolvedValue(me({ status: 'none', identity: 'none' }));
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);
    expect(await screen.findByText('Finish verification to apply')).toBeTruthy();
    expect(screen.getByText('Verify your ID and upload your certificate to send proposals.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Get verified'));
    expect(onNavigate).toHaveBeenCalledWith('Verification');
  });

  it('shows the server message and Upload certificate when the server answers 403 certificate_required', async () => {
    open();
    (api.myVerification as jest.Mock).mockResolvedValue(me({}));
    const { ApiError } = jest.requireMock('../../../../src/lib/api');
    (api.applyToJob as jest.Mock).mockRejectedValue(
      new ApiError('You need a valid Cleaning certificate to send proposals for this job', 403, 'certificate_required'),
    );
    const onNavigate = jest.fn();
    render(<SPJobDetailScreen jobId={JOB_ID} onBack={jest.fn()} onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByLabelText('Send proposal'));
    fireEvent.changeText(screen.getByTestId('proposal-message'), 'I can start tomorrow morning.');
    await act(async () => {
      fireEvent.press(screen.getByTestId('proposal-send'));
    });

    expect(screen.getByText('You need a valid Cleaning certificate to send proposals for this job')).toBeTruthy();
    fireEvent.press(screen.getByTestId('proposal-upload-certificate'));
    expect(onNavigate).toHaveBeenCalledWith('Verification', undefined, { startAt: 'certificate', categoryId: SERVICE });
  });
});
