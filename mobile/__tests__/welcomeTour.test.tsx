import React from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

// The whole signed-in app, with the parts the welcome flow does not touch replaced by stand-ins. The
// tests drive the flow itself: the intro cards, Home's tour anchors, a tapped notification, the session.

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

// The real provider waits for a native measurement that never comes under Jest, so its children never mount.
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

// The signed-in state the App reads. A test changes it in place, then re-renders.
const mockAuthState: Record<string, unknown> = {};
jest.mock('../src/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthState,
}));

jest.mock('../src/context/NotificationsContext', () => ({
  NotificationsProvider: ({ children }: { children: React.ReactNode }) => children,
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, error: null, reload: () => {} }),
}));

// The push-tap handler the App subscribes with, so a test can deliver a tapped notification.
const mockPush: { handler: ((data: Record<string, string>) => void) | null } = { handler: null };
jest.mock('../src/lib/pushNotifications', () => ({
  requestExpoPushRegistration: jest.fn(() => Promise.resolve({ status: 'denied' })),
  subscribeToNotificationTaps: jest.fn((handler: (data: Record<string, string>) => void) => {
    mockPush.handler = handler;
    return Promise.resolve(() => {});
  }),
  consumeLastNotificationTap: jest.fn(() => Promise.resolve(null)),
}));

// Home keeps its tour anchors while `anchorsShown` is set; leaving Home takes them away, as in the app.
const mockHome = { anchorsShown: true };
jest.mock('../app/(homeowner)/screens/HOHomeScreen', () => {
  const React = require('react');
  const { Pressable, Text, View: RNView } = require('react-native');
  const { useTourAnchor } = require('../src/components/tour');
  function Anchor({ id }: { id: string }) {
    const anchor = useTourAnchor(id);
    return React.createElement(RNView, { testID: `anchor-${id}`, ref: anchor.ref, onLayout: anchor.onLayout });
  }
  return {
    __esModule: true,
    default: ({ onNavigate }: { onNavigate: (screen: string, id?: string) => void }) =>
      React.createElement(
        RNView,
        { testID: 'home-stand-in' },
        mockHome.anchorsShown
          ? ['home.post', 'home.bell'].map((id) => React.createElement(Anchor, { key: id, id }))
          : null,
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: () => onNavigate('Job Applications', 'job-1') },
          React.createElement(Text, null, 'Open applications'),
        ),
      ),
  };
});

// A provider's Home, reduced to a line of text. The tour's tabs come from the App's own tab bar. Its setup card
// is the tour's first step for an unverified provider, so the card registers the home.setup anchor, as the real one does.
jest.mock('../app/(provider)/screens/SPHomeScreen', () => {
  const React = require('react');
  const { Text, View: RNView } = require('react-native');
  return {
    __esModule: true,
    default: () => {
      const { useTourAnchor } = require('../src/components/tour');
      const setupTour = useTourAnchor('home.setup', true);
      return React.createElement(
        RNView,
        { testID: 'provider-home-stand-in', ...setupTour },
        React.createElement(Text, null, 'Provider home'),
      );
    },
  };
});

// A provider's profile setup, reduced to a line of text: the finish card's "Finish my profile" opens it.
jest.mock('../app/(provider)/screens/SPEditProfileScreen', () => {
  const React = require('react');
  const { Text, View: RNView } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(RNView, { testID: 'edit-profile-stand-in' }, React.createElement(Text, null, 'Profile setup')),
  };
});

// A pushed screen with no tab bar, the one a tapped job proposal opens.
jest.mock('../app/(homeowner)/screens/HOJobApplicationsScreen', () => {
  const React = require('react');
  const { Text, View: RNView } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(RNView, { testID: 'job-applications-stand-in' }, React.createElement(Text, null, 'Applications')),
  };
});

// The intro cards, reduced to their last button.
jest.mock('../app/(auth)/screens/OnboardingScreen', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onFinish }: { onFinish: () => void }) =>
      React.createElement(Pressable, { accessibilityRole: 'button', onPress: onFinish }, React.createElement(Text, null, 'Show me around')),
  };
});

