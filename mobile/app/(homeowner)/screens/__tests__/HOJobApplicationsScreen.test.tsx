import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { BackHandler, Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import HOJobApplicationsScreen from '../HOJobApplicationsScreen';
import { api, type JobApplication } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { openRedirectSession } from '../../../../src/lib/appRedirectSession';
import { showToast } from '../../../../src/components/Toast';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_HIRE_PAYMENT_TTL_MS,
  PENDING_HIRE_PAYMENTS_KEY,
  resetPendingHirePaymentsForTests,
} from '../../../../src/lib/pendingHirePayments';

jest.mock('../../../../src/lib/api', () => ({
  MIN_TOPUP_PHP: 50,
  MAX_CARD_PHP: 100000,
  api: {
    jobApplications: jest.fn(),
    getJob: jest.fn(),
    acceptApplication: jest.fn(),
    rejectApplication: jest.fn(),
    createHireCheckoutSession: jest.fn(),
    getProvider: jest.fn(),
    getProviderReviews: jest.fn(),
    getProviderWork: jest.fn(),
    providerPortfolio: jest.fn(),
  },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'taskbuddy://hire',
}));

jest.mock('../../../../src/lib/appRedirectSession', () => ({
  openRedirectSession: jest.fn(),
}));

jest.mock('../../../../src/components/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('expo-image', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { Image: (p: any) => R.createElement(View, p) };
});

const ONLINE = "GCash, Maya, card or bank, ₱1,000.00 on Xendit's secure page (test mode)";

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 3600_000 - 1000).toISOString();

function application(overrides: Partial<JobApplication> & { id: string }): JobApplication {
  return {
    job_id: 'job-1',
    provider_id: `prov-${overrides.id}`,
    status: 'pending',
    source: 'organic',
    cover_message: 'I can come Friday evening.',
    quote_amount: 1000,
    posted_budget: 1000,
    fee: { rate: 0.15, amount: 150, provider_receives: 850 },
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
  pendingApp.quote_amount = budget;
  pendingApp.posted_budget = budget;
  pendingApp.fee = budget == null ? null : { rate: 0.15, amount: budget * 0.15, provider_receives: budget * 0.85 };
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

/** The waits the device holds, as parsed JSON, or null when nothing is stored. */
async function storedWaits(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(PENDING_HIRE_PAYMENTS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (api.jobApplications as jest.Mock).mockResolvedValue([pendingApp]);
  (api.acceptApplication as jest.Mock).mockResolvedValue({});
  (api.rejectApplication as jest.Mock).mockResolvedValue({});
  (api.getProvider as jest.Mock).mockResolvedValue({
    profile_id: 'prov-app-1',
    years_experience: 2,
    is_verified: true,
    cached_avg_rating: 4,
    cached_completed_jobs: 2,
    bio: 'Ten years of window work.',
    service_categories: { name: 'Cleaning' },
    approved_secondary_services: [],
    profiles: { full_name: 'Alex Reyes', avatar_url: null, city: 'Cebu' },
  });
  (api.getProviderReviews as jest.Mock).mockResolvedValue([]);
  (api.getProviderWork as jest.Mock).mockResolvedValue([]);
  (api.providerPortfolio as jest.Mock).mockResolvedValue([]);
  (api.createHireCheckoutSession as jest.Mock).mockResolvedValue({ url: 'https://checkout.example/session' });
  (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'cancel' });
  mockJob(1000);
});

// A card payment's wait is remembered on the device, so each test starts with nothing remembered.
beforeEach(async () => {
  await AsyncStorage.clear();
  await resetPendingHirePaymentsForTests();
});

describe('HOJobApplicationsScreen: the proposals list', () => {
  it('shows the provider photo on a proposal when the provider has one', async () => {
    mockJob(1000);
    (api.jobApplications as jest.Mock).mockResolvedValue([
      application({ id: 'app-1', provider: { ...pendingApp.provider!, avatar_url: 'https://x/alex.jpg' } }),
    ]);
    await renderScreen();
    expect(screen.getAllByLabelText("Alex Reyes's photo").length).toBeGreaterThan(0);
  });

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

  it('shows a provider counterquote and charges that quote at hire', async () => {
    (api.jobApplications as jest.Mock).mockResolvedValue([
      application({
        id: 'app-1',
        quote_amount: 1250,
        posted_budget: 1000,
        fee: { rate: 0.15, amount: 187.5, provider_receives: 1062.5 },
      }),
    ]);
    await renderScreen();

    expect(await screen.findByText('Total quote: ₱1,250.00')).toBeTruthy();
    expect(screen.getByText('Your posted budget: ₱1,000.00')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Hire Alex Reyes for this job' }));
    fireEvent.press(await screen.findByRole('radio', { name: /₱1,250.00/ }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('₱1,062.50')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hire and pay ₱1,250.00' })).toBeTruthy();
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

  it('a proposal with approved credentials shows the Certified chip, and one without shows none', async () => {
    (api.jobApplications as jest.Mock).mockResolvedValue([
      application({ id: 'app-1', certifications: [{ title: 'NC II Plumbing', issuer: 'TESDA' }] }),
      application({ id: 'app-2', certifications: [] }),
    ]);
    await renderScreen();

    const chip = await screen.findByTestId('certified-app-1');
    expect(within(chip).getByText('Certified')).toBeTruthy();
    expect(screen.queryByTestId('certified-app-2')).toBeNull();
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
});

describe('HOJobApplicationsScreen: the provider profile from a proposal', () => {
  it("View profile shows the provider in place of the proposals, with this job's offer", async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: "View Alex Reyes's profile" }));

    expect(await screen.findByText('Their proposal for Window cleaning')).toBeTruthy();
    expect(screen.getByText('I can come Friday evening.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hire Alex Reyes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hire Alex Reyes for this job' })).toBeNull();
  });

  it('Back to proposals returns to the list', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: "View Alex Reyes's profile" }));
    fireEvent.press(await screen.findByRole('button', { name: 'Back to proposals' }));

    expect(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' })).toBeTruthy();
    expect(screen.queryByText('Their proposal for Window cleaning')).toBeNull();
  });

  it('Android back on the profile returns to the proposals instead of leaving the screen', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    try {
      await renderScreen();
      fireEvent.press(await screen.findByRole('button', { name: "View Alex Reyes's profile" }));
      await screen.findByText('Their proposal for Window cleaning');

      const handler = addListener.mock.calls.filter(([name]) => name === 'hardwareBackPress').pop()?.[1];
      expect(handler).toBeDefined();

      let handled: boolean | null | undefined;
      act(() => {
        handled = handler?.({} as never);
      });

      expect(handled).toBe(true);
      expect(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' })).toBeTruthy();
    } finally {
      addListener.mockRestore();
    }
  });

  it('Hire on the profile opens the same payment sheet for this proposal, and pays only on its confirm page', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: "View Alex Reyes's profile" }));
    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes' }));

    expect(await screen.findByRole('header', { name: 'Hire Alex Reyes' })).toBeTruthy();
    expect(api.getJob).toHaveBeenCalledWith('job-1');

    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(api.createHireCheckoutSession).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));

    await waitFor(() => expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1));
    expect(api.createHireCheckoutSession).toHaveBeenCalledWith({ application_id: 'app-1', app_redirect: 'taskbuddy://hire' });
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });
});

