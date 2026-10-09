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

const pendingApp: JobApplication = {
  id: 'app-1',
  job_id: 'job-1',
  provider_id: 'prov-1',
  status: 'pending',
  source: 'organic',
  cover_message: 'I can come Friday evening.',
  applied_at: new Date().toISOString(),
  decided_at: null,
  provider: {
    id: 'prov-1',
    full_name: 'Alex Reyes',
    avatar_url: null,
    city: 'Cebu',
    provider_profiles: { is_verified: true, cached_avg_rating: 4, cached_completed_jobs: 2 },
  },
};

function mockJob(budget: number | null) {
  (api.getJob as jest.Mock).mockResolvedValue({
    id: 'job-1',
    title: 'Window cleaning',
    budget,
    scheduled_at: null,
  });
}

async function renderScreen(onNavigate: jest.Mock = jest.fn()) {
  render(<HOJobApplicationsScreen jobId="job-1" onBack={jest.fn()} onNavigate={onNavigate} />);
  // Let the proposals load before the test looks at the screen.
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

describe('HOJobApplicationsScreen: paying for a hire', () => {
  it('pays from the wallet only on the confirm page, and calls acceptApplication once', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByTestId('applications-accept-app-1'));
    // The "Hire this provider?" dialog is still in front of the sheet until the
    // proposals list is reworked; it only leads to the sheet.
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

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

    fireEvent.press(await screen.findByTestId('applications-accept-app-1'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(await screen.findByRole('button', { name: 'Add money to wallet' }));

    expect(onNavigate).toHaveBeenCalledWith('Wallet');
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('a job without a budget hires straight from the confirm page, with nothing held', async () => {
    mockJob(null);
    await renderScreen();

    fireEvent.press(await screen.findByTestId('applications-accept-app-1'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

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
