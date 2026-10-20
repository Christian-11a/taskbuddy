import React from 'react';
import { AppState, type AppStateStatus, ScrollView, StyleSheet, TextInput } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import SPHomeScreen from '../SPHomeScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { clearRetainedState } from '../../../../src/hooks/useRetainedState';
import { expectSavedCopyIgnored } from '../../../../src/testing/savedCopy';
import { lightPalette } from '../../../../src/constants/palettes';
import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import { showToast } from '../../../../src/components/Toast';
import KeyboardAwareScrollView from '../../../../src/components/ui/KeyboardAwareScrollView';

jest.mock('../../../../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: jest.fn() }),
}));

jest.mock('../../../../src/components/Toast', () => ({ showToast: jest.fn() }));

jest.mock('../../../../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    browseJobs: jest.fn(),
    assignedJobs: jest.fn(),
    myApplications: jest.fn(),
    setAvailability: jest.fn(),
    myVerification: jest.fn(),
    myCredentials: jest.fn().mockResolvedValue([]),
    payoutAccount: jest.fn().mockResolvedValue({ id: 'acct-1' }),
  },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

// A long name used to widen the greeting column until the bell + avatar were
// pushed off the right edge — the avatar is the only route to Profile (and Log out).
describe('SPHomeScreen — hero header keeps the avatar reachable with a long name', () => {
  const LONG_NAME = 'MYRE LECTOR ANDRE MORADA DELA CRUZ SANTIAGO VILLANUEVA';

  function signedInAs(fullName: string) {
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: fullName, city: 'Cebu', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: LONG_NAME, city: 'Cebu', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('still navigates to Profile from the avatar', async () => {
    const onNavigate = jest.fn();
    render(<SPHomeScreen onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByTestId('btn-home-avatar'));

    expect(onNavigate).toHaveBeenCalledWith('Profile');
  });

  it('lets the greeting column shrink and truncate instead of pushing the actions out', async () => {
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    const column = StyleSheet.flatten((await screen.findByTestId('hero-text')).props.style);
    expect(column.flex).toBe(1);
    expect(column.minWidth).toBe(0);
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText(LONG_NAME).props.numberOfLines).toBe(2);
  });

  // At 1.3x text "Hello" stays on one line and the name may wrap to two lines before
  // it is cut with an ellipsis, so the header never grows a third line.
  it('lets "Hello" wrap and lets the name wrap to two, with an ellipsis, at large text', async () => {
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    const hello = await screen.findByText('Hello');
    expect(hello.props.numberOfLines).toBe(2);
    expect(hello.props.ellipsizeMode).toBe('tail');
    const name = screen.getByText(LONG_NAME);
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
    expect(name.props.maxFontSizeMultiplier).toBe(1.3);
    expect(name.props.adjustsFontSizeToFit).toBeFalsy();
  });

  it('wraps "Maria Cristina Dela Cruz-Santos" to two lines before it is cut', async () => {
    signedInAs('Maria Cristina Dela Cruz-Santos');
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    const name = await screen.findByText('Maria Cristina Dela Cruz-Santos');
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
  });

  it('wraps a 40-character name to two lines before it is cut', async () => {
    const fortyChars = 'Ana Beatriz Ramos Villanueva de los Pena';
    expect(fortyChars).toHaveLength(40);
    signedInAs(fortyChars);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    const name = await screen.findByText(fortyChars);
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.ellipsizeMode).toBe('tail');
  });

  it('never lets the action buttons shrink away', async () => {
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    const actions = StyleSheet.flatten((await screen.findByTestId('hero-actions')).props.style);
    expect(actions.flexShrink).toBe(0);
  });

  it('falls back to "there" when the profile has no name', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: '', city: 'Cebu', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('there')).toBeTruthy();
  });

  it('opens a hired job from the next-booking hero without asking the provider to accept again', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([{ id: 'hired-job', title: 'Hired sink repair',
      status: 'confirmed', address: 'QC', urgency: 'normal', budget: 500, scheduled_at: null }]);
    const onNavigate = jest.fn();
    render(<SPHomeScreen onNavigate={onNavigate} />);

    expect(await screen.findByText('Hired sink repair')).toBeTruthy();
    expect(screen.getByText('Next booking')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Open Hired sink repair'));

    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'hired-job');
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
  });

  it('leads with the soonest booking and says how many more start in the next week', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      { id: 'far', title: 'Far job', status: 'confirmed', address: 'Lipa', scheduled_at: inDays(20) },
      { id: 'soon', title: 'Plumbing: Fix toilet', status: 'confirmed', address: 'Arturo Tanco Drive, Lipa', scheduled_at: inDays(1) },
      { id: 'week', title: 'Second job', status: 'confirmed', address: 'Lipa', scheduled_at: inDays(3) },
    ]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Plumbing: Fix toilet')).toBeTruthy();
    expect(screen.getByText(/Arturo Tanco Drive, Lipa/)).toBeTruthy();
    expect(screen.getByText('+1 more this week')).toBeTruthy();
  });

  it('labels open jobs the provider already applied to', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({
      jobs: [
        { id: 'job-1', title: 'TEST ONLY - UI check', status: 'open', urgency: 'normal', address: 'Lipa', budget: 1, scheduled_at: null, distance_km: 2.4 },
        { id: 'job-2', title: 'Window cleaning', status: 'open', urgency: 'flexible', address: 'Lipa', budget: 800, scheduled_at: null, distance_km: 1.2 },
      ],
      summary: { open_count: 2, urgent_count: 0, potential_payout: 0 },
    });
    (api.myApplications as jest.Mock).mockResolvedValue([{ id: 'app-1', status: 'pending', jobs: { id: 'job-1' } }]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Applied · waiting')).toBeTruthy();
    expect(screen.getByText('1.2 km away · Flexible')).toBeTruthy();
  });

  it('caps the feed search at 100 characters, and a search of spaces alone keeps every job', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({
      jobs: [
        { id: 'job-2', title: 'Window cleaning', status: 'open', urgency: 'flexible', address: 'Lipa', budget: 800, scheduled_at: null, distance_km: 1.2 },
        { id: 'job-3', title: 'Lawn mowing', status: 'open', urgency: 'normal', address: 'Lipa', budget: 500, scheduled_at: null, distance_km: 3.1 },
      ],
      summary: { open_count: 2, urgent_count: 0, potential_payout: 0 },
    });
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    expect(await screen.findByText('Window cleaning')).toBeTruthy();
    const search = screen.getByPlaceholderText('Search open jobs');

    expect(search.props.maxLength).toBe(100);
    fireEvent.changeText(search, '     ');

    expect(screen.getByText('Window cleaning')).toBeTruthy();
    expect(screen.getByText('Lawn mowing')).toBeTruthy();
  });

  it('every control has an accessible name: bell, avatar, availability switch, feed rows and urgency pills', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({
      jobs: [
        { id: 'job-1', title: 'TEST ONLY - UI check', status: 'open', urgency: 'normal', address: 'Lipa', budget: 1, scheduled_at: null, distance_km: 2.4 },
        { id: 'job-2', title: 'Window cleaning', status: 'open', urgency: 'flexible', address: 'Lipa', budget: 800, scheduled_at: null, distance_km: 1.2 },
      ],
      summary: { open_count: 2, urgent_count: 1, potential_payout: 0 },
    });
    (api.myApplications as jest.Mock).mockResolvedValue([{ id: 'app-1', status: 'pending', jobs: { id: 'job-1' } }]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    await screen.findByText('Applied · waiting');
    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });

  it('puts the feed summary counts on the urgency pills', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({
      jobs: [{ id: 'job-u', title: 'Burst pipe', status: 'open', urgency: 'urgent', address: 'Lipa', budget: 900, scheduled_at: null, distance_km: null }],
      summary: { open_count: 7, urgent_count: 2, potential_payout: 0 },
    });
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByLabelText('All, 7')).toBeTruthy();
    expect(screen.getByLabelText('Urgent, 2')).toBeTruthy();
  });

  it('opens an open job from its row', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({
      jobs: [{ id: 'job-9', title: 'Fix a leaking tap', status: 'open', urgency: 'urgent', address: 'Lipa', budget: 300, scheduled_at: null, distance_km: 0.5 }],
      summary: null,
    });
    const onNavigate = jest.fn();
    render(<SPHomeScreen onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByText('Fix a leaking tap'));

    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'job-9');
  });

  it('explains the availability switch with the search radius', async () => {
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Clients within 25 km can invite you')).toBeTruthy();
    expect(screen.getByText('Available for jobs')).toBeTruthy();
  });

  it('says when the provider will not be invited to new jobs', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Ana', city: 'Lipa', latitude: null, longitude: null },
      providerProfile: { is_available: false, service_radius_km: 25 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText("You won't be invited to new jobs")).toBeTruthy();
    expect(screen.getByText('Not available')).toBeTruthy();
  });

  it('recreates the availability dot when the switch changes, so Android repaints its colour', async () => {
    const view = render(<SPHomeScreen onNavigate={jest.fn()} />);
    const dotBefore = await screen.findByTestId('availability-dot');
    expect(StyleSheet.flatten(dotBefore.props.style).backgroundColor).toBe(lightPalette.Colors.successText);

    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: LONG_NAME, city: 'Cebu', latitude: null, longitude: null },
      providerProfile: { is_available: false, service_radius_km: 25 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    view.rerender(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Not available')).toBeTruthy();
    expect(screen.getByTestId('availability-dot')).not.toBe(dotBefore);
    expect(StyleSheet.flatten(screen.getByTestId('availability-dot').props.style).backgroundColor).toBe(lightPalette.V6Colors.ink400);
  });

  it('refetches eligible jobs when an additional service is approved', async () => {
    const profile = { id: 'provider', full_name: LONG_NAME, latitude: 10.3, longitude: 123.9 };
    const providerProfile = { category_id: 1, is_available: true, service_radius_km: 25, approved_secondary_services: [] };
    const refreshProfile = jest.fn();
    (useAuth as jest.Mock).mockReturnValue({ profile, providerProfile, isVerified: true, refreshProfile });
    const view = render(<SPHomeScreen onNavigate={jest.fn()} />);
    await waitFor(() => expect(api.browseJobs).toHaveBeenCalledTimes(1));
    (useAuth as jest.Mock).mockReturnValue({ profile, providerProfile: { ...providerProfile, approved_secondary_services: [{ category_id: 2, service_categories: { id: 2, name: 'Pedicure' } }] }, isVerified: true, refreshProfile });
    view.rerender(<SPHomeScreen onNavigate={jest.fn()} />);
    await waitFor(() => expect(api.browseJobs).toHaveBeenCalledTimes(2));
  });

  describe('new provider setup (not verified yet)', () => {
    beforeEach(() => { (api.payoutAccount as jest.Mock).mockResolvedValue(null); });

    /** An unverified provider. `city` alone counts as an address; a bio and verification come from the args. */
    const unverified = ({ address = null, bio = null, categoryName }: { address?: string | null; bio?: string | null; categoryName?: string } = {}, refreshProfile = jest.fn()) => (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'New Provider', address, city: 'Lipa', latitude: null, longitude: null },
      providerProfile: {
        is_available: false,
        service_radius_km: 15,
        bio,
        is_verified: false,
        ...(categoryName ? { service_categories: { name: categoryName } } : {}),
      },
      isVerified: false,
      refreshProfile,
    });

    it('shows how many setup steps are done and the step the next button runs', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa' });
      (api.myVerification as jest.Mock).mockResolvedValue(null);
      render(<SPHomeScreen onNavigate={jest.fn()} />);

      expect(await screen.findByText('Get verified to see jobs near you')).toBeTruthy();
      expect(screen.getByText('Clients only see verified providers. It takes about 5 minutes.')).toBeTruthy();
      expect(screen.getByText('Finish setting up · 1 of 4')).toBeTruthy();
      expect(screen.getByText('Arturo Tanco Drive, Lipa')).toBeTruthy();
      expect(screen.getByText('ID photo, selfie and certificate · about 5 minutes')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Add a short bio' })).toBeTruthy();
    });

    it('recreates a setup step\'s segment and badge when the step is finished, so Android repaints them', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa' });
      (api.myVerification as jest.Mock).mockResolvedValue(null);
      const view = render(<SPHomeScreen onNavigate={jest.fn()} />);
      const badgeBefore = await screen.findByTestId('setup-badge-bio');
      const segmentBefore = screen.getByTestId('setup-segment-bio');
      expect(StyleSheet.flatten(segmentBefore.props.style).backgroundColor).toBe(lightPalette.Colors.heroCardBorder);

      unverified({ address: 'Arturo Tanco Drive, Lipa', bio: 'Plumber for eight years' });
      view.rerender(<SPHomeScreen onNavigate={jest.fn()} />);

      expect(await screen.findByText('Finish setting up · 2 of 4')).toBeTruthy();
      expect(screen.getByTestId('setup-badge-bio')).not.toBe(badgeBefore);
      expect(screen.getByTestId('setup-segment-bio')).not.toBe(segmentBefore);
      expect(StyleSheet.flatten(screen.getByTestId('setup-segment-bio').props.style).backgroundColor).toBe(lightPalette.Colors.onPrimary);
    });

    it('opens Edit Profile from the button while the bio is missing', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa' });
      (api.myVerification as jest.Mock).mockResolvedValue(null);
      const onNavigate = jest.fn();
      render(<SPHomeScreen onNavigate={onNavigate} />);

      fireEvent.press(await screen.findByRole('button', { name: 'Add a short bio' }));

      expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
    });

    it('opens Verification from the button once the address and bio are saved', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa', bio: 'Plumber for eight years' });
      (api.myVerification as jest.Mock).mockResolvedValue(null);
      const onNavigate = jest.fn();
      render(<SPHomeScreen onNavigate={onNavigate} />);

      expect(await screen.findByText('Finish setting up · 2 of 4')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Get verified' }));

      expect(onNavigate).toHaveBeenCalledWith('Verification');
    });

    it('says the request is under review while it is pending', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa', bio: 'Plumber for eight years' });
      (api.myVerification as jest.Mock).mockResolvedValue({ status: 'pending' });
      render(<SPHomeScreen onNavigate={jest.fn()} />);

      expect(await screen.findByText('Verification under review')).toBeTruthy();
      expect(screen.getByText('ID under review')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'View status' })).toBeTruthy();
    });

    it('asks to try again after a rejection', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa', bio: 'Plumber for eight years' });
      (api.myVerification as jest.Mock).mockResolvedValue({ status: 'rejected', rejection_reason: 'Blurry' });
      render(<SPHomeScreen onNavigate={jest.fn()} />);

      expect(await screen.findByText('Verification not approved')).toBeTruthy();
      expect(screen.getByText('Not accepted · upload new photos')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    });

    it('falls back to the default setup copy if the status cannot be loaded', async () => {
      unverified();
      (api.myVerification as jest.Mock).mockRejectedValue(new Error('offline'));
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      expect(await screen.findByText('Get verified to see jobs near you')).toBeTruthy();
    });

    it('explains that jobs show up after verification, and skips the job feed controls', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa' }, jest.fn());
      (api.myVerification as jest.Mock).mockResolvedValue(null);
      render(<SPHomeScreen onNavigate={jest.fn()} />);

      expect(await screen.findByText('Jobs show up after verification')).toBeTruthy();
      expect(within(screen.getByTestId('empty-card')).getByText('Jobs show up after verification')).toBeTruthy();
      expect(screen.getByText("We'll notify you as soon as you're approved.")).toBeTruthy();
      expect(screen.queryByPlaceholderText('Search open jobs')).toBeNull();
      expect(screen.queryByTestId('toggle-availability')).toBeNull();
    });

    it('names the provider category in the locked jobs note', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa', categoryName: 'Cleaning' });
      (api.myVerification as jest.Mock).mockResolvedValue(null);
      render(<SPHomeScreen onNavigate={jest.fn()} />);

      expect(await screen.findByText("We'll notify you as soon as you're approved. Then nearby Cleaning jobs appear here.")).toBeTruthy();
    });

    it('shows no setup card for a verified provider', async () => {
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      await screen.findByTestId('btn-home-avatar');
      expect(screen.queryByText('Get verified to see jobs near you')).toBeNull();
      expect(screen.queryByTestId('certificate-expiry-banner')).toBeNull();
    });

    it('shows four steps, with the certificate next inside Get verified once the ID is approved, and opens the certificate there', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa', bio: 'Plumber for eight years' });
      (useAuth as jest.Mock).mockReturnValue({
        ...(useAuth as jest.Mock)(),
        providerProfile: { is_available: false, service_radius_km: 15, bio: 'Plumber for eight years', is_verified: false, category_id: 3 },
      });
      (api.myVerification as jest.Mock).mockResolvedValue({
        status: 'approved', identity: 'approved', certificate: 'none', verified: false, services: [],
      });
      const onNavigate = jest.fn();
      render(<SPHomeScreen onNavigate={onNavigate} />);

      expect(await screen.findByText('Finish setting up · 2 of 4')).toBeTruthy();
      expect(screen.getByText('ID approved · certificate needed')).toBeTruthy();
      expect(screen.getByTestId('setup-badge-verify')).toBeTruthy();
      expect(screen.queryByTestId('setup-badge-certificate')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Upload your certificate' }));
      expect(onNavigate).toHaveBeenCalledWith('Verification', undefined, { startAt: 'certificate', categoryId: 3 });
    });
  });
});

