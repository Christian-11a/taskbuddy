import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SPHomeScreen from '../SPHomeScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    browseJobs: jest.fn(),
    assignedJobs: jest.fn(),
    setAvailability: jest.fn(),
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
});