describe('HOJobApplicationsScreen: the hired screen', () => {
  /** Pays online, and the server reports the proposal accepted on the next read. */
  async function hireOnline(onNavigate: jest.Mock) {
    (api.jobApplications as jest.Mock)
      .mockResolvedValueOnce([pendingApp])
      .mockResolvedValue([application({ id: 'app-1', status: 'accepted' })]);
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen(onNavigate);
    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
    await screen.findByRole('header', { name: 'Alex Reyes is hired!' }, { timeout: 5000 });
  }

  it('after an online hire, says who is hired and what is held, and Message opens the chat', async () => {
    const onNavigate = jest.fn();
    await hireOnline(onNavigate);

    expect(await screen.findByRole('header', { name: 'Alex Reyes is hired!' })).toBeTruthy();
    expect(screen.getByText('₱1,000.00 is held safely until the job is done.')).toBeTruthy();
    expect(screen.getByText('You can now chat with them')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Message Alex Reyes' }));
    expect(onNavigate).toHaveBeenCalledWith('Chat', 'job-1');
  });

  it('View job on the hired screen opens the job', async () => {
    const onNavigate = jest.fn();
    await hireOnline(onNavigate);

    fireEvent.press(await screen.findByRole('button', { name: 'View job' }));
    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'job-1');
  });

  it('shows when the provider comes when the job has a set time', async () => {
    mockJob(1000, new Date(2026, 9, 10, 19, 10).toISOString());
    await hireOnline(jest.fn());

    expect(await screen.findByText(/^They come \w{3}, Oct 10 · 7:10\s?PM$/)).toBeTruthy();
  });

  it('a card hire shows the hired screen only once the server has accepted the proposal', async () => {
    (api.jobApplications as jest.Mock)
      .mockResolvedValueOnce([pendingApp])
      .mockResolvedValue([application({ id: 'app-1', status: 'accepted' })]);
    (api.createHireCheckoutSession as jest.Mock).mockResolvedValue({ url: 'https://checkout.example/session' });
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));

    expect(await screen.findByRole('header', { name: 'Alex Reyes is hired!' }, { timeout: 5000 })).toBeTruthy();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(api.createHireCheckoutSession).toHaveBeenCalledWith({
      application_id: 'app-1',
      app_redirect: 'taskbuddy://hire',
    });
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('a card payment the browser cancelled stays on the sheet with the message, and is not hired', async () => {
    (api.createHireCheckoutSession as jest.Mock).mockResolvedValue({ url: 'https://checkout.example/session' });
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=cancelled' });
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));

    expect(await screen.findByText('Payment was cancelled.')).toBeTruthy();
    // Still on the sheet's confirm page, so the payment can be confirmed again or backed out of.
    expect(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' })).toBeTruthy();
    // The screen's own Back arrow is labelled too and stays in the tree behind the sheet, so look for Back inside the open sheet.
    const openSheet = screen.UNSAFE_getAllByType(Modal).find((modal) => modal.props.visible === true);
    expect(within(openSheet!).getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Alex Reyes is hired!' })).toBeNull();
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });
});

