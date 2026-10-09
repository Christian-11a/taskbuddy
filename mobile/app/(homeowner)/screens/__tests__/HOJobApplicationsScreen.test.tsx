import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOJobApplicationsScreen from '../HOJobApplicationsScreen';
import { api, type JobApplication } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  MIN_TOPUP_PHP: 50,
  MAX_CARD_PHP: 100000,
  api: {
    jobApplications: jest.fn(),
    getJob: jest.fn(),
    wallet: jest.fn(),
    acceptApplication: jest.fn(),
    rejectApplication: jest.fn(),
    createHireCheckoutSession: jest.fn(),
  },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'taskbuddy://hire',
}));

jest.mock('../../../../src/lib/appRedirectSession', () => ({
  openRedirectSession: jest.fn(),
}));

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3600_000 - 1000).toISOString();

function application(overrides: Partial<JobApplication> & { id: string }): JobApplication {
  return {
    job_id: 'job-1',
    provider_id: `prov-${overrides.id}`,
    status: 'pending',
    source: 'organic',
    cover_message: 'I can come Friday evening.',
    applied_at: TWO_HOURS_AGO,
    decided_at: null,
    provider: {
      id: `prov-${overrides.id}`,
      full_name: 'Alex Reyes',
      avatar_url: null,
      city: 'Cebu',
      provider_profiles: { is_verified: true, cached_avg_rating: 4, cached_completed_jobs: 2 },
    },
    ...overrides,
  };
}

const pendingApp = application({ id: 'app-1' });

function mockJob(budget: number | null, scheduledAt: string | null = null) {
  (api.getJob as jest.Mock).mockResolvedValue({
    id: 'job-1',
    title: 'Window cleaning',
    budget,
    scheduled_at: scheduledAt,
  });
}

async function renderScreen(onNavigate: jest.Mock = jest.fn()) {
  render(<HOJobApplicationsScreen jobId="job-1" onBack={jest.fn()} onNavigate={onNavigate} />);
  // Let the proposals and the job load before the test looks at the screen.
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (api.jobApplications as jest.Mock).mockResolvedValue([pendingApp]);
  (api.wallet as jest.Mock).mockResolvedValue({ available: 5000 });
  (api.acceptApplication as jest.Mock).mockResolvedValue({});
  (api.rejectApplication as jest.Mock).mockResolvedValue({});
  mockJob(1000);
});

