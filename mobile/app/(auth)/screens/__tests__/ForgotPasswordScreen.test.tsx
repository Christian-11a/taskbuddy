import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import ForgotPasswordScreen from '../ForgotPasswordScreen';
import { useAuth } from '../../../../src/context/AuthContext';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../../../src/lib/api', () => ({ api: { forgotPassword: jest.fn() } }));

const EMAIL = 'taskbuddy.homeowner@example.com';

let resetPassword: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetPassword = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ resetPassword });
  (api.forgotPassword as jest.Mock).mockResolvedValue(undefined);
});

/** Types the address (with stray spaces) and asks for the code. */
async function requestCode() {
  fireEvent.changeText(screen.getByLabelText('Email'), `  ${EMAIL}  `);
  await act(async () => {
    fireEvent.press(screen.getByText('Send reset code'));
  });
}

/** What the hidden code input reports when the person types or pastes. */
function reportCodeText(text: string) {
  fireEvent.changeText(screen.getByLabelText('Reset code'), text);
}

async function pressVerify() {
  await act(async () => {
    fireEvent.press(screen.getByText('Verify code'));
  });
}

function boxAt(index: number) {
  return screen.getByTestId(`reset-code-box-${index}`);
}

describe('ForgotPasswordScreen — requesting the code', () => {
  it('sends the trimmed address, then asks for the code with the address masked', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);

    await requestCode();

    expect(api.forgotPassword).toHaveBeenCalledWith(EMAIL);
    expect(screen.getByText('Enter the 6-digit code')).toBeTruthy();
    expect(screen.getByText(/ta•••r@example\.com has an account/)).toBeTruthy();
  });

  it('shows the resend cooldown in minutes and seconds', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);

    await requestCode();

    expect(screen.getByText('Resend in 1:00')).toBeTruthy();
  });

  it('asks for an address before sending anything', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByText('Send reset code'));
    });

    expect(screen.getByText('Enter your email address')).toBeTruthy();
    expect(api.forgotPassword).not.toHaveBeenCalled();
  });

  it('refuses a malformed address under the field before sending anything', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'taskbuddy@example');

    await act(async () => {
      fireEvent.press(screen.getByText('Send reset code'));
    });

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(api.forgotPassword).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordScreen — the six code boxes', () => {
  it('fills the boxes one after another as digits are typed', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    await requestCode();

    reportCodeText('48');

    expect(within(boxAt(0)).getByText('4')).toBeTruthy();
    expect(within(boxAt(1)).getByText('8')).toBeTruthy();
    expect(within(boxAt(2)).queryByText(/\d/)).toBeNull();
  });

  it('backspace clears the last digit and moves back to its box', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    await requestCode();
    reportCodeText('4829');

    reportCodeText('482');

    expect(within(boxAt(2)).getByText('2')).toBeTruthy();
    expect(within(boxAt(3)).queryByText(/\d/)).toBeNull();
  });

  it('a pasted code fills all six boxes', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    await requestCode();

    reportCodeText('482931');

    ['4', '8', '2', '9', '3', '1'].forEach((digit, i) => {
      expect(within(boxAt(i)).getByText(digit)).toBeTruthy();
    });
  });

  it('Verify code needs all six digits before it moves on', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    await requestCode();
    reportCodeText('4829');

    await pressVerify();

    expect(screen.getByText('Enter the 6-digit code from your email.')).toBeTruthy();
    expect(screen.queryByText('Choose a new password')).toBeNull();
  });
});

describe('ForgotPasswordScreen — the new password', () => {
  it('resets the password once, with the code and the new password', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    await requestCode();
    reportCodeText('482931');
    await pressVerify();
    expect(screen.getByText('Choose a new password')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('New password'), 'password123');
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'password123');
    await act(async () => {
      fireEvent.press(screen.getByText('Reset password'));
    });

    expect(resetPassword).toHaveBeenCalledTimes(1);
    expect(resetPassword).toHaveBeenCalledWith({ email: EMAIL, token: '482931', newPassword: 'password123' });
  });

  it('refuses passwords that do not match and does not reset', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    await requestCode();
    reportCodeText('482931');
    await pressVerify();
    fireEvent.changeText(screen.getByLabelText('New password'), 'password123');
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'password124');

    await act(async () => {
      fireEvent.press(screen.getByText('Reset password'));
    });

    expect(screen.getByText('Those passwords do not match.')).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('refuses a new password shorter than eight characters', async () => {
    render(<ForgotPasswordScreen onBackToLogin={jest.fn()} />);
    await requestCode();
    reportCodeText('482931');
    await pressVerify();
    fireEvent.changeText(screen.getByLabelText('New password'), 'short');
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'short');

    await act(async () => {
      fireEvent.press(screen.getByText('Reset password'));
    });

    expect(screen.getByText('New password must be at least 8 characters.')).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
