import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import HOHomeScreen from '../HOHomeScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { lightPalette } from '../../../../src/constants/palettes';
import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: jest.fn() }),
}));

jest.mock('../../../../src/lib/api', () => ({
  api: {
    wallet: jest.fn(),
    myJobs: jest.fn(),
    categories: jest.fn(),
    notifications: jest.fn(),
    unreadNotificationCount: jest.fn(),
    jobApplications: jest.fn(),
  },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('HOHomeScreen — empty state does not flash while jobs are still loading (QA #11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: 'Alex', city: null, address: null } });
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 0, available: 0, held: 0 });
    (api.categories as jest.Mock).mockResolvedValue([]);
    (api.notifications as jest.Mock).mockResolvedValue([]);
    (api.unreadNotificationCount as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it('does not show "No active jobs" while only the jobs request is still pending', async () => {
    // Never resolves during this test — jobs.loading stays true while the
    // other three requests above resolve, so the whole-screen skeleton
    // (which requires ALL four loading) is no longer showing.
    (api.myJobs as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<HOHomeScreen onNavigate={jest.fn()} />);

    // Wait for the other three requests to settle and the main content to render.
    await waitFor(() => expect(screen.getByText('Alex')).toBeTruthy());

    expect(screen.queryByText('No active jobs')).toBeNull();
  });

  it('shows "No active jobs" once jobs have actually loaded with none active', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([]);

    render(<HOHomeScreen onNavigate={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('No active jobs')).toBeTruthy());
  });
});

// A long name used to widen the text column until the bell + avatar were pushed
// off the right edge — the avatar is the only route to Profile (and Log out).
describe('HOHomeScreen — hero header keeps the avatar reachable with a long name', () => {
  const LONG_NAME = 'MYRE LECTOR ANDRE MORADA DELA CRUZ SANTIAGO VILLANUEVA';

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: LONG_NAME, city: null, address: null } });
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 0, available: 0, held: 0 });
    (api.myJobs as jest.Mock).mockResolvedValue([]);
    (api.categories as jest.Mock).mockResolvedValue([]);
    (api.notifications as jest.Mock).mockResolvedValue([]);
    (api.unreadNotificationCount as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it('still navigates to Profile from the avatar', async () => {
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByTestId('btn-home-avatar'));

    expect(onNavigate).toHaveBeenCalledWith('Profile');
  });

  it('lets the name column shrink and truncate instead of pushing the actions out', async () => {
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const column = StyleSheet.flatten((await screen.findByTestId('hero-text')).props.style);
    expect(column.flex).toBe(1);
    expect(column.flexShrink).toBe(1);
    expect(column.minWidth).toBe(0);
    expect(screen.getByText(LONG_NAME).props.numberOfLines).toBe(2);
  });

  // At 1.3x text the greeting stays on one line and the name may wrap to two
  // lines before it is cut with an ellipsis, so the header never grows a third line.
  it('keeps the greeting on one line and lets the name wrap to two, with an ellipsis, at large text', async () => {
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const greeting = await screen.findByText(/^Good (morning|afternoon|evening)$/);
    expect(greeting.props.numberOfLines).toBe(1);
    expect(greeting.props.ellipsizeMode).toBe('tail');
    const name = screen.getByText(LONG_NAME);
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
    expect(name.props.maxFontSizeMultiplier).toBe(1.3);
    expect(name.props.adjustsFontSizeToFit).toBeFalsy();
  });

  it('wraps "Maria Cristina Dela Cruz-Santos" to two lines before it is cut', async () => {
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: 'Maria Cristina Dela Cruz-Santos', city: null, address: null } });
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const name = await screen.findByText('Maria Cristina Dela Cruz-Santos');
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
  });

  it('wraps a 40-character name to two lines before it is cut', async () => {
    const fortyChars = 'Ana Beatriz Ramos Villanueva de los Pena';
    expect(fortyChars).toHaveLength(40);
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: fortyChars, city: null, address: null } });
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const name = await screen.findByText(fortyChars);
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
  });

  it('caps the wallet amount at 1.2x text, so the wallet chip keeps its size', async () => {
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const amount = await screen.findByText('₱0.00');
    expect(amount.props.maxFontSizeMultiplier).toBe(1.2);
    expect(amount.props.numberOfLines).toBe(1);
  });

  it('never lets the action buttons shrink away', async () => {
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const actions = StyleSheet.flatten((await screen.findByTestId('hero-actions')).props.style);
    expect(actions.flexShrink).toBe(0);
  });

  it('falls back to "there" when the profile has no name', async () => {
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: '', city: null, address: null } });
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('there')).toBeTruthy();
  });
});

