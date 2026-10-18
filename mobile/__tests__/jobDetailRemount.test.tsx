import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import { markOnboardingCompleted } from '../src/lib/onboarding';

// A homeowner with a job open and its confirmation up. A push that opens a different job must not carry that
// confirmation over: the job detail screen is keyed by job id, so it remounts with fresh state.

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  warmUpAsync: jest.fn(() => Promise.resolve({})),
  coolDownAsync: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../src/lib/warmUp', () => ({ warmUpServer: jest.fn() }));

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  };
});

jest.mock('../src/lib/api', () => ({
  ...jest.requireActual('../src/lib/api'),
  api: new Proxy({}, { get: () => jest.fn(() => new Promise(() => {})) }),
}));

const mockAuthState: Record<string, unknown> = {};
jest.mock('../src/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthState,
}));

jest.mock('../src/context/NotificationsContext', () => ({
  NotificationsProvider: ({ children }: { children: React.ReactNode }) => children,
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: () => {} }),
}));

const mockPush: { handler: ((data: Record<string, string>) => void) | null } = { handler: null };
jest.mock('../src/lib/pushNotifications', () => ({
  requestExpoPushRegistration: jest.fn(() => Promise.resolve({ status: 'denied' })),
  subscribeToNotificationTaps: jest.fn((handler: (data: Record<string, string>) => void) => {
    mockPush.handler = handler;
    return Promise.resolve(() => {});
  }),
  consumeLastNotificationTap: jest.fn(() => Promise.resolve(null)),
  subscribeToChatPushes: jest.fn(() => Promise.resolve(() => {})),
}));

jest.mock('../app/(homeowner)/screens/HOHomeScreen', () => {
  const React = require('react');
  const { Text, View: RNView } = require('react-native');
  return { __esModule: true, default: () => React.createElement(RNView, { testID: 'home-stand-in' }, React.createElement(Text, null, 'Home')) };
});

// The job detail, reduced to a job label and a confirm control. The confirm state lives in the screen, as it does
// in the real one, so only a remount clears it.
jest.mock('../app/(homeowner)/screens/HOJobDetailScreen', () => {
  const React = require('react');
  const { Pressable, Text, View: RNView } = require('react-native');
  function JobDetailStandIn({ jobId }: { jobId: string | null }) {
    const [confirming, setConfirming] = React.useState(false);
    return React.createElement(
      RNView,
      { testID: 'job-detail-stand-in' },
      React.createElement(Text, null, `Job ${jobId}`),
      confirming
        ? React.createElement(Pressable, { accessibilityRole: 'button', onPress: () => {} }, React.createElement(Text, null, `Confirm for ${jobId}`))
        : React.createElement(Pressable, { accessibilityRole: 'button', onPress: () => setConfirming(true) }, React.createElement(Text, null, 'Open confirm')),
    );
  }
  return { __esModule: true, default: JobDetailStandIn };
});

const PROFILE = {
  id: 'acct-1',
  full_name: 'Alex Ruiz',
  email: 'alex@example.com',
  role: 'client',
  created_at: '2020-01-01T00:00:00.000Z',
  google_signup_pending: false,
};

function signedIn() {
  return {
    initializing: false,
    session: { access_token: 'tok-alex', refresh_token: 'ref-alex', expires_at: 0 },
    profile: PROFILE,
    providerProfile: null,
    role: 'homeowner',
    isAuthenticated: true,
    isVerified: false,
    isGoogleSignupPending: false,
    authError: null,
    clearAuthError: jest.fn(),
    refreshProfile: jest.fn(),
    signIn: jest.fn(),
    signUp: jest.fn(),
    signInWithGoogle: jest.fn(),
    resetPassword: jest.fn(),
    verifyEmailOtp: jest.fn(),
    completeGoogleProfile: jest.fn(),
    signOut: jest.fn(),
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await markOnboardingCompleted(PROFILE.id);
  Object.assign(mockAuthState, signedIn());
  mockPush.handler = null;
});

async function pass(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** A tapped notification for a job, as the push handler receives it. Each tap gets its own notification id. */
function tapJobNotification(jobId: string, notificationId: string) {
  act(() => {
    mockPush.handler?.({ recipient_id: PROFILE.id, job_id: jobId, notification_id: notificationId });
  });
}

it('clears an open confirmation when a push opens a different job', async () => {
  const view = render(<App />);
  expect(await screen.findByTestId('home-stand-in')).toBeTruthy();

  tapJobNotification('job-a', 'n-a');
  expect(await screen.findByText('Job job-a')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Open confirm' }));
  expect(screen.getByRole('button', { name: 'Confirm for job-a' })).toBeTruthy();

  tapJobNotification('job-b', 'n-b');
  await pass();
  view.rerender(<App />);

  expect(await screen.findByText('Job job-b')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Confirm for job-a' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Confirm for job-b' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Open confirm' })).toBeTruthy();
}, 15000);
