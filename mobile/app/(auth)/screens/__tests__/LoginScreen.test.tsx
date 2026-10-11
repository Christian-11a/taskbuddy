import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';

type Props = React.ComponentProps<typeof LoginScreen>;

function renderLogin(overrides: Partial<Props> = {}) {
  const props: Props = {
    onLogin: jest.fn().mockResolvedValue(undefined),
    onGoogleSignIn: jest.fn().mockResolvedValue(undefined),
    onSignUp: jest.fn(),
    onForgotPassword: jest.fn(),
    ...overrides,
  };
  render(<LoginScreen {...props} />);
  return props;
}

describe('LoginScreen', () => {
  it('shows the welcome line and the email and password fields', () => {
    renderLogin();

    expect(screen.getByText('Welcome back')).toBeTruthy();
    expect(screen.getByText('Sign in to your TaskBuddy account')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('asks for an email and a password before calling the API', () => {
    const props = renderLogin();

    fireEvent.press(screen.getByTestId('btn-sign-in'));

    expect(screen.getByText('Enter your email address')).toBeTruthy();
    expect(screen.getByText('Please enter your password.')).toBeTruthy();
    expect(props.onLogin).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling the API', () => {
    const props = renderLogin();

    fireEvent.changeText(screen.getByTestId('input-email'), 'not-an-email');
    fireEvent.changeText(screen.getByTestId('input-password'), 'anything');
    fireEvent.press(screen.getByTestId('btn-sign-in'));

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(props.onLogin).not.toHaveBeenCalled();
  });

  it('shows the email message once the email field is left, not while typing', () => {
    renderLogin();

    fireEvent.changeText(screen.getByTestId('input-email'), 'owner@');
    expect(screen.queryByText('Enter a valid email address')).toBeNull();

    fireEvent(screen.getByTestId('input-email'), 'blur');
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
  });

  it('signs in with the email trimmed of the spaces around it', async () => {
    const props = renderLogin();

    fireEvent.changeText(screen.getByTestId('input-email'), '  owner@example.test  ');
    fireEvent.changeText(screen.getByTestId('input-password'), 'correct horse');
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-sign-in'));
    });

    expect(props.onLogin).toHaveBeenCalledWith('owner@example.test', 'correct horse');
  });

  it('signs in with the typed email and password exactly as entered', async () => {
    const props = renderLogin();

    fireEvent.changeText(screen.getByTestId('input-email'), 'owner@example.test');
    fireEvent.changeText(screen.getByTestId('input-password'), 'correct horse');
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-sign-in'));
    });

    expect(props.onLogin).toHaveBeenCalledTimes(1);
    expect(props.onLogin).toHaveBeenCalledWith('owner@example.test', 'correct horse');
  });

  it('shows the message from a failed sign-in', async () => {
    renderLogin({ onLogin: jest.fn().mockRejectedValue(new Error('Incorrect email or password.')) });

    fireEvent.changeText(screen.getByTestId('input-email'), 'owner@example.test');
    fireEvent.changeText(screen.getByTestId('input-password'), 'wrong');
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-sign-in'));
    });

    expect(screen.getByTestId('login-error')).toBeTruthy();
    expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
  });

  it('shows a sign-in error that was handed in from outside the screen', () => {
    renderLogin({ signInError: 'Google sign-in did not finish.' });

    expect(screen.getByText('Google sign-in did not finish.')).toBeTruthy();
  });

  it('opens forgot-password and create-account from their links', () => {
    const props = renderLogin();

    fireEvent.press(screen.getByText('Forgot password?'));
    fireEvent.press(screen.getByText('Create an account'));

    expect(props.onForgotPassword).toHaveBeenCalledTimes(1);
    expect(props.onSignUp).toHaveBeenCalledTimes(1);
  });

  it('starts Google sign-in from the Continue with Google button', async () => {
    const props = renderLogin();

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-google'));
    });

    expect(props.onGoogleSignIn).toHaveBeenCalledTimes(1);
  });
});

describe('LoginScreen — a spaces-only password', () => {
  it('treats a password made only of spaces as no password, and does not call the API', () => {
    const props = renderLogin();

    fireEvent.changeText(screen.getByTestId('input-email'), 'owner@example.test');
    fireEvent.changeText(screen.getByTestId('input-password'), '        ');
    fireEvent.press(screen.getByTestId('btn-sign-in'));

    expect(screen.getByText('Please enter your password.')).toBeTruthy();
    expect(props.onLogin).not.toHaveBeenCalled();
  });
});
