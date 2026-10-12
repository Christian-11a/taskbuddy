import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { lightPalette, darkPalette, providerLightPalette, providerDarkPalette } from '../../constants/palettes';
import { contrastRatio } from '../../constants/contrast';
import { useAuth } from '../AuthContext';
import { api } from '../../lib/api';

jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/api', () => ({ api: { settings: jest.fn() } }));

function Probe() {
  const { palette, dark, setDark } = useTheme();
  return <><Text testID="primary">{palette.Colors.primary}</Text>
    <TouchableOpacity onPress={() => setDark(!dark)}><Text>toggle</Text></TouchableOpacity></>;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (api.settings as jest.Mock).mockResolvedValue({ dark_mode: false });
});

it('homeowners keep the blue palette in light and dark', async () => {
  (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'h1', role: 'homeowner' } });
  render(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('primary').props.children).toBe(lightPalette.Colors.primary));
  fireEvent.press(screen.getByText('toggle'));
  expect(screen.getByTestId('primary').props.children).toBe(darkPalette.Colors.primary);
});

it('signed-out screens use the blue palette', async () => {
  (useAuth as jest.Mock).mockReturnValue({ profile: null });
  render(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('primary').props.children).toBe(lightPalette.Colors.primary));
});

it('providers get navy accents in light and dark', async () => {
  (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'p1', role: 'provider' } });
  render(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(screen.getByTestId('primary').props.children).toBe(providerLightPalette.Colors.primary));
  fireEvent.press(screen.getByText('toggle'));
  expect(screen.getByTestId('primary').props.children).toBe(providerDarkPalette.Colors.primary);
});

it('provider palettes only change brand roles', () => {
  expect(providerLightPalette.Colors.successText).toBe(lightPalette.Colors.successText);
  expect(providerLightPalette.V6Colors.canvas).toBe(lightPalette.V6Colors.canvas);
  expect(providerDarkPalette.V6Colors.surface).toBe(darkPalette.V6Colors.surface);
  expect(providerLightPalette.Colors.primary).not.toBe(lightPalette.Colors.primary);
});

it('provider text colors stay readable', () => {
  for (const p of [providerLightPalette, providerDarkPalette]) {
    expect(contrastRatio(p.V6Colors.link, p.V6Colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.Colors.link, p.Colors.cardBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.Colors.onPrimary, p.Colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.Colors.primaryDeep, p.Colors.primaryTonal)).toBeGreaterThanOrEqual(4.5);
  }
});