describe('HOJobApplicationsScreen: a hire made from the profile', () => {
  it('shows the hired screen, and drops the profile back listener so Android back is not swallowed', async () => {
    const remove = jest.fn();
    const addListener = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
    (api.jobApplications as jest.Mock)
      .mockResolvedValueOnce([pendingApp])
      .mockResolvedValue([application({ id: 'app-1', status: 'accepted' })]);
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    try {
      await renderScreen();
      fireEvent.press(await screen.findByRole('button', { name: "View Alex Reyes's profile" }));
      fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes' }));
      fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
      fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
      fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));

      expect(await screen.findByRole('header', { name: 'Alex Reyes is hired!' }, { timeout: 5000 })).toBeTruthy();
      expect(remove).toHaveBeenCalled();
    } finally {
      addListener.mockRestore();
    }
  });
});

describe('HOJobApplicationsScreen: when the job cannot be loaded', () => {
  async function expectNoHire(message: string) {
    await renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue', disabled: true })).toBeTruthy();
    expect(screen.queryByText(/Nothing is held/)).toBeNull();
    expect(screen.queryByText(/no budget/)).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Continue', disabled: true }));
    expect(screen.queryByRole('button', { name: /Confirm and hire/ })).toBeNull();
    expect(api.acceptApplication).not.toHaveBeenCalled();
    expect(api.createHireCheckoutSession).not.toHaveBeenCalled();
  }

  it('a job that fails to load shows the error, offers no hire, and never claims nothing is held', async () => {
    (api.getJob as jest.Mock).mockRejectedValue(new Error('Could not reach TaskBuddy.'));

    await expectNoHire('Could not reach TaskBuddy.');
  });

  it('a job that loads with a zero budget still hires straight away, with nothing held', async () => {
    mockJob(0);
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    const hire = await waitFor(() => screen.getByRole('button', { name: 'Hire Alex Reyes', disabled: false }));
    fireEvent.press(hire);
    expect(screen.getByText("Nothing is held — they're hired straight away.")).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire' }));

    await waitFor(() => expect(api.acceptApplication).toHaveBeenCalledTimes(1));
    expect(api.acceptApplication).toHaveBeenCalledWith('app-1');
  });
});

describe('HOJobApplicationsScreen: paying for a hire', () => {
  it('Hire opens the payment sheet straight away, with no extra dialog', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    expect(await screen.findByRole('header', { name: 'Hire Alex Reyes' })).toBeTruthy();
    expect(screen.queryByText('Hire this provider?')).toBeNull();
    expect(api.getJob).toHaveBeenCalledWith('job-1');
  });

  it('starts the online payment only on the confirm page, and never accepts the proposal itself', async () => {
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));

    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    expect(api.createHireCheckoutSession).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(api.createHireCheckoutSession).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));

    await waitFor(() => expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1));
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

