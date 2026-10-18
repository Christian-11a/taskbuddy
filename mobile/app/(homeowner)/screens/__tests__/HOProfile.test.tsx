import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { LogOut, Trash2 } from 'lucide-react-native';
import Profile from '../HOProfile';
import { lightPalette } from '../../../../src/constants/palettes';
import { api, type Job } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn() },
}));

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../../src/components/OwnAvatar', () => () => null);

const homeownerProfile = {
  full_name: 'Testo Homeowner',
  email: 'homeowner@example.com',
  phone: '+639171234567',
  address: null,
  city: null,
  created_at: null,
};

function job(status: string): Job {
  return { id: `job-${status}-${Math.random()}`, status } as Job;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (useAuth as jest.Mock).mockReturnValue({ profile: homeownerProfile });
  // Left pending: the stats loader would otherwise update state after each test ends.
  (api.myJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
});

it('has no back arrow on the Profile tab, where onBack is not passed', () => {
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} />);

  expect(screen.queryByLabelText('Back to Home')).toBeNull();
});

it('shows the back arrow when pushed from another screen, and runs onBack', () => {
  const onBack = jest.fn();
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} onBack={onBack} />);

  fireEvent.press(screen.getByLabelText('Back to Home'));

  expect(onBack).toHaveBeenCalledTimes(1);
});

it('shows the name, the Client line with the join month, and Edit profile, which opens Edit Profile', () => {
  (useAuth as jest.Mock).mockReturnValue({
    profile: { ...homeownerProfile, created_at: new Date(2026, 8, 15).toISOString() },
  });
  const onNavigate = jest.fn();
  render(<Profile onNavigate={onNavigate} onLogout={jest.fn()} />);

  expect(screen.getByText('Testo Homeowner')).toBeTruthy();
  expect(screen.getByText('Client · Member since Sep 2026')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Edit profile' }));

  expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
});

it('the camera badge on the avatar opens Edit Profile, where the photo is changed', () => {
  const onNavigate = jest.fn();
  render(<Profile onNavigate={onNavigate} onLogout={jest.fn()} />);

  fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

  expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
});

it('shows Jobs posted and Active now, where active means the jobs Home counts as active', async () => {
  (api.myJobs as jest.Mock).mockResolvedValue([
    job('open'),
    job('recommending'),
    job('in_progress'),
    job('completed'),
    job('cancelled'),
  ]);
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} />);

  expect(await screen.findByText('5')).toBeTruthy();
  expect(screen.getByText('Jobs posted')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByText('Active now')).toBeTruthy();
});

it('the Account card shows email and location, and an empty phone is an Add phone number link to Edit Profile', () => {
  (useAuth as jest.Mock).mockReturnValue({
    profile: {
      ...homeownerProfile,
      phone: '   ',
      address: 'Arturo Tanco Drive, Lipa, Batangas',
      city: 'Lipa',
    },
  });
  const onNavigate = jest.fn();
  render(<Profile onNavigate={onNavigate} onLogout={jest.fn()} />);

  expect(screen.getByText('Account')).toBeTruthy();
  expect(screen.getByText('homeowner@example.com')).toBeTruthy();
  expect(screen.getByText('Arturo Tanco Drive, Lipa, Batangas')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Add phone number' }));

  expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
});

it('shows a long email with no line limit, so it wraps instead of being cut off', () => {
  const longEmail = 'maria.theresa.delacruz-santos@family-mail.example.com';
  (useAuth as jest.Mock).mockReturnValue({ profile: { ...homeownerProfile, email: longEmail } });
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} />);

  expect(screen.getByText(longEmail).props.numberOfLines).toBeUndefined();
});

it('an empty location is an Add location link to Edit Profile, not a dash', () => {
  (useAuth as jest.Mock).mockReturnValue({ profile: { ...homeownerProfile, address: null, city: null } });
  const onNavigate = jest.fn();
  render(<Profile onNavigate={onNavigate} onLogout={jest.fn()} />);

  fireEvent.press(screen.getByRole('button', { name: 'Add location' }));

  expect(onNavigate).toHaveBeenCalledWith('Edit Profile');
});

it('shows the location, and no Add location link, once there is one', () => {
  (useAuth as jest.Mock).mockReturnValue({ profile: { ...homeownerProfile, address: 'Arturo Tanco Drive, Lipa', city: 'Lipa' } });
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} />);

  expect(screen.getByText('Arturo Tanco Drive, Lipa')).toBeTruthy();
  expect(screen.queryByText('Add location')).toBeNull();
});

it('shows the phone number, and no Add phone number link, once there is one', () => {
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} />);

  expect(screen.getByText('+639171234567')).toBeTruthy();
  expect(screen.queryByText('Add phone number')).toBeNull();
});

it('Settings and Help & support open their screens', () => {
  const onNavigate = jest.fn();
  render(<Profile onNavigate={onNavigate} onLogout={jest.fn()} />);

  fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  expect(onNavigate).toHaveBeenLastCalledWith('Settings');

  fireEvent.press(screen.getByRole('button', { name: 'Help & support' }));
  expect(onNavigate).toHaveBeenLastCalledWith('Help & Support');
});

it('Log Out asks for confirmation first, and logs out only when confirmed', () => {
  const onLogout = jest.fn();
  render(<Profile onNavigate={jest.fn()} onLogout={onLogout} />);

  fireEvent.press(screen.getByRole('button', { name: 'Log Out' }));

  expect(screen.getByText('Are you sure you want to log out?')).toBeTruthy();
  expect(onLogout).not.toHaveBeenCalled();

  fireEvent.press(within(screen.getByRole('alert')).getByLabelText('Log Out'));

  expect(onLogout).toHaveBeenCalledTimes(1);
});

it('Log Out confirms in the red destructive style, with a log-out icon rather than a bin', () => {
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} />);

  fireEvent.press(screen.getByRole('button', { name: 'Log Out' }));

  const alert = screen.getByRole('alert');
  expect(StyleSheet.flatten(within(alert).getByLabelText('Log Out').props.style).backgroundColor).toBe(
    lightPalette.Colors.dangerSolid,
  );
  expect(within(alert).UNSAFE_getByType(LogOut)).toBeTruthy();
  expect(within(alert).UNSAFE_queryByType(Trash2)).toBeNull();
});

it('every control has an accessible name: back arrow, menu rows and log out', () => {
  render(<Profile onNavigate={jest.fn()} onLogout={jest.fn()} onBack={jest.fn()} />);

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});

it('has a Payments row that navigates to Payments', () => {
  const onNavigate = jest.fn();
  render(<Profile onNavigate={onNavigate} onLogout={jest.fn()} />);

  fireEvent.press(screen.getByLabelText('Payments'));

  expect(onNavigate).toHaveBeenCalledWith('Payments');
});
