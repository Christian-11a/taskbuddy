import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Landmark, LogOut, Trash2, Wallet } from 'lucide-react-native';
import SPProfileScreen from '../SPProfileScreen';
import { lightPalette } from '../../../../src/constants/palettes';
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

function mockAuthWith({
  profile = {},
  providerProfile = {},
}: {
  profile?: Record<string, unknown>;
  providerProfile?: Record<string, unknown>;
}) {
  const refreshProfile = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({
    profile: { full_name: 'Testo Provider', ...profile },
    providerProfile: { is_verified: true, cached_completed_jobs: 0, cached_avg_rating: null, ...providerProfile },
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
    expect(screen.getByText('Get verified')).toBeTruthy();
  });

  it('does not re-fetch once verified, and hides the Get verified row', async () => {
    const refreshProfile = mockAuth(true);
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} onBack={jest.fn()} />);

    expect(await screen.findByText('Verified')).toBeTruthy();
    expect(screen.queryByText('Get verified')).toBeNull();
    expect(refreshProfile).not.toHaveBeenCalled();
  });

  it('treats a missing provider profile as unverified and still re-fetches', async () => {
    const refreshProfile = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Testo Provider' },
      providerProfile: null,
      refreshProfile,
    });
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Not verified')).toBeTruthy();
  });

  it('Get verified opens Verification once the address and bio are saved', () => {
    mockAuthWith({
      profile: { address: 'Arturo Tanco Drive, Lipa' },
      providerProfile: { is_verified: false, bio: 'Plumber for eight years' },
    });
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Get verified' }));

    expect(onNavigate).toHaveBeenCalledWith('Verification');
  });

  it.each([
    ['the address', { address: null }, { bio: 'Plumber for eight years' }],
    ['the bio', { address: 'Arturo Tanco Drive, Lipa' }, { bio: '   ' }],
  ])('Get verified opens Edit Profile while %s is missing', (_, profile, providerProfile) => {
    mockAuthWith({ profile, providerProfile: { is_verified: false, ...providerProfile } });
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Get verified' }));

    expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
  });

  it('Get verified opens Edit Profile when there is no service profile yet, as verification cannot start without one', () => {
    (useAuth as jest.Mock).mockReturnValue({
      profile: { full_name: 'Testo Provider' },
      providerProfile: null,
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Get verified' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
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

describe('SPProfileScreen — profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    // Left pending unless a test needs the count: the stat would otherwise settle after the test ends.
    (api.assignedJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
  });

  it('shows the services under the name, with a Verified chip once verified', async () => {
    mockAuthWith({
      providerProfile: {
        is_verified: true,
        service_categories: { name: 'Plumbing' },
        approved_secondary_services: [{ category_id: 2, service_categories: { id: 2, name: 'Cleaning' } }],
      },
    });
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    expect(screen.getByText('Plumbing · Cleaning')).toBeTruthy();
    expect(await screen.findByText('Verified')).toBeTruthy();
  });

  it('shows Jobs done and Rating from the profile, and Active from the hired jobs', async () => {
    mockAuthWith({ providerProfile: { cached_completed_jobs: 3, cached_avg_rating: 4.5 } });
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      { status: 'confirmed' },
      { status: 'in_progress' },
      { status: 'completed' },
    ]);
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    expect(screen.getByText('Jobs done')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Rating')).toBeTruthy();
    expect(screen.getByText('4.5')).toBeTruthy();
    expect(await screen.findByText('2')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('the camera badge and Edit profile both open Edit Profile', () => {
    mockAuthWith({});
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('Change photo'));
    fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'Edit Profile');
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'Edit Profile');
  });

  it('the Your work rows open their screens', () => {
    mockAuthWith({});
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'My services' }));
    fireEvent.press(screen.getByRole('button', { name: 'Portfolio' }));
    fireEvent.press(screen.getByRole('button', { name: 'Payout account' }));

    expect(onNavigate.mock.calls).toEqual([['My Services'], ['Portfolio'], ['Payout Account']]);
  });

  it('the Payout account row uses a bank icon, not a wallet, and the back and edit controls reach 48 dp', () => {
    mockAuthWith({});
    const onBack = jest.fn();
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} onBack={onBack} />);

    expect(screen.UNSAFE_queryAllByType(Landmark).length).toBe(1);
    expect(screen.UNSAFE_queryAllByType(Wallet).length).toBe(0);
    const back = screen.getByLabelText('Back to Feed');
    expect(40 + 2 * (back.props.hitSlop as number)).toBeGreaterThanOrEqual(48);
  });

  it('the Account card shows the location without repeating the city, and an empty phone links to Edit Profile', () => {
    mockAuthWith({
      profile: { email: 'provider@example.com', phone: '', address: '12 Rizal St, Lipa City', city: 'Lipa City' },
    });
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    expect(screen.getByText('provider@example.com')).toBeTruthy();
    expect(screen.getByText('12 Rizal St, Lipa City')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Add phone number' }));

    expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
  });

  it('shows a long email with no line limit, so it wraps instead of being cut off', () => {
    const longEmail = 'testo.provider.long.surname@provider-business-mail.example.com';
    mockAuthWith({ profile: { email: longEmail } });
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    expect(screen.getByText(longEmail).props.numberOfLines).toBeUndefined();
  });

  it('a saved phone number is shown, without the add link', () => {
    mockAuthWith({ profile: { phone: '0917 000 0000' } });
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    expect(screen.getByText('0917 000 0000')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add phone number' })).toBeNull();
  });

  it('a missing location shows an Add location link to Edit Profile, not a dash', () => {
    mockAuthWith({ profile: { phone: '0917 000 0000', address: null, city: null } });
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Add location' }));

    expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
  });

  it('a saved location is shown, without the add link', () => {
    mockAuthWith({ profile: { phone: '0917 000 0000', address: '12 Rizal St, Lipa City', city: 'Lipa City' } });
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    expect(screen.getByText('12 Rizal St, Lipa City')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add location' })).toBeNull();
  });

  it('Settings and Help & support open their screens', () => {
    mockAuthWith({});
    const onNavigate = jest.fn();
    render(<SPProfileScreen onNavigate={onNavigate} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.press(screen.getByRole('button', { name: 'Help & support' }));

    expect(onNavigate.mock.calls).toEqual([['Settings'], ['Help & Support']]);
  });

  it('Log Out confirms in the red destructive style, with a log-out icon rather than a bin', () => {
    mockAuthWith({});
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Log Out' }));

    const alert = screen.getByRole('alert');
    expect(StyleSheet.flatten(within(alert).getByLabelText('Log Out').props.style).backgroundColor).toBe(
      lightPalette.Colors.dangerSolid,
    );
    expect(within(alert).UNSAFE_getByType(LogOut)).toBeTruthy();
    expect(within(alert).UNSAFE_queryByType(Trash2)).toBeNull();
  });

  it('Log Out asks first, and logs out only when confirmed', () => {
    mockAuthWith({});
    const onLogout = jest.fn();
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={onLogout} />);

    fireEvent.press(screen.getByRole('button', { name: 'Log Out' }));

    expect(screen.getByText('Are you sure you want to log out?')).toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();

    fireEvent.press(within(screen.getByRole('alert')).getByLabelText('Log Out'));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});

describe('SPProfileScreen — every control has an accessible name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (api.assignedJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
  });

  it('names the back arrow, the menu rows and the verification action', () => {
    mockAuthWith({
      providerProfile: { is_verified: true, service_categories: { name: 'Plumbing' } },
    });
    render(<SPProfileScreen onNavigate={jest.fn()} onLogout={jest.fn()} onBack={jest.fn()} />);

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });
});
