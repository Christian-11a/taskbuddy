import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPProfileScreen from '../SPProfileScreen';
import { api } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: { assignedJobs: jest.fn() },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../src/components/OwnAvatar', () => () => null);

function mockAuth(isVerified: boolean) {
  const refreshProfile = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({
    profile: { full_name: 'Testo Provider' },
    providerProfile: { is_verified: isVerified, cached_completed_jobs: 0, cached_avg_rating: null },
    refreshProfile,
  });
  return refreshProfile;
}

describe('SPProfileScreen — verification status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
  });

  it('re-fetches the profile on mount while unverified, so a fresh approval shows', async () => {
    const refreshProfile = mockAuth(false);
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} onBack={jest.fn()} />);

    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Not verified')).toBeTruthy();
    expect(screen.getByText('Get Verified')).toBeTruthy();
  });

  it('does not re-fetch once verified, and hides the Get Verified row', async () => {
    const refreshProfile = mockAuth(true);
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} onBack={jest.fn()} />);

    expect(await screen.findByText('Verified')).toBeTruthy();
    expect(screen.queryByText('Get Verified')).toBeNull();
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it('treats a missing provider profile as unverified and still re-fetches', async () => {
    const refreshProfile = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Testo Provider' },
      providerProfile: null,
      refreshProfile,
    });
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} onBack={jest.fn()} />);

    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Not verified')).toBeTruthy();
  });
});

describe('SPProfileScreen — back arrow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    // Left pending: the stats loader would otherwise update state after the test ends.
    (api.assignedJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
    mockAuth(true);
  });

  it('has no back arrow on the Profile tab, where onBack is not passed', () => {
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    expect(screen.queryByLabelText('Back to Feed')).toBeNull();
  });

  it('shows the back arrow when pushed from another screen, and runs onBack', () => {
    const onBack = jest.fn();
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} onBack={onBack} />);

    fireEvent.press(screen.getByLabelText('Back to Feed'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