describe('HOJobApplicationsScreen: a hire cannot be submitted twice', () => {
  const HIRE_BUSY = "We're still processing your payment. Please wait a moment.";

  /** A promise the test settles by hand, so a payment can be seen while it is still running. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  /** Opens the hire sheet for a job with no budget and goes to its confirm page. */
  async function confirmFreeHire() {
    mockJob(null);
    await renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
    fireEvent.press(await waitFor(() => screen.getByRole('button', { name: 'Hire Alex Reyes', disabled: false })));
    return screen.getByRole('button', { name: 'Confirm and hire' });
  }

  /** Opens the hire sheet, picks the online payment and goes to its confirm page. */
  async function confirmCardHire() {
    await renderScreen();
    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    return screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' });
  }

  it('two taps on Confirm and hire inside one act() accept a no-budget hire once, and say the payment is still being processed', async () => {
    const accept = deferred<unknown>();
    (api.acceptApplication as jest.Mock).mockReturnValue(accept.promise);
    const confirm = await confirmFreeHire();

    // Both taps land before React re-renders, so they reach the same handler.
    act(() => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });

    expect(api.acceptApplication).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(HIRE_BUSY, 'info');

    await act(async () => accept.resolve({}));
    expect(await screen.findByRole('header', { name: 'Alex Reyes is hired!' })).toBeTruthy();
    expect(api.acceptApplication).toHaveBeenCalledTimes(1);
  });

  it('two taps on Confirm and hire inside one act() start one card Checkout, and the second says why it was ignored', async () => {
    const browser = deferred<unknown>();
    (openRedirectSession as jest.Mock).mockReturnValue(browser.promise);
    const confirm = await confirmCardHire();

    act(() => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });

    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(HIRE_BUSY, 'info');

    await act(async () => browser.resolve({ type: 'success', url: 'taskbuddy://hire?hire=cancelled' }));
    expect(await screen.findByText('Payment was cancelled.')).toBeTruthy();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('after a no-budget hire fails, the next Confirm and hire tries again', async () => {
    (api.acceptApplication as jest.Mock)
      .mockRejectedValueOnce(new Error('Could not reach TaskBuddy.'))
      .mockResolvedValueOnce({});
    const confirm = await confirmFreeHire();

    fireEvent.press(confirm);
    expect(await screen.findByText('Could not reach TaskBuddy.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire' }));
    expect(await screen.findByRole('header', { name: 'Alex Reyes is hired!' })).toBeTruthy();
    expect(api.acceptApplication).toHaveBeenCalledTimes(2);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('after a card payment the browser cancelled, the next Confirm and hire starts a new payment', async () => {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=cancelled' });
    await confirmCardHire();

    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
    expect(await screen.findByText('Payment was cancelled.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
    await waitFor(() => expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(2));
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('HOJobApplicationsScreen: a card payment the server has not confirmed yet', () => {
  const STILL_CONFIRMING = "We're still confirming your payment. If you already paid, please don't pay again.";
  const PAID_STILL_PENDING = 'Payment received. Your hire is still being confirmed — check back in a moment.';
  const NOT_CONFIRMED = 'No payment was confirmed. If you did pay, your hire will appear shortly.';
  const NO_LONGER_AVAILABLE =
    'The hire could not be completed — this proposal is no longer available. Your payment is being refunded to your payment method.';
  /** The server is asked 8 times, 1.5 s apart, before a wait gives up (HIRE_POLL_ATTEMPTS × HIRE_POLL_INTERVAL_MS). */
  const FULL_WAIT_MS = 8 * 1500;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Hires Alex Reyes with the card from the proposals list, and presses Confirm and hire. */
  async function payByCard() {
    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
  }

  async function passTime(ms: number) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  }

  it('a payment the webhook has not confirmed keeps the proposal waiting: no pay button, and no tap starts a second checkout', async () => {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);

    expect(await screen.findByText(STILL_CONFIRMING)).toBeTruthy();
    expect(screen.getByText(PAID_STILL_PENDING)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a new payment' })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirm and hire/ })).toBeNull();

    // Closing the sheet and opening it again from the list keeps the wait.
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
    expect(await screen.findByText(STILL_CONFIRMING)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();

    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('Check payment status: once the server confirms the hire, the hired screen shows, with no new checkout', async () => {
    let proposal: JobApplication[] = [pendingApp];
    (api.jobApplications as jest.Mock).mockImplementation(async () => proposal);
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);
    await screen.findByText(STILL_CONFIRMING);

    proposal = [application({ id: 'app-1', status: 'accepted' })];
    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    await passTime(1500);

    expect(await screen.findByRole('header', { name: 'Alex Reyes is hired!' })).toBeTruthy();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('Check payment status: still unconfirmed keeps the wait, and says the same as before', async () => {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);
    await screen.findByText(STILL_CONFIRMING);

    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    await passTime(FULL_WAIT_MS);

    expect(await screen.findByText(PAID_STILL_PENDING)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Alex Reyes is hired!' })).toBeNull();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('a browser closed before Xendit finished also waits for the server, and says no payment was confirmed yet', async () => {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'cancel' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);

    expect(await screen.findByText(NOT_CONFIRMED)).toBeTruthy();
    expect(screen.getByText(STILL_CONFIRMING)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('a payment cancelled on Xendit is not waiting: the pay buttons stay, and nothing is polled', async () => {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=cancelled' });
    await renderScreen();
    await payByCard();

    expect(await screen.findByText('Payment was cancelled.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check payment status' })).toBeNull();
    expect(screen.queryByText(STILL_CONFIRMING)).toBeNull();
    expect(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' })).toBeTruthy();
    expect(api.jobApplications).toHaveBeenCalledTimes(1);
  });

  it('a network error while the server is asked keeps the payment waiting, so Confirm and hire stays hidden', async () => {
    let reads = 0;
    (api.jobApplications as jest.Mock).mockImplementation(async () => {
      reads += 1;
      if (reads === 1) return [pendingApp];
      throw new Error('Could not reach TaskBuddy.');
    });
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(1500);

    expect(await screen.findByText('Could not reach TaskBuddy.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Confirm and hire/ })).toBeNull();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('a check that finds the proposal no longer available ends the wait, with the existing wording', async () => {
    let proposal: JobApplication[] = [pendingApp];
    (api.jobApplications as jest.Mock).mockImplementation(async () => proposal);
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);
    await screen.findByText(STILL_CONFIRMING);

    proposal = [application({ id: 'app-1', status: 'withdrawn' })];
    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    await passTime(1500);

    expect(await screen.findByText(NO_LONGER_AVAILABLE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check payment status' })).toBeNull();
    expect(screen.queryByText(STILL_CONFIRMING)).toBeNull();
  });

  it('Start a new payment asks first: Keep waiting leaves the wait, and Yes, start over brings the pay buttons back', async () => {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);
    await screen.findByText(STILL_CONFIRMING);

    fireEvent.press(screen.getByRole('button', { name: 'Start a new payment' }));
    expect(await screen.findByText('Start a new payment?')).toBeTruthy();
    expect(
      screen.getByText('Only do this if you did not complete the payment. If you already paid, wait a moment and check the status instead.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Keep waiting' }));
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole('button', { name: 'Start a new payment' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, start over' }));

    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
    await passTime(FULL_WAIT_MS);

    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(2);
  });

  it('while one payment waits, the other open proposals cannot be hired, and the list says why', async () => {
    const blair = application({
      id: 'app-2',
      provider: {
        id: 'prov-app-2',
        full_name: 'Blair Santos',
        avatar_url: null,
        city: 'Cebu',
        provider_profiles: { is_verified: true, cached_avg_rating: 5, cached_completed_jobs: 9 },
      },
    });
    (api.jobApplications as jest.Mock).mockResolvedValue([pendingApp, blair]);
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);
    await screen.findByText(STILL_CONFIRMING);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByRole('button', { name: 'Hire Blair Santos for this job', disabled: true })).toBeTruthy();
    expect(screen.getByText("Hiring pauses until Alex Reyes's payment is confirmed.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hire Alex Reyes for this job', disabled: false })).toBeTruthy();
    expect(screen.getByText("We're still confirming your payment. Tap Hire to check on it.")).toBeTruthy();
  });

  it("while one payment waits, another proposal's profile offers no hire", async () => {
    const blair = application({
      id: 'app-2',
      provider: {
        id: 'prov-app-2',
        full_name: 'Blair Santos',
        avatar_url: null,
        city: 'Cebu',
        provider_profiles: { is_verified: true, cached_avg_rating: 5, cached_completed_jobs: 9 },
      },
    });
    (api.jobApplications as jest.Mock).mockResolvedValue([pendingApp, blair]);
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    await renderScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);
    await screen.findByText(STILL_CONFIRMING);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    fireEvent.press(await screen.findByRole('button', { name: "View Blair Santos's profile" }));

    await waitFor(() => expect(screen.queryByRole('button', { name: "View Blair Santos's profile" })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Hire Blair Santos' })).toBeNull();
  });
});

describe('HOJobApplicationsScreen: a card payment waits across leaving the screen and restarts', () => {
  const STILL_CONFIRMING = "We're still confirming your payment. If you already paid, please don't pay again.";
  const PAID_STILL_PENDING = 'Payment received. Your hire is still being confirmed — check back in a moment.';
  const WAITING_NOTE = "We're still confirming your payment. Tap Hire to check on it.";
  const HIRE_ALEX = 'Hire Alex Reyes for this job';
  const FULL_WAIT_MS = 8 * 1500;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Mounts the screen as a new tree, the way the app shows it again after leaving it. */
  async function mountScreen() {
    const view = render(<HOJobApplicationsScreen jobId="job-1" onBack={jest.fn()} onNavigate={jest.fn()} />);
    await act(async () => {});
    return view;
  }

  async function passTime(ms: number) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  }

  /** Hires Alex Reyes by card from the proposals list, and presses Confirm and hire. */
  async function payByCard() {
    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));
    fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
  }

  /** A card payment the browser reports as paid, then the wait the server has not decided yet. */
  async function startWaitingCardPayment() {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=success' });
    const view = await mountScreen();
    await payByCard();
    await passTime(FULL_WAIT_MS);
    expect(await screen.findByText(STILL_CONFIRMING)).toBeTruthy();
    return view;
  }

  it('leaving the screen and coming back keeps the wait: the pay options stay hidden, and no second checkout starts', async () => {
    const view = await startWaitingCardPayment();
    view.unmount();

    await mountScreen();
    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));

    expect(await screen.findByText(STILL_CONFIRMING)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('after an app restart the wait is read from the device, keeps what the browser reported, and still offers no pay option', async () => {
    const view = await startWaitingCardPayment();
    expect(await storedWaits()).toEqual({ 'app-1': { returnedPaid: true, startedAt: expect.any(Number) } });
    view.unmount();
    // A restart: this session's memory is gone, but the device still holds the wait.
    await resetPendingHirePaymentsForTests();

    await mountScreen();
    expect(await screen.findByText(WAITING_NOTE)).toBeTruthy();
    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));
    expect(await screen.findByText(STILL_CONFIRMING)).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    await passTime(FULL_WAIT_MS);

    expect(await screen.findByText(PAID_STILL_PENDING)).toBeTruthy();
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it('the wait is on the device before the payment page opens', async () => {
    let onDeviceWhenPageOpened: unknown = 'page not opened';
    (openRedirectSession as jest.Mock).mockImplementation(async () => {
      onDeviceWhenPageOpened = await storedWaits();
      return { type: 'cancel' };
    });
    await mountScreen();
    await payByCard();

    await waitFor(() => expect(onDeviceWhenPageOpened).not.toBe('page not opened'));
    expect(onDeviceWhenPageOpened).toEqual({ 'app-1': { returnedPaid: false, startedAt: expect.any(Number) } });
  });

  it('a payment the browser reports as cancelled is not remembered', async () => {
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'success', url: 'taskbuddy://hire?hire=cancelled' });
    await mountScreen();
    await payByCard();

    expect(await screen.findByText('Payment was cancelled.')).toBeTruthy();
    expect(await storedWaits()).toEqual({});
  });

  it('starting a new payment forgets the device copy too, so after a restart the pay options come back', async () => {
    const view = await startWaitingCardPayment();
    fireEvent.press(screen.getByRole('button', { name: 'Start a new payment' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, start over' }));
    await waitFor(async () => expect(await storedWaits()).toEqual({}));

    view.unmount();
    await resetPendingHirePaymentsForTests();
    await mountScreen();
    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));

    expect(await screen.findByRole('radio', { name: ONLINE })).toBeTruthy();
    expect(screen.queryByText(STILL_CONFIRMING)).toBeNull();
  });

  it('while the payment waits, Decline is disabled with its note, and it is available again once the person starts over', async () => {
    const DECLINE = 'Decline Alex Reyes';
    const WAITING_FOR_PROPOSAL = "We're still confirming your payment for this proposal.";
    await startWaitingCardPayment();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByText(WAITING_FOR_PROPOSAL)).toBeTruthy();
    expect(screen.getByRole('button', { name: DECLINE, disabled: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: DECLINE, disabled: true }));
    expect(screen.queryByText('Reject this proposal?')).toBeNull();

    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));
    fireEvent.press(screen.getByRole('button', { name: 'Start a new payment' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Yes, start over' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('button', { name: DECLINE, disabled: false })).toBeTruthy();
    expect(screen.queryByText(WAITING_FOR_PROPOSAL)).toBeNull();
    expect(api.rejectApplication).not.toHaveBeenCalled();
  });

  it('a wait open on this screen for 24 hours is over at the next Check payment status, here and on the device', async () => {
    await startWaitingCardPayment();
    // A minute short of 24 hours since the checkout started, the check still keeps the wait.
    await passTime(PENDING_HIRE_PAYMENT_TTL_MS - 60_000 - FULL_WAIT_MS);
    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    await passTime(FULL_WAIT_MS);
    expect(screen.getByText(STILL_CONFIRMING)).toBeTruthy();

    await passTime(60_001);
    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));

    expect(await screen.findByText('This payment was not confirmed within 24 hours, so it is no longer waiting.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' })).toBeTruthy();
    expect(screen.queryByText(STILL_CONFIRMING)).toBeNull();
    await waitFor(async () => expect(await storedWaits()).toEqual({}));
    expect(api.createHireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(api.acceptApplication).not.toHaveBeenCalled();
  });

  it("a wait open on this screen for 24 hours is cleared when the screen's proposals reload", async () => {
    const blair = application({
      id: 'app-2',
      provider: {
        id: 'prov-app-2',
        full_name: 'Blair Santos',
        avatar_url: null,
        city: 'Cebu',
        provider_profiles: { is_verified: true, cached_avg_rating: 5, cached_completed_jobs: 9 },
      },
    });
    // A new list each time, as the server gives one, so a reload is a change the screen can see.
    (api.jobApplications as jest.Mock).mockImplementation(async () => [pendingApp, blair]);
    await startWaitingCardPayment();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await passTime(PENDING_HIRE_PAYMENT_TTL_MS);

    // Declining the other proposal reloads this screen's proposals, with no payment check.
    fireEvent.press(await screen.findByRole('button', { name: 'Decline Blair Santos', disabled: false }));
    fireEvent.press(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(api.rejectApplication).toHaveBeenCalledWith('app-2'));
    expect(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false })).toBeTruthy();
    expect(screen.queryByText(WAITING_NOTE)).toBeNull();
    await waitFor(async () => expect(await storedWaits()).toEqual({}));
  });
});

describe('HOJobApplicationsScreen: a proposal whose card payment is waiting cannot be declined', () => {
  const DECLINE_ALEX = 'Decline Alex Reyes';
  const WAITING_FOR_PROPOSAL = "We're still confirming your payment for this proposal.";

  it('a remembered wait keeps Decline disabled on its proposal, with the reason beside it, and a tap opens no dialog', async () => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-1': { returnedPaid: true, startedAt: Date.now() } }),
    );
    await renderScreen();

    expect(await screen.findByText(WAITING_FOR_PROPOSAL)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: DECLINE_ALEX, disabled: true }));

    expect(screen.queryByText('Reject this proposal?')).toBeNull();
    expect(api.rejectApplication).not.toHaveBeenCalled();
  });

  it('the other proposals on the job can still be declined while one payment waits', async () => {
    const blair = application({
      id: 'app-2',
      provider: {
        id: 'prov-app-2',
        full_name: 'Blair Santos',
        avatar_url: null,
        city: 'Cebu',
        provider_profiles: { is_verified: true, cached_avg_rating: 5, cached_completed_jobs: 9 },
      },
    });
    (api.jobApplications as jest.Mock).mockResolvedValue([pendingApp, blair]);
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-1': { returnedPaid: false, startedAt: Date.now() } }),
    );
    await renderScreen();

    expect(await screen.findByText(WAITING_FOR_PROPOSAL)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Decline Blair Santos', disabled: false }));

    expect(screen.getByText('Reject this proposal?')).toBeTruthy();
    expect(api.rejectApplication).not.toHaveBeenCalled();
  });

  it('Decline is held until the remembered waits have been read, as Hire is', async () => {
    let finishRead: (value: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          finishRead = resolve;
        }),
    );
    await renderScreen();

    expect(await screen.findByRole('button', { name: DECLINE_ALEX, disabled: true })).toBeTruthy();

    await act(async () => finishRead(null));

    expect(await screen.findByRole('button', { name: DECLINE_ALEX, disabled: false })).toBeTruthy();
  });
});

describe('HOJobApplicationsScreen: what a remembered wait is checked against when the proposals load', () => {
  const WAITING_NOTE = "We're still confirming your payment. Tap Hire to check on it.";
  const STILL_CONFIRMING = "We're still confirming your payment. If you already paid, please don't pay again.";
  const HIRE_ALEX = 'Hire Alex Reyes for this job';

  it.each([
    ['accepted', 'Provider hired · Follow the job from Job Details'],
    ['rejected', 'NOT SELECTED (1)'],
    ['withdrawn', 'NOT SELECTED (1)'],
  ] as const)('a wait whose proposal is now %s is forgotten on load, and no wait is shown', async (status, shown) => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-1': { returnedPaid: true, startedAt: Date.now() } }),
    );
    (api.jobApplications as jest.Mock).mockResolvedValue([application({ id: 'app-1', status })]);

    await renderScreen();

    expect(await screen.findByText(shown)).toBeTruthy();
    expect(screen.queryByText(WAITING_NOTE)).toBeNull();
    await waitFor(async () => expect(await storedWaits()).toEqual({}));
  });

  it('a remembered wait older than 24 hours is ignored: Hire offers the pay options, and the old entry is removed', async () => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-1': { returnedPaid: false, startedAt: Date.now() - PENDING_HIRE_PAYMENT_TTL_MS - 1 } }),
    );
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));

    expect(await screen.findByRole('radio', { name: ONLINE })).toBeTruthy();
    expect(screen.queryByText(STILL_CONFIRMING)).toBeNull();
    await waitFor(async () => expect(await storedWaits()).toEqual({}));
  });

  it("a wait on a proposal that is not on this job is not this screen's, does not block Hire, and stays on the device", async () => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-9': { returnedPaid: true, startedAt: Date.now() } }),
    );
    await renderScreen();

    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));

    expect(await screen.findByRole('radio', { name: ONLINE })).toBeTruthy();
    expect(screen.queryByText(STILL_CONFIRMING)).toBeNull();
    expect(await storedWaits()).toEqual({ 'app-9': { returnedPaid: true, startedAt: expect.any(Number) } });
  });

  it('Hire stays disabled until the remembered waits have been read', async () => {
    let finishRead: (value: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          finishRead = resolve;
        }),
    );

    await renderScreen();
    expect(await screen.findByRole('button', { name: HIRE_ALEX, disabled: true })).toBeTruthy();

    await act(async () => finishRead(null));

    expect(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false })).toBeTruthy();
  });
});

