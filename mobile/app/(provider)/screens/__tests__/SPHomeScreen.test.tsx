import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPHomeScreen from '../SPHomeScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { lightPalette } from '../../../../src/constants/palettes';

jest.mock('../../../../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: jest.fn() }),
}));

jest.mock('../../../../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    browseJobs: jest.fn(),
    assignedJobs: jest.fn(),
    myApplications: jest.fn(),
    setAvailability: jest.fn(),
    myVerification: jest.fn(),
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
    expect(screen.getByText(LONG_NAME).props.numberOfLines).toBe(1);
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
      expect(screen.getByText('Finish setting up · 1 of 3')).toBeTruthy();
      expect(screen.getByText('Arturo Tanco Drive, Lipa')).toBeTruthy();
      expect(screen.getByText('ID photo + selfie · about 2 minutes')).toBeTruthy();
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

      expect(await screen.findByText('Finish setting up · 2 of 3')).toBeTruthy();
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

      expect(await screen.findByText('Finish setting up · 2 of 3')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Get verified' }));

      expect(onNavigate).toHaveBeenCalledWith('Verification');
    });

    it('says the request is under review while it is pending', async () => {
      unverified({ address: 'Arturo Tanco Drive, Lipa', bio: 'Plumber for eight years' });
      (api.myVerification as jest.Mock).mockResolvedValue({ status: 'pending' });
      render(<SPHomeScreen onNavigate={jest.fn()} />);

      expect(await screen.findByText('Verification under review')).toBeTruthy();
      expect(screen.getByText('Under review')).toBeTruthy();
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

    it('does not fetch the verification status for a verified provider', async () => {
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      await screen.findByTestId('btn-home-avatar');
      expect(api.myVerification).not.toHaveBeenCalled();
      expect(screen.queryByText('Get verified to see jobs near you')).toBeNull();
    });
  });
});
