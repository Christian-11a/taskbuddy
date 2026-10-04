import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme, lightPalette, darkPalette } from '../ThemeContext';
import { api } from '../../lib/api';
import { useAuth } from '../AuthContext';
import RegisterScreen from '../../../app/(auth)/screens/RegisterScreen';
import ConfirmationModal from '../../components/ConfirmationModal';
import PortfolioGallery from '../../components/PortfolioGallery';
import ScreenFrame from '../../components/ScreenFrame';
import SPSettingsScreen from '../../../app/(provider)/screens/SPSettingsScreen';
import HOSettingsScreen from '../../../app/(homeowner)/screens/HOSettingsScreen';
import { jobStatusMeta, urgencyMeta } from '../../lib/format';

jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/api', () => ({ api: { settings: jest.fn(), updateSettings: jest.fn() } }));
function Controls() {
  const { dark, error, setDark } = useTheme();
  return <><Text testID="mode">{String(dark)}</Text><Text>{error}</Text>
    <TouchableOpacity onPress={() => setDark(!dark)}><Text>Switch theme</Text></TouchableOpacity></>;
}
beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (useAuth as jest.Mock).mockReturnValue({ profile: null, verifyEmailOtp: jest.fn() });
  (api.settings as jest.Mock).mockResolvedValue({ dark_mode: false });
});
it('updates mounted signup inputs, shared dialog, gallery and frame and preserves readable button labels', async () => {
  render(<ThemeProvider><Controls /><ScreenFrame>
    <RegisterScreen onRegister={jest.fn()} onLogin={jest.fn()} onGoogleSignIn={jest.fn()} />
    <PortfolioGallery entries={[]} />
    <ConfirmationModal visible title="Shared dialog" message="Confirm something" onCancel={jest.fn()} onConfirm={jest.fn()} />
  </ScreenFrame></ThemeProvider>);
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalled());
  const caption = () => StyleSheet.flatten(screen.getByText('No portfolio photos yet.').props.style).color;
  expect(caption()).toBe(lightPalette.V6Colors.ink500);
  fireEvent.press(screen.getByText('Switch theme'));
  expect(caption()).toBe(darkPalette.V6Colors.ink500);
  expect(screen.getByTestId('input-email').props.keyboardAppearance).toBe('dark');
  expect(StyleSheet.flatten(screen.getByText('Shared dialog').props.style).color).toBe(darkPalette.V6Colors.ink900);
  fireEvent.press(screen.getByText('Switch theme'));
  expect(caption()).toBe(lightPalette.V6Colors.ink500);
  expect(screen.getByTestId('input-email').props.keyboardAppearance).toBe('light');
});
it('restores signed-out appearance on restart and persists toggles', async () => {
  await AsyncStorage.setItem('taskbuddy:dark-mode', 'true');
  render(<ThemeProvider><Controls /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('mode').props.children).toBe('true'));
  fireEvent.press(screen.getByText('Switch theme'));
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('taskbuddy:dark-mode', 'false'));
});
it('ignores a late server preference read after a newer toggle', async () => {
  let resolve!: (value: {dark_mode: boolean}) => void;
  (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'first' } });
  (api.settings as jest.Mock).mockReturnValue(new Promise(r => { resolve = r; }));
  render(<ThemeProvider><Controls /></ThemeProvider>);
  await waitFor(() => expect(api.settings).toHaveBeenCalled());
  fireEvent.press(screen.getByText('Switch theme'));
  await act(async () => resolve({dark_mode: false}));
  expect(screen.getByTestId('mode').props.children).toBe('true');
});
it('uses the new account preference and ignores the previous account response', async () => {
  let resolveFirst!: (value: {dark_mode: boolean}) => void;
  (useAuth as jest.Mock).mockReturnValue({profile: {id: 'first'}});
  (api.settings as jest.Mock).mockReturnValueOnce(new Promise(r => {resolveFirst = r;})).mockResolvedValue({dark_mode: true});
  const view = render(<ThemeProvider><Controls /></ThemeProvider>);
  await waitFor(() => expect(api.settings).toHaveBeenCalledTimes(1));
  (useAuth as jest.Mock).mockReturnValue({profile: {id: 'second'}});
  view.rerender(<ThemeProvider><Controls /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('mode').props.children).toBe('true'));
  await act(async () => resolveFirst({dark_mode: false}));
  expect(screen.getByTestId('mode').props.children).toBe('true');
});
it('surfaces storage and settings failures', async () => {
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('Appearance storage unavailable'));
  render(<ThemeProvider><Controls /></ThemeProvider>);
  expect(await screen.findByText('Appearance storage unavailable')).toBeTruthy();
});
it('provides separate readable status surfaces in both palettes', () => {
  for (const palette of [lightPalette, darkPalette]) {
    expect(jobStatusMeta('confirmed', palette.V6Colors)).toMatchObject({color: palette.V6Colors.infoText, bg: palette.V6Colors.infoSurface});
    expect(urgencyMeta('urgent', palette.V6Colors)).toMatchObject({color: palette.V6Colors.dangerText, bg: palette.V6Colors.dangerSurface});
  }
});