// The hero card names the one thing that needs the homeowner: proposals on an
// open job first, otherwise the next booking. Dates are far in the future so
// these tests do not depend on the day they run.
function pendingApplication(id: string, name: string) {
  return {
    id,
    job_id: 'job-open',
    provider_id: `provider-${id}`,
    status: 'pending',
    source: 'organic',
    cover_message: null,
    applied_at: '2027-05-07T09:00:00+08:00',
    decided_at: null,
    provider: { id: `provider-${id}`, full_name: name, avatar_url: null, city: null, provider_profiles: null },
  };
}

const OPEN_JOB = {
  id: 'job-open',
  title: 'Cleaning: Window cleaning',
  status: 'open',
  urgency: 'normal',
  address: 'Makati',
  budget: 1200,
  posted_at: '2027-05-06T09:00:00+08:00',
  created_at: '2027-05-06T09:00:00+08:00',
  scheduled_at: null,
  assigned_provider: null,
};

describe('HOHomeScreen — hero card shows the one job that needs you', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: 'Alex', city: null, address: null } });
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 0, available: 0, held: 0 });
    (api.categories as jest.Mock).mockResolvedValue([]);
    (api.notifications as jest.Mock).mockResolvedValue([]);
    (api.unreadNotificationCount as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it("shows the proposals waiting on an open job and opens that job's proposals", async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([OPEN_JOB]);
    (api.jobApplications as jest.Mock).mockResolvedValue([
      pendingApplication('a', 'Ana Reyes'),
      pendingApplication('b', 'Ben Cruz'),
    ]);
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    expect(await screen.findByText('2 proposals waiting')).toBeTruthy();
    expect(screen.getByText('2 applied')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Review proposals for Cleaning: Window cleaning'));
    expect(onNavigate).toHaveBeenCalledWith('Job Applications', 'job-open');
  });

  it('counts only pending applicants in "N applied", so it always matches the proposals waiting', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([OPEN_JOB]);
    (api.jobApplications as jest.Mock).mockResolvedValue([
      pendingApplication('a', 'Ana Reyes'),
      pendingApplication('b', 'Ben Cruz'),
      { ...pendingApplication('c', 'Cy Diaz'), status: 'rejected' },
      { ...pendingApplication('d', 'Dee Gomez'), status: 'withdrawn' },
    ]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('2 proposals waiting')).toBeTruthy();
    expect(screen.getByText('2 applied')).toBeTruthy();
  });

  it('keeps the sky-blue hero while proposals need a decision, with a 20 point title', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([OPEN_JOB]);
    (api.jobApplications as jest.Mock).mockResolvedValue([pendingApplication('a', 'Ana Reyes')]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const hero = await screen.findByTestId('home-hero-proposals');
    expect(StyleSheet.flatten(hero.props.style).backgroundColor).toBe(lightPalette.Colors.hero);
    const title = screen.getByText('1 proposal waiting');
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(20);
    expect(title.props.numberOfLines).toBe(2);
  });

  it('shows the next booking when no open job has proposals', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([
      {
        ...OPEN_JOB,
        id: 'job-booked',
        title: 'Plumbing: Fix toilet',
        status: 'confirmed',
        scheduled_at: '2027-06-01T09:00:00+08:00',
        assigned_provider: { full_name: 'Juan Dela Cruz' },
      },
    ]);
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    expect(await screen.findByText('Next booking')).toBeTruthy();
    expect(screen.getByText(/Juan Dela Cruz$/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('View Plumbing: Fix toilet'));
    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'job-booked');
  });

  it('shows the next booking in the same sky-blue hero, with a white View button', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([
      {
        ...OPEN_JOB,
        id: 'job-booked',
        title: 'Plumbing: Fix toilet',
        status: 'confirmed',
        scheduled_at: '2027-06-01T09:00:00+08:00',
        assigned_provider: { full_name: 'Juan Dela Cruz' },
      },
    ]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const hero = await screen.findByTestId('home-hero-booking');
    expect(StyleSheet.flatten(hero.props.style).backgroundColor).toBe(lightPalette.Colors.hero);
    expect(StyleSheet.flatten(screen.getByText('Next booking').props.style).color).toBe(lightPalette.Colors.onHeroMuted);
    const title = within(hero).getByText('Plumbing: Fix toilet');
    expect(StyleSheet.flatten(title.props.style).color).toBe(lightPalette.Colors.onPrimary);
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(20);
    expect(title.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(screen.getByLabelText('View Plumbing: Fix toilet').props.style).backgroundColor).toBe(
      lightPalette.Colors.onPrimary,
    );
    expect(StyleSheet.flatten(screen.getByText('View').props.style).color).toBe(lightPalette.Colors.primary);
  });

  it('still renders Home without the hero when the proposal lookup fails', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([OPEN_JOB]);
    (api.jobApplications as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Book a service')).toBeTruthy();
    await waitFor(() => expect(api.jobApplications).toHaveBeenCalledWith('job-open'));
    expect(screen.queryByText(/proposals? waiting/)).toBeNull();
    expect(screen.queryByText('Next booking')).toBeNull();
  });
});