describe('HOJobApplicationsScreen: the proposals list', () => {
  it('puts Hire first and keeps View profile and Decline as small links', async () => {
    await renderScreen();

    expect(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "View Alex Reyes's profile" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline Alex Reyes' })).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();
  });

  it('shows the job, its budget and when it is wanted, and says what is held', async () => {
    await renderScreen();

    expect(await screen.findByText(/^Window cleaning · ₱1,000\.00 · ASAP$/)).toBeTruthy();
    expect(
      screen.getByText('Pick one provider. You only pay when you hire, and the money is held safely until the job is done.'),
    ).toBeTruthy();
  });

  it('a job with a scheduled date shows the day in the summary', async () => {
    mockJob(1000, new Date(2026, 9, 10, 12, 0).toISOString());
    await renderScreen();

    expect(await screen.findByText(/^Window cleaning · ₱1,000\.00 · \w{3}, Oct 10$/)).toBeTruthy();
  });

  it('a job without a budget says nothing is held', async () => {
    mockJob(null);
    await renderScreen();

    expect(await screen.findByText("Pick one provider. Nothing is held: they're hired straight away.")).toBeTruthy();
    expect(screen.queryByText(/₱/)).toBeNull();
  });

  it('shows verified status, rating, jobs done and when the proposal was sent', async () => {
    await renderScreen();

    expect(await screen.findByText('Verified')).toBeTruthy();
    expect(screen.getByText('4.0 · 2 jobs done')).toBeTruthy();
    expect(screen.getByText('Sent 2 hours ago')).toBeTruthy();
    expect(screen.getByText('I can come Friday evening.')).toBeTruthy();
  });

  it('an unverified provider can be seen but not hired yet', async () => {
    (api.jobApplications as jest.Mock).mockResolvedValue([
      application({
        id: 'app-1',
        provider: {
          id: 'prov-app-1',
          full_name: 'Alex Reyes',
          avatar_url: null,
          city: 'Cebu',
          provider_profiles: { is_verified: false, cached_avg_rating: null, cached_completed_jobs: 0 },
        },
      }),
    ]);
    await renderScreen();

    expect(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job', disabled: true })).toBeTruthy();
    expect(screen.getByText("Hiring unlocks once they're verified.")).toBeTruthy();
    expect(screen.getByText('New · 0 jobs done')).toBeTruthy();
  });

  it('groups declined and withdrawn proposals under NOT SELECTED, with no actions', async () => {
    (api.jobApplications as jest.Mock).mockResolvedValue([
      pendingApp,
      application({ id: 'app-2', status: 'rejected' }),
      application({ id: 'app-3', status: 'withdrawn' }),
    ]);
    await renderScreen();

    expect(await screen.findByText('NOT SELECTED (2)')).toBeTruthy();
    expect(screen.getByText('Not selected')).toBeTruthy();
    expect(screen.getByText('Withdrawn by the provider')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Hire Alex Reyes for this job' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Decline Alex Reyes' })).toHaveLength(1);
  });

  it('once someone is hired, the hired provider is marked and no other proposal can be hired', async () => {
    (api.jobApplications as jest.Mock).mockResolvedValue([
      application({ id: 'app-2', status: 'accepted' }),
      pendingApp,
    ]);
    await renderScreen();

    expect(await screen.findByText('Provider hired · Follow the job from Job Details')).toBeTruthy();
    expect(screen.getByText('Hired')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hire Alex Reyes for this job' })).toBeNull();
    expect(screen.getByText('NOT SELECTED (1)')).toBeTruthy();
  });

  it('Decline asks first, then rejects the proposal once', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Decline Alex Reyes' }));
    expect(screen.getByText('Reject this proposal?')).toBeTruthy();
    expect(api.rejectApplication).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(api.rejectApplication).toHaveBeenCalledTimes(1));
    expect(api.rejectApplication).toHaveBeenCalledWith('app-1');
  });

  it('View profile opens the provider for this job', async () => {
    const onNavigate = jest.fn();
    await renderScreen(onNavigate);

    fireEvent.press(await screen.findByRole('button', { name: "View Alex Reyes's profile" }));

    expect(onNavigate).toHaveBeenCalledWith('Provider Profile', 'prov-app-1');
  });
});

describe('HOJobApplicationsScreen: paying for a hire', () => {
  it('Hire opens the payment sheet straight away, with no extra dialog', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    expect(await screen.findByRole('header', { name: 'Hire Alex Reyes' })).toBeTruthy();
    expect(screen.queryByText('Hire this provider?')).toBeNull();
    expect(api.getJob).toHaveBeenCalledWith('job-1');
    expect(api.wallet).toHaveBeenCalled();
  });

  it('pays from the wallet only on the confirm page, and calls acceptApplication once', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    const wallet = await screen.findByRole('radio', { name: 'Wallet, ₱5,000.00 available' });
    fireEvent.press(wallet);
    expect(api.acceptApplication).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(api.acceptApplication).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire · ₱1,000.00' }));

    await waitFor(() => expect(api.acceptApplication).toHaveBeenCalledTimes(1));
    expect(api.acceptApplication).toHaveBeenCalledWith('app-1');
    expect(api.createHireCheckoutSession).not.toHaveBeenCalled();
  });

  it('a short wallet offers add money, which leaves the sheet and opens the Wallet', async () => {
    (api.wallet as jest.Mock).mockResolvedValue({ available: 200 });
    const onNavigate = jest.fn();
    await renderScreen(onNavigate);

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    fireEvent.press(await screen.findByRole('button', { name: 'Add money to wallet' }));

    expect(onNavigate).toHaveBeenCalledWith('Wallet');
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('a job without a budget hires straight from the confirm page, with nothing held', async () => {
    mockJob(null);
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    // Hire stays disabled until the job has loaded, so it can't be pressed early.
    const hire = await waitFor(() => screen.getByRole('button', { name: 'Hire Alex Reyes', disabled: false }));
    fireEvent.press(hire);
    expect(api.acceptApplication).not.toHaveBeenCalled();
    expect(screen.getByText("Nothing is held — they're hired straight away.")).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire' }));

    await waitFor(() => expect(api.acceptApplication).toHaveBeenCalledTimes(1));
    expect(api.acceptApplication).toHaveBeenCalledWith('app-1');
  });
});
