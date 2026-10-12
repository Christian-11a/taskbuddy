import React from 'react';
import { StyleSheet } from 'react-native';
import { CircleCheckBig } from 'lucide-react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationCard, { type NotificationCardProps } from '../NotificationCard';
import { ThemeProvider } from '../../../context/ThemeContext';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../lib/api';
import { contrastRatio } from '../../../constants/contrast';
import {
  darkPalette, lightPalette, providerDarkPalette, providerLightPalette, type Palette,
} from '../../../constants/palettes';
import type { NotificationTone } from '../../../lib/notificationPresentation';

jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/api', () => ({ api: { settings: jest.fn() } }));

const TONES: NotificationTone[] = ['info', 'success', 'danger'];

// The solid colour each tone's tile must use, read from the palette tokens.
const SOLID: Record<NotificationTone, (p: Palette) => string> = {
  info: (p) => p.Colors.primary,
  success: (p) => p.Colors.successSolid,
  danger: (p) => p.Colors.dangerSolid,
};

const card = (overrides: Partial<NotificationCardProps> = {}): NotificationCardProps => ({
  title: 'Application accepted',
  body: 'Juan accepted your offer',
  time: '2h ago',
  tone: 'info',
  icon: CircleCheckBig,
  unread: false,
  onPress: jest.fn(),
  onDelete: jest.fn(),
  ...overrides,
});

const tileStyle = () => StyleSheet.flatten(screen.getByTestId('notification-tile').props.style);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe.each([
  ['homeowner light', 'homeowner', false, lightPalette],
  ['homeowner dark', 'homeowner', true, darkPalette],
  ['provider light (navy)', 'provider', false, providerLightPalette],
  ['provider dark (navy)', 'provider', true, providerDarkPalette],
] as const)('%s', (_name, role, dark, palette) => {
  it.each(TONES)('%s tone: a solid 44 dp circle with a white 22 dp icon, at least 4.5:1', async (tone) => {
    (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'me', role } });
    (api.settings as jest.Mock).mockResolvedValue({ dark_mode: dark });
    render(<ThemeProvider><NotificationCard {...card({ tone })} /></ThemeProvider>);
    // The provider reads the saved appearance, then the server's setting; let both land.
    await waitFor(() => expect(api.settings).toHaveBeenCalled());
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

    const solid = SOLID[tone](palette);
    expect(tileStyle().backgroundColor).toBe(solid);
    expect(tileStyle()).toMatchObject({ width: 44, height: 44, borderRadius: 22 });

    const icon = screen.UNSAFE_getByType(CircleCheckBig);
    expect(icon.props).toMatchObject({ color: '#ffffff', size: 22, strokeWidth: 2.25 });
    expect(contrastRatio(icon.props.color, solid)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the rest of the card', () => {
  it('is one labelled button that says Unread while the notification is new', () => {
    render(<NotificationCard {...card({ unread: true })} />);
    expect(screen.getByLabelText('Application accepted. Juan accepted your offer. 2h ago. Unread')).toBeTruthy();
    expect(screen.getByTestId('unread-dot')).toBeTruthy();
  });

  it('shows no unread dot once read', () => {
    render(<NotificationCard {...card()} />);
    expect(screen.queryByTestId('unread-dot')).toBeNull();
  });

  it('opens on press, and its trash button deletes without opening', () => {
    const onPress = jest.fn();
    const onDelete = jest.fn();
    render(<NotificationCard {...card({ onPress, onDelete })} />);
    fireEvent.press(screen.getByLabelText('Delete notification: Application accepted'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Application accepted. Juan accepted your offer. 2h ago'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