describe('SPHomeScreen — certificate expiry banner', () => {
  const inDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const credential = (expires_on: string | null, status = 'approved') => ({
    id: 'c1', category_id: 2, credential_type: 'trade_certificate', title: 'Cert', issuer: 'TESDA',
    issued_on: null, expires_on, status, service_categories: { id: 2, name: 'Plumbing' },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Pat', city: 'Cebu', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25, category_id: 1 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.myVerification as jest.Mock).mockResolvedValue({ status: 'approved', identity: 'approved', certificate: 'approved', verified: true });
    (api.payoutAccount as jest.Mock).mockResolvedValue({ id: 'acct-1' });
  });

  it('warns with the days left and opens the certificate step for that service', async () => {
    (api.myCredentials as jest.Mock).mockResolvedValue([credential(inDays(10))]);
    const onNavigate = jest.fn();
    render(<SPHomeScreen onNavigate={onNavigate} />);

    expect(await screen.findByText('Your Plumbing certificate expires in 10 days.')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Upload renewal' }));
    expect(onNavigate).toHaveBeenCalledWith('Verification', undefined, { startAt: 'certificate', categoryId: 2 });
  });

  it('says an expired certificate has expired', async () => {
    (api.myCredentials as jest.Mock).mockResolvedValue([credential(inDays(-3))]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    expect(await screen.findByText(/Your Plumbing certificate has expired/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload renewal' })).toBeTruthy();
  });

  it('shows nothing for a certificate with plenty of time or no expiry date', async () => {
    (api.myCredentials as jest.Mock).mockResolvedValue([credential(inDays(200)), { ...credential(null), id: 'c2', category_id: 5 }]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    await screen.findByTestId('btn-home-avatar');
    await waitFor(() => expect(api.myCredentials).toHaveBeenCalled());
    expect(screen.queryByTestId('certificate-expiry-banner')).toBeNull();
  });
});

// A verified provider's hero: the next booking, a job in progress, or an invitation to find work.
describe('SPHomeScreen — hero card for a verified provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: 'provider', full_name: 'Alex', city: 'Lipa', latitude: 13.9, longitude: 121.1 },
      providerProfile: { category_id: 1, is_available: true, service_radius_km: 25, approved_secondary_services: [] },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('shows a job in progress as In progress, with Open to go back to the work', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      { id: 'started', title: 'Pipe repair', status: 'in_progress', address: 'Lipa', urgency: 'normal', budget: 500, scheduled_at: inDays(-2) },
    ]);
    const onNavigate = jest.fn();
    render(<SPHomeScreen onNavigate={onNavigate} />);

    const hero = await screen.findByTestId('feed-hero');
    expect(within(hero).getByText('In progress')).toBeTruthy();
    expect(within(hero).getByText('Pipe repair')).toBeTruthy();
    fireEvent.press(within(hero).getByLabelText('Open Pipe repair'));
    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'started');
  });

  it('invites a verified provider with nothing booked to find jobs, and leaves out finished jobs', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      { id: 'done', title: 'Old job', status: 'completed', address: 'Lipa', urgency: 'normal', budget: 500, scheduled_at: null },
    ]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    const hero = await screen.findByTestId('feed-hero');
    expect(within(hero).getByText('No booking yet')).toBeTruthy();
    expect(within(hero).getByText('Find your next job')).toBeTruthy();
    expect(within(hero).getByText('Browse open jobs near you.')).toBeTruthy();
    expect(within(hero).getByLabelText('Find jobs')).toBeTruthy();
    expect(within(hero).queryByText('Old job')).toBeNull();
  });

  it('shows the invitation for a provider with no jobs at all', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Find your next job')).toBeTruthy();
  });

  it('does not show the invitation while the feed is still loading', () => {
    (api.assignedJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(screen.queryByTestId('feed-hero')).toBeNull();
    expect(screen.queryByText('Find your next job')).toBeNull();
  });

  it('Find jobs scrolls down to the feed search, below the body top and the search box offset', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    const hero = await screen.findByTestId('feed-hero');
    const feed = screen.UNSAFE_getAllByType(ScrollView).find((node) => node.props.testID === 'feed-scroll');
    if (!feed) throw new Error('The feed ScrollView is not rendered');
    const scrollTo = jest.spyOn(feed.instance, 'scrollTo');

    // The body starts 120 dp into the scroll content, and the search box 300 dp into the body.
    fireEvent(hero, 'layout', { nativeEvent: { layout: { x: 0, y: 120, width: 375, height: 200 } } });
    fireEvent(screen.getByTestId('feed-section'), 'layout', { nativeEvent: { layout: { x: 0, y: 300, width: 375, height: 48 } } });
    fireEvent.press(within(hero).getByLabelText('Find jobs'));

    expect(scrollTo).toHaveBeenCalledWith({ y: 408, animated: true });
    scrollTo.mockRestore();
  });
});

