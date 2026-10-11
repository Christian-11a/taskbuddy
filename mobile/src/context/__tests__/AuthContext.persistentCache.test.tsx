import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../AuthContext';
import { api, ApiError, configureApiAuth } from '../../lib/api';
import { clearAsyncDataCache, useAsyncData } from '../../hooks/useAsyncData';
import { readPersisted, writePersisted } from '../../lib/persistentCache';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('../../lib/pushNotifications', () => ({
  requestExpoPushRegistration: jest.fn().mockResolvedValue({ status: 'denied' }),
}));
jest.mock('../../lib/api', () => ({
  ...jest.requireActual('../../lib/api'),
  configureApiAuth: jest.fn(),
  api: {
    me: jest.fn(),
    login: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn(),
  },
}));

const ALICE_SESSION = { access_token: 'tok-alice', refresh_token: 'ref-alice', expires_at: 0 };
const BOB_SESSION = { access_token: 'tok-bob', refresh_token: 'ref-bob', expires_at: 0 };
const PROFILES: Record<string, { id: string; full_name: string; role: string }> = {
  'tok-alice': { id: 'acct-alice', full_name: 'Alice', role: 'client' },
  'tok-bob': { id: 'acct-bob', full_name: 'Bob', role: 'client' },
};

/**
 * A screen that keeps a saved copy of 'ho-jobs'. It mounts only once an account is signed in, as the
 * tab screens do, and its fetch never lands, so only the saved copy can show.
 */
function SavedJobs() {
  const state = useAsyncData(
    () => new Promise<string[]>(() => {}),
    [],
    'ho-jobs',
    { persist: true },
  );
  return <Text>{`saved:${state.data?.join(',') ?? 'none'}`}</Text>;
}

function Probe() {
  const { profile, signIn, signOut } = useAuth();
  return (
    <>
      <Text>{profile?.full_name ?? 'Signed out'}</Text>
      <Text onPress={() => void signIn('alice@example.com', 'pw')}>Sign in Alice</Text>
      <Text onPress={() => void signIn('bob@example.com', 'pw')}>Sign in Bob</Text>
      <Text onPress={() => void signOut()}>Sign out</Text>
      {profile ? <SavedJobs /> : null}
    </>
  );
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

/** Lets pending storage work and effects run to the end. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The saved-copy keys still on the device, whichever account owns them. */
async function savedKeys(): Promise<string[]> {
  return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('taskbuddy.cache.v1.'));
}

/** Leaves a copy on the device, as an earlier launch would have. */
async function seedSaved(account: string, key: string, value: unknown) {
  await AsyncStorage.setItem(
    `taskbuddy.cache.v1.${account}.${key}`,
    JSON.stringify({ v: 1, savedAt: Date.now(), value }),
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  clearAsyncDataCache();
  (api.me as jest.Mock).mockImplementation(async (token: string) => ({
    profile: PROFILES[token],
    provider_profile: null,
  }));
  (api.login as jest.Mock).mockImplementation(async ({ email }: { email: string }) => ({
    session: email.startsWith('alice') ? ALICE_SESSION : BOB_SESSION,
  }));
});

it("signing out removes the account's saved copies from the device", async () => {
  renderAuth();
  fireEvent.press(screen.getByText('Sign in Alice'));
  expect(await screen.findByText('Alice')).toBeTruthy();
  await act(async () => {
    await writePersisted('ho-jobs', ['alice job']);
  });
  expect(await savedKeys()).toEqual([
    'taskbuddy.cache.v1.acct-alice.ho-jobs',
    'taskbuddy.cache.v1.index.acct-alice',
  ]);

  fireEvent.press(screen.getByText('Sign out'));
  expect(await screen.findByText('Signed out')).toBeTruthy();
  await settle();

  expect(await savedKeys()).toEqual([]);
  expect(await readPersisted('ho-jobs')).toBeNull();
});

it("a second account never reads a copy saved by the first, even one left on the device", async () => {
  await seedSaved('acct-alice', 'ho-jobs', ['alice job']);
  renderAuth();

  fireEvent.press(screen.getByText('Sign in Bob'));

  expect(await screen.findByText('Bob')).toBeTruthy();
  await settle();
  expect(screen.getByText('saved:none')).toBeTruthy();
  expect(screen.queryByText('saved:alice job')).toBeNull();
  expect(await readPersisted('ho-jobs')).toBeNull();
});

it('on launch, the restored account sees its own saved copy while its screens mount', async () => {
  await AsyncStorage.setItem('taskbuddy.session', JSON.stringify(ALICE_SESSION));
  await seedSaved('acct-alice', 'ho-jobs', ['alice job']);

  renderAuth();

  expect(await screen.findByText('Alice')).toBeTruthy();
  expect(await screen.findByText('saved:alice job')).toBeTruthy();
});

it("a session the server rejects wipes the account's saved copies too", async () => {
  renderAuth();
  fireEvent.press(screen.getByText('Sign in Alice'));
  expect(await screen.findByText('Alice')).toBeTruthy();
  await act(async () => {
    await writePersisted('ho-jobs', ['alice job']);
  });
  expect(await savedKeys()).not.toEqual([]);
  const calls = (configureApiAuth as jest.Mock).mock.calls;
  const refreshWithStoredSession = calls[calls.length - 1][1] as () => Promise<string | null>;
  (api.refresh as jest.Mock).mockRejectedValueOnce(new ApiError('Refresh token expired', 401));

  await act(async () => {
    await refreshWithStoredSession();
  });

  expect(await screen.findByText('Signed out')).toBeTruthy();
  await settle();
  expect(await savedKeys()).toEqual([]);
  expect(await readPersisted('ho-jobs')).toBeNull();
});

/** A screen that fetches 'ho-jobs' and keeps the result in memory, as the tab screens do. */
function ResultsKeptInMemory() {
  const state = useAsyncData(() => Promise.resolve(['alice memory']), [], 'ho-jobs');
  return <Text>{`kept:${state.data?.join(',') ?? 'none'}`}</Text>;
}

/** A screen that shows what is kept in memory for 'ho-jobs', and never fetches anything itself. */
function ShowsMemoryOnly() {
  const state = useAsyncData(() => new Promise<string[]>(() => {}), [], 'ho-jobs');
  return <Text>{`kept:${state.data?.join(',') ?? 'none'}`}</Text>;
}

it('a session the server rejects also clears what screens kept in memory', async () => {
  // Kept as a handle: `screen` follows the latest render, and the second render below would take it over.
  const auth = renderAuth();
  fireEvent.press(auth.getByText('Sign in Alice'));
  expect(await auth.findByText('Alice')).toBeTruthy();
  const kept = render(<ResultsKeptInMemory />);
  expect(await kept.findByText('kept:alice memory')).toBeTruthy();
  kept.unmount();
  const calls = (configureApiAuth as jest.Mock).mock.calls;
  const refreshWithStoredSession = calls[calls.length - 1][1] as () => Promise<string | null>;
  (api.refresh as jest.Mock).mockRejectedValueOnce(new ApiError('Refresh token expired', 401));

  await act(async () => {
    await refreshWithStoredSession();
  });

  expect(await auth.findByText('Signed out')).toBeTruthy();
  const later = render(<ShowsMemoryOnly />);
  expect(later.getByText('kept:none')).toBeTruthy();
});
