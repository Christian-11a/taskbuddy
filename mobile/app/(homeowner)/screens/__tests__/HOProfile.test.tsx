import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import Profile from '../HOProfile';
import { api, type Job } from '../../../../src/lib/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn(), wallet: jest.fn() },
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
  (api.wallet as jest.Mock).mockReturnValue(new Promise(() => {}));
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

it('shows the name, the Homeowner line with the join month, and Edit profile, which opens Edit Profile', () => {
  (useAuth as jest.Mock).mockReturnValue({
    profile: { ...homeownerProfile, created_at: new Date(2026, 8, 15).toISOString() },
  });
  const onNavigate = jest.fn();
  render(<Profile onNavigate={onNavigate} onLogout={jest.fn()} />);

  expect(screen.getByText('Testo Homeowner')).toBeTruthy();
  expect(screen.getByText('Homeowner · Member since Sep 2026')).toBeTruthy();

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
