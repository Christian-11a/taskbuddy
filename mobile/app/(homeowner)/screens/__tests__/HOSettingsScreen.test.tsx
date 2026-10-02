import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOSettingsScreen from '../HOSettingsScreen';
import { api } from '../../../../src/lib/api';

const mockUseAuth = jest.fn(() => ({ profile: { has_password: true } }));
jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

jest.mock('../../../../src/lib/api', () => ({
  api: {
    settings: jest.fn(),
    updateSettings: jest.fn(),
    deleteAccount: jest.fn(),
  },
}));

describe('HOSettingsScreen — Delete Account confirm styling (code-review finding 5)', () => {
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

  it('renders the Delete Account confirm button red, like the other destructive dialogs', async () => {
    render(<HOSettingsScreen onBack={jest.fn()} onLogout={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-delete-account-row'));

    await waitFor(() => expect(screen.getByLabelText('Delete Account')).toBeTruthy());

    const button = screen.getByLabelText('Delete Account');
    const flatStyle = ([] as Record<string, unknown>[]).concat(button.props.style).reduce(
      (acc: Record<string, unknown>, s: Record<string, unknown>) => ({ ...acc, ...s }),
      {},
    );
    expect(flatStyle.backgroundColor).toBe('#b91c1c');
  });

  it('hides Change Password for a Google-only account', () => {
    mockUseAuth.mockReturnValue({ profile: { has_password: false } });
    render(<HOSettingsScreen onBack={jest.fn()} onLogout={jest.fn()} />);
    expect(screen.queryByText('Change Password')).toBeNull();
  });
});
