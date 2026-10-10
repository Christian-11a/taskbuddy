import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../../../src/context/ThemeContext';
import SPSettingsScreen from '../SPSettingsScreen';
import { api } from '../../../../src/lib/api';
import { appVersion } from '../../../../src/lib/appVersion';

const mockUseAuth = jest.fn(() => ({ profile: { has_password: true } }));
jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

jest.mock('../../../../src/lib/appVersion', () => ({ appVersion: jest.fn(() => '1.0.0') }));

jest.mock('../../../../src/lib/api', () => ({
  api: {
    settings: jest.fn(),
    updateSettings: jest.fn(),
    deleteAccount: jest.fn(),
  },
}));

const renderScreen = () =>
  render(<ThemeProvider><SPSettingsScreen onBack={jest.fn()} onLogout={jest.fn()} /></ThemeProvider>);

describe('SPSettingsScreen — layout (same as the homeowner Settings)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ profile: { has_password: true } });
    (api.settings as jest.Mock).mockResolvedValue({
      push_enabled: true,
      email_enabled: true,
      sms_enabled: false,
      location_sharing: true,
      dark_mode: false,
    });
    (appVersion as jest.Mock).mockReturnValue('1.0.0');
  });

  it('groups the switches under Appearance and Notifications, each with a short hint', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Easier on the eyes at night')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Push notifications')).toBeTruthy();
    expect(screen.getByText('Proposals, bookings and messages')).toBeTruthy();
  });

  it('drops the email and SMS switches, which nothing on the server reads', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    expect(screen.queryByTestId('toggle-email_enabled')).toBeNull();
    expect(screen.queryByTestId('toggle-sms_enabled')).toBeNull();
    expect(screen.queryByText('Email Updates')).toBeNull();
    expect(screen.queryByText('SMS Alerts')).toBeNull();
  });

  it('lists Change password and Language with its current value, then a lone Delete account row', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    expect(screen.getByText('Change password')).toBeTruthy();
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByTestId('settings-delete-account-row')).toBeTruthy();
    expect(screen.getByText('Delete account')).toBeTruthy();
  });

  it('shows the app version at the bottom', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));
    expect(screen.getByText('TaskBuddy · version 1.0.0')).toBeTruthy();
  });

  it('opens the delete sheet from the Delete account row without calling the API', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    fireEvent.press(screen.getByTestId('settings-delete-account-row'));

    expect(await screen.findByText('Delete your account?')).toBeTruthy();
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });
});

describe('SPSettingsScreen — every control has an accessible name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ profile: { has_password: true } });
    (api.settings as jest.Mock).mockResolvedValue({
      push_enabled: true,
      email_enabled: true,
      sms_enabled: false,
      location_sharing: true,
      dark_mode: false,
    });
  });

  it('names the back arrow, the switches and the account rows', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });
});
