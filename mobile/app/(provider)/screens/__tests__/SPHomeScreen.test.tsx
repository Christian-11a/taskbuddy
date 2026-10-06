import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPHomeScreen from '../SPHomeScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/context/NotificationsContext', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: jest.fn() }),
}));

jest.mock('../../../../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    browseJobs: jest.fn(),
    assignedJobs: jest.fn(),
    setAvailability: jest.fn(),
    myVerification: jest.fn(),
  },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

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
    expect(screen.getByText(`Hello, ${LONG_NAME}`).props.numberOfLines).toBe(1);
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

    expect(await screen.findByText('Hello, there')).toBeTruthy();
  });

  it('opens confirmed bookings without asking the provider to accept again', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([{ id: 'hired-job', title: 'Hired sink repair',
      status: 'confirmed', address: 'QC', urgency: 'normal', budget: 500, scheduled_at: null }]);
    const onNavigate = jest.fn();
    render(<SPHomeScreen onNavigate={onNavigate} />);
    fireEvent.press(await screen.findByText('Hired sink repair'));
    expect(onNavigate).toHaveBeenCalledWith('Job Detail', 'hired-job');
    expect(screen.getByText('Confirmed bookings')).toBeTruthy();
    expect(screen.queryByText('Accept')).toBeNull();
    expect(screen.queryByText('Decline')).toBeNull();
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


  describe('verification banner', () => {
    const unverified = (refreshProfile = jest.fn()) => (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'New Provider', city: 'Lipa', latitude: null, longitude: null },
      providerProfile: { is_available: false, service_radius_km: 15 },
      isVerified: false,
      refreshProfile,
    });

    it('asks to verify when there is no request yet', async () => {
      unverified();
      (api.myVerification as jest.Mock).mockResolvedValue(null);
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      expect(await screen.findByText('Verification required to apply')).toBeTruthy();
      expect(screen.getByText('Verify now')).toBeTruthy();
    });

    it('says the request is under review while it is pending', async () => {
      unverified();
      (api.myVerification as jest.Mock).mockResolvedValue({ status: 'pending' });
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      expect(await screen.findByText('Verification under review')).toBeTruthy();
      expect(screen.queryByText('Verify now')).toBeNull();
    });

    it('asks to try again after a rejection', async () => {
      unverified();
      (api.myVerification as jest.Mock).mockResolvedValue({ status: 'rejected', rejection_reason: 'Blurry' });
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      expect(await screen.findByText('Verification not approved')).toBeTruthy();
      expect(screen.getByText('Try again')).toBeTruthy();
    });

    it('falls back to the default banner if the status cannot be loaded', async () => {
      unverified();
      (api.myVerification as jest.Mock).mockRejectedValue(new Error('offline'));
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      expect(await screen.findByText('Verification required to apply')).toBeTruthy();
    });

    it('does not fetch the verification status for a verified provider', async () => {
      render(<SPHomeScreen onNavigate={jest.fn()} />);
      await screen.findByTestId('btn-home-avatar');
      expect(api.myVerification).not.toHaveBeenCalled();
      expect(screen.queryByText('Verification required to apply')).toBeNull();
    });
  });
});