describe('HOHomeScreen — field, service chips, active jobs and wallet chip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: 'Alex', city: null, address: null } });
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 8397, available: 8397, held: 0 });
    (api.categories as jest.Mock).mockResolvedValue([{ id: 2, name: 'Cleaning' }]);
    (api.notifications as jest.Mock).mockResolvedValue([]);
    (api.unreadNotificationCount as jest.Mock).mockResolvedValue({ count: 0 });
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
  });

  it('opens the job form with no category from "What do you need done?"', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([]);
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByLabelText('What do you need done?'));
    expect(onNavigate).toHaveBeenCalledWith('Create Job');
  });

  it('opens the job form with that category picked from a service chip', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([]);
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByLabelText('Book Cleaning'));
    expect(onNavigate).toHaveBeenCalledWith('Create Job', '2');
  });

  it('lists active jobs with their status and amount, and opens the job', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([
      { ...OPEN_JOB, id: 'job-booked', title: 'Plumbing: Fix toilet', status: 'confirmed', budget: 1200, scheduled_at: '2020-01-05T09:00:00+08:00' },
      { ...OPEN_JOB, id: 'job-progress', title: 'Handyman: Hang shelf', status: 'in_progress', budget: null, scheduled_at: null },
    ]);
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    expect(await screen.findByText('Plumbing: Fix toilet')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('₱1,200.00')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-job-job-booked'));
    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'job-booked');
  });

  it('says an open job with no proposals is waiting for offers', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([OPEN_JOB]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Open · waiting for offers')).toBeTruthy();
  });

  it('shows the wallet balance in the header and opens Wallet from the chip', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([]);
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    expect(await screen.findByText('₱8,397.00')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-wallet'));
    expect(onNavigate).toHaveBeenCalledWith('Wallet');
  });

  it('every control has an accessible name: bell, avatar, wallet chip, field, service chips and job rows', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([
      { ...OPEN_JOB, id: 'job-booked', title: 'Plumbing: Fix toilet', status: 'confirmed', budget: 1200, scheduled_at: '2020-01-05T09:00:00+08:00' },
    ]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    await screen.findByTestId('home-job-job-booked');
    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });

  it('shows a short amount in the wallet chip from ₱100,000, and keeps the full amount for the label', async () => {
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 1248397, available: 1248397, held: 0 });
    (api.myJobs as jest.Mock).mockResolvedValue([]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const chip = await screen.findByTestId('home-wallet');
    expect(within(chip).getByText('₱1.25M')).toBeTruthy();
    expect(within(chip).queryByText('₱1,248,397.00')).toBeNull();
    expect(screen.getByLabelText(/₱1,248,397\.00/)).toBeTruthy();
  });
});