describe('HOJobApplicationsScreen: switching to another job while the screen stays open', () => {
  const WAITING_NOTE = "We're still confirming your payment. Tap Hire to check on it.";
  const STILL_CONFIRMING = "We're still confirming your payment. If you already paid, please don't pay again.";
  const HIRE_ALEX = 'Hire Alex Reyes for this job';
  const DECLINE_ALEX = 'Decline Alex Reyes';
  const HIRE_BLAIR = 'Hire Blair Santos for this job';
  const DECLINE_BLAIR = 'Decline Blair Santos';
  const blair = application({
    id: 'app-2',
    job_id: 'job-2',
    provider: {
      id: 'prov-app-2',
      full_name: 'Blair Santos',
      avatar_url: null,
      city: 'Cebu',
      provider_profiles: { is_verified: true, cached_avg_rating: 5, cached_completed_jobs: 9 },
    },
  });

  beforeEach(() => {
    (api.jobApplications as jest.Mock).mockImplementation(async (jobId: string) =>
      jobId === 'job-2' ? [blair] : [pendingApp],
    );
  });

  function showJob(jobId: string) {
    return <HOJobApplicationsScreen jobId={jobId} onBack={jest.fn()} onNavigate={jest.fn()} />;
  }

  it("a wait remembered for the new job holds its proposal, and coming back to the first job restores its actions", async () => {
    await AsyncStorage.setItem(
      PENDING_HIRE_PAYMENTS_KEY,
      JSON.stringify({ 'app-2': { returnedPaid: false, startedAt: Date.now() } }),
    );
    const view = render(showJob('job-1'));
    await act(async () => {});
    expect(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false })).toBeTruthy();

    // App.tsx switches the job on the same mounted screen, as a proposal notification for another job does.
    view.rerender(showJob('job-2'));
    await act(async () => {});

    expect(await screen.findByText(WAITING_NOTE)).toBeTruthy();
    expect(screen.getByRole('button', { name: DECLINE_BLAIR, disabled: true })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: HIRE_BLAIR, disabled: false }));
    expect(await screen.findByText(STILL_CONFIRMING)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(api.createHireCheckoutSession).not.toHaveBeenCalled();
    expect(api.acceptApplication).not.toHaveBeenCalled();

    view.rerender(showJob('job-1'));
    await act(async () => {});

    expect(await screen.findByRole('button', { name: DECLINE_ALEX, disabled: false })).toBeTruthy();
    fireEvent.press(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false }));
    expect(await screen.findByRole('radio', { name: ONLINE })).toBeTruthy();
    expect(screen.queryByText(STILL_CONFIRMING)).toBeNull();
  });

  it("while the new job's proposals load, the previous job's proposals are not offered", async () => {
    let finishLoad: (apps: JobApplication[]) => void = () => undefined;
    (api.jobApplications as jest.Mock).mockImplementation(async (jobId: string) =>
      jobId === 'job-2'
        ? new Promise<JobApplication[]>((resolve) => {
            finishLoad = resolve;
          })
        : [pendingApp],
    );
    const view = render(showJob('job-1'));
    await act(async () => {});
    expect(await screen.findByRole('button', { name: HIRE_ALEX, disabled: false })).toBeTruthy();

    view.rerender(showJob('job-2'));
    await act(async () => {});

    expect(screen.queryByRole('button', { name: HIRE_ALEX })).toBeNull();
    expect(screen.queryByRole('button', { name: DECLINE_ALEX })).toBeNull();
    await act(async () => finishLoad([blair]));
    expect(await screen.findByRole('button', { name: HIRE_BLAIR, disabled: false })).toBeTruthy();
  });
});

