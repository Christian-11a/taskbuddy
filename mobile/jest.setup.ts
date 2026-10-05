/**
 * Global Jest setup, run once per test file after the test framework is
 * installed. Keep this to environment shims every test needs — screen- or
 * component-specific mocks belong in the test file itself.
 */

import { configure } from '@testing-library/react-native';

// RNTL's waitFor/findBy default to a 1000ms timeout, which is tight enough
// that a slow dev machine (or a busy CI runner) can time out a `waitFor` on
// legitimately-resolved-but-not-yet-flushed state, failing a correct test.
// Raise it project-wide rather than passing { timeout } to every call site.
configure({ asyncUtilTimeout: 5000 });

// react-native-safe-area-context's hooks read a SafeAreaProvider from React
// context. Tests render screens without mounting <SafeAreaProvider> (that's
// App.tsx's job in the real app), so without this every screen that reads
// insets (useSafeAreaInsets, or hooks built on it like useAuthLayout) throws
// "No safe area value available" instead of rendering.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 375, height: 812 };
  return {
    ...actual,
    SafeAreaProvider: actual.SafeAreaProvider,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
  };
});

// UI-redesign libraries ship their own Jest mocks; Reanimated/Worklets need
// them because their native runtime doesn't exist under Jest.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
require('react-native-gesture-handler/jestSetup');
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('lottie-react-native', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: Record<string, unknown>) => require('react').createElement(View, props) };
});

// Appearance and session persistence use the existing native AsyncStorage module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
