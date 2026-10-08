import React from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import FilterPill from '../FilterPill';
import { ThemeProvider } from '../../../context/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import { contrastRatio } from '../../../constants/contrast';
import {
  darkPalette,
  lightPalette,
  providerDarkPalette,
  providerLightPalette,
  type Palette,
} from '../../../constants/palettes';

jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/api', () => ({ api: { settings: jest.fn() } }));

/** The colours a host element is drawn with: its style, flattened. */
function styleOf(element: { props: Record<string, any> }): Record<string, any> {
  return StyleSheet.flatten(element.props.style) ?? {};
}

/** Homeowner and provider, in light and dark. */
const CASES: [string, 'homeowner' | 'provider', boolean, Palette][] = [
  ['homeowner, light', 'homeowner', false, lightPalette],
  ['homeowner, dark', 'homeowner', true, darkPalette],
  ['provider, light', 'provider', false, providerLightPalette],
  ['provider, dark', 'provider', true, providerDarkPalette],
];

async function renderPill(ui: React.ReactElement, role: 'homeowner' | 'provider', dark: boolean) {
  (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'user-1', role } });
  (api.settings as jest.Mock).mockResolvedValue({ dark_mode: dark });
  const view = render(<ThemeProvider>{ui}</ThemeProvider>);
  // The saved appearance loads after mount; let it land inside act.
  await act(async () => {});
  return view;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

it.each(CASES)('the selected pill shows its label and count in onPrimary on primary (%s)', async (_name, role, dark, palette) => {
  await renderPill(<FilterPill label="All" count={13} selected onPress={jest.fn()} />, role, dark);

  // The saved appearance loads after mount; wait for this palette.
  await waitFor(() => expect(styleOf(screen.getByRole('button', { name: 'All, 13' })).backgroundColor).toBe(palette.Colors.primary));
  expect(styleOf(screen.getByText('All')).color).toBe(palette.Colors.onPrimary);
  expect(styleOf(screen.getByText('13')).color).toBe(palette.Colors.onPrimary);
  expect(contrastRatio(palette.Colors.onPrimary, palette.Colors.primary)).toBeGreaterThanOrEqual(4.5);
});

it.each(CASES)('a pill that is picked turns its label and count to onPrimary on primary (%s)', async (_name, role, dark, palette) => {
  const onPress = jest.fn();
  const view = await renderPill(<FilterPill label="Booked" count={2} selected={false} onPress={onPress} />, role, dark);
  await waitFor(() => expect(styleOf(screen.getByRole('button', { name: 'Booked, 2' })).backgroundColor).toBe(palette.V6Colors.surface));

  view.rerender(
    <ThemeProvider>
      <FilterPill label="Booked" count={2} selected onPress={onPress} />
    </ThemeProvider>,
  );

  expect(styleOf(screen.getByRole('button', { name: 'Booked, 2' })).backgroundColor).toBe(palette.Colors.primary);
  expect(styleOf(screen.getByText('Booked')).color).toBe(palette.Colors.onPrimary);
  expect(styleOf(screen.getByText('2')).color).toBe(palette.Colors.onPrimary);
});

it('a pill is recreated when it is picked, so Android repaints its background and text', async () => {
  const onPress = jest.fn();
  const view = await renderPill(<FilterPill label="Booked" count={2} selected={false} onPress={onPress} />, 'homeowner', false);
  const before = screen.getByRole('button', { name: 'Booked, 2' });

  view.rerender(
    <ThemeProvider>
      <FilterPill label="Booked" count={2} selected onPress={onPress} />
    </ThemeProvider>,
  );

  expect(screen.getByRole('button', { name: 'Booked, 2' })).not.toBe(before);
});