const measureSpy = (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow;

const PROFILE = {
  id: 'acct-1',
  full_name: 'Alex Ruiz',
  email: 'alex@example.com',
  role: 'client',
  // Created just now, so this account is a first run: intro cards, then the tour.
  created_at: new Date().toISOString(),
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

function signedOut() {
  return { ...signedIn(), session: null, profile: null, role: null, isAuthenticated: false };
}

/** A provider with no service profile yet: unverified, so Home has no availability toggle or feed search. */
function signedInProvider() {
  return { ...signedIn(), role: 'provider', providerProfile: null, isVerified: false };
}

beforeEach(async () => {
  jest.clearAllMocks();
  // Each launch starts with no flags: a finished intro or tour from an earlier test would skip the welcome.
  await AsyncStorage.clear();
  Object.assign(mockAuthState, signedIn());
  mockHome.anchorsShown = true;
  mockPush.handler = null;
  // Every control is measured at the same spot, so each step has a spotlight to show.
  measureSpy.mockReset();
  measureSpy.mockImplementation(function (callback: (...args: number[]) => void) {
    callback(16, 200, 120, 48);
  });
});

/** Lets the timers, frames and measurements of the welcome flow run. */
async function pass(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Taps Next until the spotlight tour is gone, letting each step's measurement run in between. */
async function tapThroughTour() {
  for (let i = 0; i < 12 && screen.queryByTestId('tour-next'); i++) {
    fireEvent.press(screen.getByTestId('tour-next'));
    await pass();
  }
}

/** A tapped notification for this account, as the push handler receives it. */
function tapNotification() {
  act(() => {
    mockPush.handler?.({ recipient_id: PROFILE.id, job_id: 'job-1', application_id: 'app-1', notification_id: 'n-1' });
  });
}

describe('welcome tour — a session that ends on its own', () => {
  it('takes the tour down with it, and a notification tapped afterwards is not held', async () => {
    const view = render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Show me around' }));
    expect(await screen.findByText('Start here')).toBeTruthy();

    // The server rejects the session in the background, so AuthContext clears the account by itself.
    Object.assign(mockAuthState, signedOut());
    view.rerender(<App />);
    await pass();

    expect(screen.queryByText('Start here')).toBeNull();
    expect(screen.queryByTestId('tour-card')).toBeNull();

    // The same account signs in again: no tour resumes, and a tapped notification opens straight away.
    Object.assign(mockAuthState, signedIn());
    view.rerender(<App />);
    expect(await screen.findByTestId('home-stand-in')).toBeTruthy();
    expect(screen.queryByText('Start here')).toBeNull();
    tapNotification();
    expect(await screen.findByTestId('job-applications-stand-in')).toBeTruthy();
  }, 15000);
});

describe('welcome tour — an unverified provider', () => {
  it('starts on the setup step on the Feed tab, not at the work tab', async () => {
    Object.assign(mockAuthState, signedInProvider());
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Show me around' }));

    expect(await screen.findByText('Finish setting up')).toBeTruthy();
    expect(screen.queryByText('Your work')).toBeNull();

    fireEvent.press(screen.getByTestId('tour-next'));
    expect(await screen.findByText('Your work')).toBeTruthy();
  }, 15000);

  it('ends on the finish card, whose main button opens the profile setup', async () => {
    Object.assign(mockAuthState, signedInProvider());
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Show me around' }));
    expect(await screen.findByText('Finish setting up')).toBeTruthy();
    await tapThroughTour();

    expect(await screen.findByTestId('tour-finish')).toBeTruthy();
    expect(screen.getByText('Add your address and bio')).toBeTruthy();
    fireEvent.press(screen.getByTestId('tour-finish-primary'));

    expect(await screen.findByTestId('edit-profile-stand-in')).toBeTruthy();
    expect(screen.queryByTestId('tour-finish')).toBeNull();
  }, 15000);

  it('offers the Get verified step once the address and bio are saved', async () => {
    Object.assign(mockAuthState, {
      ...signedInProvider(),
      profile: { ...PROFILE, address: 'Arturo Tanco Drive, Lipa' },
      providerProfile: { bio: 'Plumber for eight years', is_verified: false },
    });
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Show me around' }));
    expect(await screen.findByText('Finish setting up')).toBeTruthy();
    await tapThroughTour();

    expect(await screen.findByTestId('tour-finish')).toBeTruthy();
    expect(screen.queryByText('Add your address and bio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Get verified' })).toBeTruthy();
  }, 15000);
});

describe('welcome tour — notifications and the finish card', () => {
  it('holds a notification tapped during the welcome until the tour and its finish card are done', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Show me around' });
    // Tapped while the intro cards are still up.
    tapNotification();
    fireEvent.press(screen.getByRole('button', { name: 'Show me around' }));

    expect(await screen.findByText('Start here')).toBeTruthy();
    expect(screen.queryByTestId('job-applications-stand-in')).toBeNull();

    await tapThroughTour();
    expect(await screen.findByTestId('tour-finish')).toBeTruthy();
    expect(screen.queryByTestId('job-applications-stand-in')).toBeNull();

    fireEvent.press(screen.getByTestId('tour-finish-secondary'));
    expect(await screen.findByTestId('job-applications-stand-in')).toBeTruthy();
  }, 15000);

  it('shows the finish card over a pushed screen when the tour ends with Home gone', async () => {
    render(<App />);
    fireEvent.press(await screen.findByRole('button', { name: 'Show me around' }));
    expect(await screen.findByText('Start here')).toBeTruthy();

    // A pushed screen comes up over Home while the tour is running, so Home's anchors leave the screen.
    fireEvent.press(screen.getByRole('button', { name: 'Open applications' }));
    expect(await screen.findByTestId('job-applications-stand-in')).toBeTruthy();

    await tapThroughTour();

    expect(await screen.findByTestId('tour-finish')).toBeTruthy();
    expect(screen.getByTestId('job-applications-stand-in')).toBeTruthy();
  }, 15000);
});