// The Active jobs count covers every active job, so the list shows every one of
// them: the count and the rows must always agree.
describe('HOHomeScreen — active jobs list shows every active job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: 'Alex', city: null, address: null } });
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 0, available: 0, held: 0 });
    (api.categories as jest.Mock).mockResolvedValue([]);
    (api.notifications as jest.Mock).mockResolvedValue([]);
    (api.unreadNotificationCount as jest.Mock).mockResolvedValue({ count: 0 });
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
  });

  it('lists all four active jobs, not three, and the count matches the rows', async () => {
    const jobs = [1, 2, 3, 4].map((n) => ({
      ...OPEN_JOB,
      id: `job-${n}`,
      title: `Cleaning: Job ${n}`,
      posted_at: `2027-05-0${n}T09:00:00+08:00`,
      created_at: `2027-05-0${n}T09:00:00+08:00`,
    }));
    (api.myJobs as jest.Mock).mockResolvedValue(jobs);
    const onNavigate = jest.fn();
    render(<HOHomeScreen onNavigate={onNavigate} />);

    await screen.findByTestId('home-job-job-1');
    expect(screen.getByText('4')).toBeTruthy();
    for (const job of jobs) {
      expect(screen.getByTestId(`home-job-${job.id}`)).toBeTruthy();
    }
    fireEvent.press(screen.getByTestId('home-job-job-4'));
    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'job-4');
  });
});

// While a hero may still appear, a placeholder holds its place so the page does
// not move when the card arrives. It is absent when no job can make a hero, and
// when the jobs request failed.
describe('HOHomeScreen — hero placeholder holds the hero place while it may still appear', () => {
  // The placeholder is hidden from screen readers, and RNTL's queries skip hidden
  // elements by default. These queries ask for them, so "absent" really means absent.
  const HIDDEN_OK = { includeHiddenElements: true };

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({ profile: { full_name: 'Alex', city: null, address: null } });
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 0, available: 0, held: 0 });
    (api.categories as jest.Mock).mockResolvedValue([]);
    (api.notifications as jest.Mock).mockResolvedValue([]);
    (api.unreadNotificationCount as jest.Mock).mockResolvedValue({ count: 0 });
    (api.jobApplications as jest.Mock).mockResolvedValue([]);
  });

  it('shows the placeholder while the jobs load for the first time, hidden from screen readers', async () => {
    (api.myJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const placeholder = await screen.findByTestId('home-hero-placeholder', HIDDEN_OK);
    expect(placeholder.props.accessibilityElementsHidden).toBe(true);
    expect(placeholder.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('shows a placeholder with no text while the proposals load, and the hero replaces it', async () => {
    let answerProposals!: (applications: unknown[]) => void;
    (api.myJobs as jest.Mock).mockResolvedValue([OPEN_JOB]);
    (api.jobApplications as jest.Mock).mockReturnValue(new Promise((resolve) => { answerProposals = resolve; }));
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    const placeholder = await screen.findByTestId('home-hero-placeholder', HIDDEN_OK);
    expect(within(placeholder).queryByText(/./)).toBeNull();
    expect(screen.queryByTestId('home-hero-proposals')).toBeNull();
    expect(screen.queryByText(/proposals? waiting/)).toBeNull();

    await act(async () => {
      answerProposals([pendingApplication('a', 'Ana Reyes')]);
    });

    expect(await screen.findByTestId('home-hero-proposals')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-placeholder', HIDDEN_OK)).toBeNull();
  });

  it('is absent for an account with no job that can make a hero', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([{ ...OPEN_JOB, status: 'completed' }]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('No active jobs')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-placeholder', HIDDEN_OK)).toBeNull();
  });

  it('is absent when the only job is already under way with its time passed and nothing is open', async () => {
    (api.myJobs as jest.Mock).mockResolvedValue([
      { ...OPEN_JOB, id: 'job-progress', title: 'Handyman: Hang shelf', status: 'in_progress', scheduled_at: '2020-01-05T09:00:00+08:00' },
    ]);
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByTestId('home-job-job-progress')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-placeholder', HIDDEN_OK)).toBeNull();
  });

  it('is absent when the jobs request failed, and the error shows instead', async () => {
    (api.myJobs as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<HOHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText("Couldn't load your jobs")).toBeTruthy();
    expect(screen.queryByTestId('home-hero-placeholder', HIDDEN_OK)).toBeNull();
  });
});