describe('HOJobApplicationsScreen: no proposals yet', () => {
  it('says so inside the card, with the one-line explanation', async () => {
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
    await renderScreen();

    expect(await screen.findByText('No applications yet')).toBeTruthy();
    const card = screen.getByTestId('empty-card');
    expect(within(card).getByText('No applications yet')).toBeTruthy();
    expect(within(card).getByText('No providers have applied to this job yet.')).toBeTruthy();
  });
});

describe('HOJobApplicationsScreen: when the proposals cannot be loaded', () => {
  it('shows the error with Try again, and Try again loads the proposals', async () => {
    (api.jobApplications as jest.Mock)
      .mockRejectedValueOnce(new Error('Could not reach TaskBuddy.'))
      .mockResolvedValue([pendingApp]);
    await renderScreen();

    expect(await screen.findByText('Could not reach TaskBuddy.')).toBeTruthy();
    expect(within(screen.getByTestId('error-card')).getByText("Couldn't load the proposals")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' })).toBeTruthy();
    expect(screen.queryByText('Could not reach TaskBuddy.')).toBeNull();
    expect(api.jobApplications).toHaveBeenCalledTimes(2);
  });
});

it('every control has an accessible name: back, the proposal card and its actions', async () => {
  mockJob(1500);
  (api.jobApplications as jest.Mock).mockResolvedValue([pendingApp]);
  await renderScreen();

  expect(await screen.findByText('Alex Reyes')).toBeTruthy();
  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});

it('pulling the list down reloads the proposals', async () => {
  await renderScreen();
  expect(await screen.findByText('Alex Reyes')).toBeTruthy();
  const before = (api.jobApplications as jest.Mock).mock.calls.length;

  act(() => {
    screen.getByTestId('applications-scroll').props.refreshControl.props.onRefresh();
  });

  await waitFor(() => expect((api.jobApplications as jest.Mock).mock.calls.length).toBeGreaterThan(before));
});

it('a hire the server refuses with a 409 at the provider limit opens a capacity dialog with its message', async () => {
  (api.createHireCheckoutSession as jest.Mock).mockRejectedValue(
    Object.assign(new Error('This provider already has 3 active jobs'), { status: 409 }),
  );
  await renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
  fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
  });

  expect(await screen.findByText('This provider is unavailable')).toBeTruthy();
  expect(screen.getByText('This provider already has 3 active jobs')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(screen.queryByText('This provider is unavailable')).toBeNull());
});

it('a hire refused with 409 provider_not_certified opens the one-button dialog with the plain message', async () => {
  (api.createHireCheckoutSession as jest.Mock).mockRejectedValue(
    Object.assign(new Error('This provider has no valid certificate for Cleaning and cannot be hired for this job'), { status: 409, code: 'provider_not_certified' }),
  );
  await renderScreen();
  fireEvent.press(await screen.findByRole('button', { name: 'Hire Alex Reyes for this job' }));
  fireEvent.press(await screen.findByRole('radio', { name: ONLINE }));
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Hire and pay ₱1,000.00' }));
  });

  expect(await screen.findByText("This provider can't be hired for this service yet.")).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(screen.queryByText("This provider can't be hired for this service yet.")).toBeNull());
});