describe('SPHomeScreen — the feed shows open jobs posted since it was last read', () => {
  const feedJob = (id: string, title: string) => (
    { id, title, status: 'open', urgency: 'normal', address: 'Lipa', budget: 500, scheduled_at: null, distance_km: 1.0 }
  );

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: 'provider', full_name: 'Alex', city: 'Lipa', latitude: 13.9, longitude: 121.1 },
      providerProfile: { category_id: 1, is_available: true, service_radius_km: 25, approved_secondary_services: [] },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('asks for the feed again on a pull down, and shows a job posted since the last read', async () => {
    (api.browseJobs as jest.Mock)
      .mockResolvedValueOnce({ jobs: [feedJob('job-a', 'Fix the sink')], summary: null })
      .mockResolvedValueOnce({ jobs: [feedJob('job-a', 'Fix the sink'), feedJob('job-b', 'Paint the gate')], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(screen.queryByText('Paint the gate')).toBeNull();

    await act(async () => {
      screen.getByTestId('feed-scroll').props.refreshControl.props.onRefresh();
    });

    expect(await screen.findByText('Paint the gate')).toBeTruthy();
    expect(api.browseJobs).toHaveBeenCalledTimes(2);
  });

  it('asks for the feed again when the app comes back to the foreground', async () => {
    const listeners: Array<(state: AppStateStatus) => void> = [];
    const subscribe = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
    (api.browseJobs as jest.Mock)
      .mockResolvedValueOnce({ jobs: [feedJob('job-a', 'Fix the sink')], summary: null })
      .mockResolvedValueOnce({ jobs: [feedJob('job-a', 'Fix the sink'), feedJob('job-c', 'Mow the lawn')], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    expect(await screen.findByText('Fix the sink')).toBeTruthy();

    act(() => listeners.forEach((listener) => listener('background')));
    act(() => listeners.forEach((listener) => listener('active')));

    expect(await screen.findByText('Mow the lawn')).toBeTruthy();
    expect(api.browseJobs).toHaveBeenCalledTimes(2);
    subscribe.mockRestore();
  });
});

describe('SPHomeScreen — the feed search stays above the keyboard', () => {
  type MeasureCallback = (x: number, y: number, width: number, height: number) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Ana', city: 'Cebu', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    // An earlier test in this file leaves AppState.addEventListener without a subscription, so this block supplies one.
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });
  // The ScrollView and TextInput mocks share their methods across instances. Restore the spies between tests.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Waits for the jobs to load, so the feed's state updates land inside act.
  async function renderFeed() {
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    await screen.findByText('No open jobs near you');
  }

  it('renders the feed inside a keyboard-aware scroll view', async () => {
    await renderFeed();

    expect(screen.UNSAFE_getByType(KeyboardAwareScrollView)).toBeTruthy();
  });

  it('shows an empty feed inside the card, like the client empty states', async () => {
    await renderFeed();

    expect(within(screen.getByTestId('empty-card')).getByText('No open jobs near you')).toBeTruthy();
  });

  it('a failed feed load shows the error in a card, and Try again loads the feed', async () => {
    (api.browseJobs as jest.Mock)
      .mockRejectedValueOnce(new Error('Feed unavailable'))
      .mockResolvedValue({ jobs: [], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    const card = await screen.findByTestId('error-card');
    expect(within(card).getByText("Couldn't load open jobs")).toBeTruthy();
    expect(within(card).getByText('Feed unavailable')).toBeTruthy();
    fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No open jobs near you')).toBeTruthy();
    expect(screen.queryByTestId('error-card')).toBeNull();
  });

  it('scrolls the search box above the keyboard when it takes focus', async () => {
    await renderFeed();
    // The feed's outer ScrollView; the urgency pills have their own horizontal ScrollView.
    const feed = screen.UNSAFE_getAllByType(ScrollView).find((node) => node.props.testID === 'feed-scroll');
    if (!feed) throw new Error('The feed ScrollView is not rendered');
    const scrollTo = jest.spyOn(feed.instance, 'scrollTo');
    jest.spyOn(feed.instance, 'getNativeScrollRef').mockReturnValue({
      measureInWindow: (callback: MeasureCallback) => callback(0, 100, 375, 400),
    } as never);
    act(() => {
      feed.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 400 } } });
    });
    const field: { measureInWindow: (callback: MeasureCallback) => void } = screen.UNSAFE_getByType(TextInput).instance;
    jest.spyOn(field, 'measureInWindow').mockImplementation((callback) => callback(0, 600, 375, 48));

    fireEvent(screen.getByPlaceholderText('Search open jobs'), 'focus');

    // The search box is 500 dp into a 400 dp view. Its bottom plus the 24 dp margin (572) is 172 past the view.
    expect(scrollTo).toHaveBeenCalledWith({ y: 172, animated: true });
  });
});

