import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import RegisterScreen from '../RegisterScreen';
import { useAuth } from '../../../../src/context/AuthContext';

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const baseProps = {
  onRegister: jest.fn(),
  onLogin: jest.fn(),
  onGoogleSignIn: jest.fn(),
};

describe('RegisterScreen — required-field asterisks (#15)', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  it('marks Full Name, Email, Password and Confirm Password as required (homeowner role)', () => {
    render(<RegisterScreen {...baseProps} />);

    // Each required label renders as "<Label>" followed by a nested " *" Text
    // node, so the label's full flattened text content is "<Label> *".
    for (const label of ['Full Name', 'Email Address', 'Password', 'Confirm Password']) {
      expect(screen.getByText(`${label} *`)).toBeTruthy();
    }

    // Skill Category (SP-only) must not appear for the homeowner role.
    expect(screen.queryByText(/Skill Category/)).toBeNull();
  });

  it('also marks Skill Category as required for the provider role', () => {
    render(<RegisterScreen {...baseProps} />);

    fireEvent.press(screen.getByText('Service Provider'));

    expect(screen.getByText('Skill Category *')).toBeTruthy();
  });
});

describe('RegisterScreen — skill category dropdown', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  it('selects a category when an option is tapped and closes the list', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Service Provider'));
    fireEvent.press(screen.getByText('Select your skill…'));
    fireEvent.press(screen.getByText('Plumbing'));

    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.queryByText('Cleaning')).toBeNull();
  });

  it('renders the options in normal layout flow, not absolutely positioned', () => {
    // An absolute list hangs outside its parent's bounds; Android drops taps there.
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Service Provider'));
    fireEvent.press(screen.getByText('Select your skill…'));

    let node: any = screen.getByText('Cleaning');
    while (node) {
      const style = StyleSheet.flatten(node.props?.style);
      expect(style?.position).not.toBe('absolute');
      node = node.parent;
    }
  });

  it('keeps the list open when a finger lands on an option, so the press can complete', () => {
    // A real tap fires touchStart (bubbles to ancestors) before onPress on release.
    // If an ancestor closes the list on touchStart, the option unmounts and onPress never fires.
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Service Provider'));
    fireEvent.press(screen.getByText('Select your skill…'));

    const option = screen.getByText('Plumbing');
    fireEvent(option, 'touchStart');

    expect(screen.getByText('Cleaning')).toBeTruthy();
    fireEvent.press(screen.getByText('Plumbing'));
    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.queryByText('Cleaning')).toBeNull();
    expect(screen.queryByText('Select your skill…')).toBeNull();
  });

  it('closes the list without selecting when the picker is tapped again', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Service Provider'));
    fireEvent.press(screen.getByText('Select your skill…'));
    expect(screen.getByText('Cleaning')).toBeTruthy();

    fireEvent.press(screen.getByText('Select your skill…'));

    expect(screen.queryByText('Cleaning')).toBeNull();
    expect(screen.getByText('Select your skill…')).toBeTruthy();
  });
});

it.each(['Homeowner', 'Service Provider'])('registers %s with three consents and no identity-processing signup field', async role => {
  const onRegister = jest.fn().mockResolvedValue({ needsEmailConfirmation: false });
  (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
  if (role === 'Service Provider') {
    fireEvent.press(screen.getByText(role));
    fireEvent.press(screen.getByText('Select your skill…'));
    fireEvent.press(screen.getByText('Plumbing'));
  }
  fireEvent.changeText(screen.getByTestId('input-name'), 'Test User');
  fireEvent.changeText(screen.getByTestId('input-email'), 'test@example.test');
  fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
  fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password123');
  fireEvent.press(screen.getByTestId('chk-terms'));
  fireEvent.press(screen.getByText('I agree to the Terms & Conditions'));
  fireEvent.press(screen.getByTestId('chk-privacy'));
  expect(screen.getByText('Your Rights (RA 10173)')).toBeTruthy();
  fireEvent.press(screen.getByText('I agree to the Privacy Policy'));
  fireEvent.press(screen.getByTestId('chk-data-collection'));
  expect(screen.queryByTestId('chk-biometric')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Sign Up')));
  expect(onRegister).toHaveBeenCalledWith(expect.objectContaining({
    consentedTerms: true, consentedPrivacy: true, consentedDataCollection: true,
  }));
  expect(onRegister.mock.calls[0][0]).not.toHaveProperty('consentedBiometric');
});