it.each([HOSettingsScreen, SPSettingsScreen])('settings toggles the whole app and rolls appearance back on failed persistence', async Settings => {
  (useAuth as jest.Mock).mockReturnValue({profile: { id: 'account', has_password: true }});
  let reject!: (error: Error) => void;
  (api.updateSettings as jest.Mock).mockReturnValue(new Promise((_resolve, r) => {reject = r;}));
  render(<ThemeProvider><Controls /><Settings onBack={jest.fn()} onLogout={jest.fn()} /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('toggle-dark-mode').props.disabled).toBe(false));
  fireEvent(screen.getByTestId('toggle-dark-mode'), 'valueChange', true);
  expect(screen.getByTestId('mode').props.children).toBe('true');
  expect(api.updateSettings).toHaveBeenCalledWith({dark_mode: true});
  await act(async () => reject(new Error('Could not save appearance')));
  expect(screen.getByTestId('mode').props.children).toBe('false');
  expect(screen.getByText('Could not save appearance')).toBeTruthy();
});
it('loads the authoritative account appearance and shows settings read failures', async () => {
  (useAuth as jest.Mock).mockReturnValue({profile: { id: 'account' }});
  (api.settings as jest.Mock).mockResolvedValueOnce({dark_mode: true});
  const view = render(<ThemeProvider><Controls /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('mode').props.children).toBe('true'));
  (useAuth as jest.Mock).mockReturnValue({profile: { id: 'next-account' }});
  (api.settings as jest.Mock).mockRejectedValueOnce(new Error('Could not load appearance'));
  view.rerender(<ThemeProvider><Controls /></ThemeProvider>);
  expect(await screen.findByText('Could not load appearance')).toBeTruthy();
});
it('surfaces failure to persist the device preference', async () => {
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Could not store appearance'));
  render(<ThemeProvider><Controls /></ThemeProvider>);
  expect(await screen.findByText('Could not store appearance')).toBeTruthy();
});

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const values = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
it.each([lightPalette, darkPalette])('keeps semantic text and solid action labels readable', palette => {
  const c = palette.V6Colors;
  for (const [text, background] of [
    [c.ink900, c.surface], [c.ink500, c.surface], [c.link, c.surface],
    [c.dangerText, c.dangerSurface], [c.successText, c.successSurface],
    [c.warningText, c.warningSurface], [c.infoText, c.infoSurface],
    [c.purpleText, c.purpleSurface], [c.onPrimary, c.cyan700],
    [c.onPrimary, c.dangerSolid], [c.onPrimary, c.successSolid],
  ]) expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
});
it.each([HOSettingsScreen, SPSettingsScreen])('disables unknown settings after a read failure and recovers through retry', async Settings => {
  (useAuth as jest.Mock).mockReturnValue({profile: {id: 'account', has_password: true}});
  (api.settings as jest.Mock).mockRejectedValue(new Error('Settings unavailable'));
  render(<ThemeProvider><Controls /><Settings onBack={jest.fn()} onLogout={jest.fn()} /></ThemeProvider>);
  await screen.findAllByText('Settings unavailable');
  expect(screen.getByTestId('toggle-dark-mode').props.disabled).toBe(true);
  (api.settings as jest.Mock).mockResolvedValue({dark_mode: true, push_enabled: true, email_enabled: true, sms_enabled: false});
  fireEvent.press(screen.getByLabelText('Retry settings'));
  await waitFor(() => expect(screen.getByTestId('toggle-dark-mode').props.disabled).toBe(false));
  expect(screen.getByTestId('mode').props.children).toBe('true');
  expect(screen.queryByLabelText('Retry settings')).toBeNull();
});
it('retains the device appearance when signing out', async () => {
  (useAuth as jest.Mock).mockReturnValue({profile: {id: 'account'}});
  (api.settings as jest.Mock).mockResolvedValue({dark_mode: true});
  const view = render(<ThemeProvider><Controls /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('mode').props.children).toBe('true'));
  (useAuth as jest.Mock).mockReturnValue({profile: null});
  view.rerender(<ThemeProvider><Controls /></ThemeProvider>);
  expect(screen.getByTestId('mode').props.children).toBe('true');
});
it('reports a corrupt stored preference without overwriting it with a guessed default', async () => {
  await AsyncStorage.setItem('taskbuddy:dark-mode', 'invalid');
  render(<ThemeProvider><Controls /></ThemeProvider>);
  expect(await screen.findByText('Invalid saved appearance preference.')).toBeTruthy();
  expect(await AsyncStorage.getItem('taskbuddy:dark-mode')).toBe('invalid');
});