describe('SPHomeScreen — saved copies of the wrong shape', () => {
  // A provider with an id, so the feed's saved key is known: the profile, the service and radius the feed was
  // loaded for (no service here, so it is empty), the coordinates (none), and the urgency filter ('all').
  const FEED_KEY = 'sp-feed-sp-sam--null-null-25-all';

  beforeEach(() => {
    clearRetainedState();
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: 'sp-sam', full_name: 'Sam Reyes', city: 'Cebu', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25 },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.browseJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.assignedJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.myApplications as jest.Mock).mockReturnValue(new Promise(() => {}));
  });

  it('a saved feed of the wrong shape is ignored, and the screen loads as it does with nothing saved', async () => {
    await expectSavedCopyIgnored(FEED_KEY, {}, () => render(<SPHomeScreen onNavigate={jest.fn()} />));
  });

  it('a saved application list of the wrong shape is ignored, and the screen loads as it does with nothing saved', async () => {
    await expectSavedCopyIgnored('sp-applications', {}, () => render(<SPHomeScreen onNavigate={jest.fn()} />));
  });
});

describe('SPHomeScreen - payout account is the last setup step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    // Verified, with the address, bio and certificate saved: only the payout account is left.
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Ana Cruz', address: 'Arturo Tanco Drive, Lipa', city: 'Lipa', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25, bio: 'Plumber for eight years', is_verified: true },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.myVerification as jest.Mock).mockResolvedValue({ status: 'approved', identity: 'approved', certificate: 'approved', verified: true });
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
  });

  it('keeps the setup list open for a verified provider with no payout account, with the payout step next', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Finish setting up · 3 of 4')).toBeTruthy();
    expect(screen.getByText('Almost there')).toBeTruthy();
    expect(screen.getByText('Link a payout account to send proposals.')).toBeTruthy();
    expect(screen.getByTestId('setup-badge-payout')).toBeTruthy();
  });

  it('still shows the rest of the feed below the setup list for a verified provider', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Almost there')).toBeTruthy();
    expect(screen.getByTestId('feed-section')).toBeTruthy();
    expect(screen.getByTestId('home-availability')).toBeTruthy();
    expect(screen.queryByText('Jobs show up after verification')).toBeNull();
  });

  it('opens the Payout account screen from the setup list button', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    const onNavigate = jest.fn();
    render(<SPHomeScreen onNavigate={onNavigate} />);

    fireEvent.press(await screen.findByRole('button', { name: 'Link payout account' }));
    expect(onNavigate).toHaveBeenCalledWith('Payout Account');
  });

  it('has no separate payout card any more', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    await screen.findByText('Almost there');
    expect(screen.queryByTestId('payout-setup-card')).toBeNull();
  });

  it('shows no setup list once an account is linked', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue({ id: 'acct-1' });
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    await screen.findByTestId('feed-section');
    await waitFor(() => expect(api.payoutAccount).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByTestId('setup-hero')).toBeNull();
    expect(screen.getByTestId('home-availability')).toBeTruthy();
  });

  it('does not show the setup list while the payout lookup is still running', async () => {
    (api.payoutAccount as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    await screen.findByTestId('feed-section');
    expect(screen.queryByTestId('setup-hero')).toBeNull();
  });
});

