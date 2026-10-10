import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../../../../src/context/ThemeContext';
import HOSettingsScreen from '../HOSettingsScreen';
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
  render(<ThemeProvider><HOSettingsScreen onBack={jest.fn()} onLogout={jest.fn()} /></ThemeProvider>);

describe('HOSettingsScreen — Delete account confirm styling (code-review finding 5)', () => {
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

  it('renders the Delete my account button red, like the other destructive sheets', async () => {
    render(<ThemeProvider><HOSettingsScreen onBack={jest.fn()} onLogout={jest.fn()} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    fireEvent.press(screen.getByTestId('settings-delete-account-row'));

    await waitFor(() => expect(screen.getByLabelText('Delete my account')).toBeTruthy());

    const button = screen.getByLabelText('Delete my account');
    const flatStyle = ([] as Record<string, unknown>[]).concat(button.props.style).reduce(
      (acc: Record<string, unknown>, s: Record<string, unknown>) => ({ ...acc, ...s }),
      {},
    );
    expect(flatStyle.backgroundColor).toBe('#b91c1c');
  });

  it('hides Change password for a Google-only account', async () => {
    mockUseAuth.mockReturnValue({ profile: { has_password: false } });
    render(<ThemeProvider><HOSettingsScreen onBack={jest.fn()} onLogout={jest.fn()} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));
    expect(screen.queryByText('Change password')).toBeNull();
  });
});

describe('HOSettingsScreen — delete account', () => {
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

  it('deletes through the shared sheet and signs out once, after the delete succeeds', async () => {
    (api.deleteAccount as jest.Mock).mockResolvedValue(undefined);
    const onLogout = jest.fn();
    render(<ThemeProvider><HOSettingsScreen onBack={jest.fn()} onLogout={onLogout} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    fireEvent.press(screen.getByTestId('settings-delete-account-row'));
    expect(api.deleteAccount).not.toHaveBeenCalled();

    fireEvent.press(await screen.findByRole('button', { name: 'Delete my account' }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
  });
});

describe('HOSettingsScreen — layout', () => {
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

  it('omits the version line when the build does not report one', async () => {
    (appVersion as jest.Mock).mockReturnValue(null);
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));
    expect(screen.queryByText(/version/)).toBeNull();
  });

  it('saves a push change as a settings update', async () => {
    (api.updateSettings as jest.Mock).mockResolvedValue({});
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    fireEvent(screen.getByTestId('toggle-push_enabled'), 'valueChange', false);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ push_enabled: false }));
  });

  it('opens the language sheet, which says English is the only option for now', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId('toggle-push_enabled').props.disabled).toBe(false));

    fireEvent.press(screen.getByText('Language'));

    expect(await screen.findByText('More languages are coming soon.')).toBeTruthy();
  });
});

describe('HOSettingsScreen — every control has an accessible name', () => {
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
