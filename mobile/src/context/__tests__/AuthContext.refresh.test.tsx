import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../AuthContext';
import { api } from '../../lib/api';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('../../lib/pushNotifications', () => ({
  requestExpoPushRegistration: jest
    .fn()
    .mockResolvedValue({ status: 'denied' }),
}));
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  configureApiAuth: jest.fn(),
  api: { me: jest.fn(), logout: jest.fn().mockResolvedValue(undefined) },
}));
function Probe() {
  const { profile, refreshProfile, signOut } = useAuth();
  return (
    <>
      <Text>{profile?.full_name ?? 'Signed out'}</Text>
      <Text onPress={() => void refreshProfile()}>Refresh</Text>
      <Text onPress={() => void signOut()}>Sign out</Text>
    </>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
});
it('discards a profile refresh that completes after logout', async () => {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    key === 'taskbuddy.session'
      ? JSON.stringify({ access_token: 'old-token', refresh_token: 'refresh' })
      : null,
  );
  (api.me as jest.Mock).mockResolvedValue({
    profile: { id: 'provider', full_name: 'Alex', role: 'provider' },
    provider_profile: null,
  });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText('Alex');
  let finish!: (value: unknown) => void;
  (api.me as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  fireEvent.press(screen.getByText('Refresh'));
  await act(async () => fireEvent.press(screen.getByText('Sign out')));
  await screen.findByText('Signed out');
  await act(async () =>
    finish({
      profile: { id: 'provider', full_name: 'Old profile', role: 'provider' },
      provider_profile: null,
    }),
  );
  expect(screen.getByText('Signed out')).toBeTruthy();
  expect(screen.queryByText('Old profile')).toBeNull();
  expect(api.logout).toHaveBeenCalledWith('old-token');
});

it('an older service refresh cannot overwrite a newer approval response', async () => {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    key === 'taskbuddy.session'
      ? JSON.stringify({ access_token: 'token', refresh_token: 'refresh' })
      : null,
  );
  (api.me as jest.Mock).mockResolvedValue({
    profile: { id: 'provider', full_name: 'Alex', role: 'provider' },
    provider_profile: null,
  });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText('Alex');
  let finish!: (value: unknown) => void;
  (api.me as jest.Mock)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({
      profile: {
        id: 'provider',
        full_name: 'Current approval',
        role: 'provider',
      },
      provider_profile: null,
    });
  fireEvent.press(screen.getByText('Refresh'));
  await act(async () => fireEvent.press(screen.getByText('Refresh')));
  await screen.findByText('Current approval');
  await act(async () =>
    finish({
      profile: {
        id: 'provider',
        full_name: 'Old service state',
        role: 'provider',
      },
      provider_profile: null,
    }),
  );
  expect(screen.getByText('Current approval')).toBeTruthy();
  expect(screen.queryByText('Old service state')).toBeNull();
});