describe('SPHomeScreen - feed states, paging and availability', () => {
  const feedJob = (id: string, title: string) => (
    { id, title, status: 'open', urgency: 'normal', address: 'Lipa', budget: 500, scheduled_at: null, distance_km: 1.0 }
  );

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    clearRetainedState();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
    (useAuth as jest.Mock).mockReturnValue({
      profile: { id: 'provider', full_name: 'Alex', city: 'Lipa', latitude: 13.9, longitude: 121.1 },
      providerProfile: { category_id: 1, is_available: true, service_radius_km: 25, approved_secondary_services: [] },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.payoutAccount as jest.Mock).mockResolvedValue({ id: 'acct-1' });
  });
  afterEach(() => jest.restoreAllMocks());

  it('a search that hides every job says no jobs match, and Clear filters brings them back', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [feedJob('a', 'Fix the sink')], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    await screen.findByText('Fix the sink');

    fireEvent.changeText(screen.getByPlaceholderText('Search open jobs'), 'zzz');
    expect(await screen.findByText('No jobs match your filters')).toBeTruthy();
    expect(screen.queryByText('No open jobs near you')).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear filters'));
    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(screen.queryByText('No jobs match your filters')).toBeNull();
  });

  it('with no filters and no jobs, says no open jobs near you and offers no Clear filters', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('No open jobs near you')).toBeTruthy();
    expect(screen.queryByLabelText('Clear filters')).toBeNull();
  });

  it('Load more asks for the next page by offset and appends it; a short page ends the list', async () => {
    const first = Array.from({ length: 20 }, (_, i) => feedJob(`j${i}`, `Job ${i}`));
    (api.browseJobs as jest.Mock)
      .mockResolvedValueOnce({ jobs: first, summary: null })
      .mockResolvedValueOnce({ jobs: [feedJob('j20', 'Job 20')], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    await screen.findByText('Job 0');

    fireEvent.press(screen.getByLabelText('Load more jobs'));

    expect(await screen.findByText('Job 20')).toBeTruthy();
    expect((api.browseJobs as jest.Mock).mock.calls[1][0]).toMatchObject({ limit: 20, offset: 20 });
    expect(screen.queryByLabelText('Load more jobs')).toBeNull();
  });

  it('shows no Load more when the first page is not full', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [feedJob('a', 'Fix the sink')], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    await screen.findByText('Fix the sink');

    expect(screen.queryByLabelText('Load more jobs')).toBeNull();
  });

  it('a failed availability change reverts the switch and shows a message', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    (api.setAvailability as jest.Mock).mockRejectedValue(new Error('offline'));
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    await screen.findByText('No open jobs near you');

    fireEvent.press(screen.getByTestId('home-availability'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('availability'), 'error'));
    expect(screen.getByText('Available for jobs')).toBeTruthy();
  });

  it('the avatar and bell reach 48 dp', async () => {
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    render(<SPHomeScreen onNavigate={jest.fn()} />);
    const avatar = await screen.findByTestId('btn-home-avatar');
    const bell = screen.getByLabelText('Notifications');

    expect(40 + 2 * (avatar.props.hitSlop as number)).toBeGreaterThanOrEqual(48);
    expect(44 + 2 * (bell.props.hitSlop as number)).toBeGreaterThanOrEqual(48);
  });

  it('the payout lookup is kept between visits, so the setup list does not flash back', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Ana Cruz', address: 'Arturo Tanco Drive, Lipa', city: 'Lipa', latitude: null, longitude: null },
      providerProfile: { is_available: true, service_radius_km: 25, bio: 'Plumber for eight years', is_verified: true },
      isVerified: true,
      refreshProfile: jest.fn(),
    });
    (api.myVerification as jest.Mock).mockResolvedValue({ status: 'approved', identity: 'approved', certificate: 'approved', verified: true });
    (api.browseJobs as jest.Mock).mockResolvedValue({ jobs: [], summary: null });
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    const first = render(<SPHomeScreen onNavigate={jest.fn()} />);
    await screen.findByTestId('setup-hero');
    first.unmount();
    (api.payoutAccount as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<SPHomeScreen onNavigate={jest.fn()} />);

    // Remembered from the first visit: shown at once, while the lookup is still running.
    expect(screen.getByTestId('setup-hero')).toBeTruthy();
  });
});
