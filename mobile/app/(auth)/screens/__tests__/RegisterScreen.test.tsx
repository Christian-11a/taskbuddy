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

const HOMEOWNER_CARD = 'I need help at home';
const PROVIDER_CARD = 'I want to work';

/** Picks a role card and presses Continue to reach the details form. */
function chooseRole(card: typeof HOMEOWNER_CARD | typeof PROVIDER_CARD) {
  fireEvent.press(screen.getByText(card));
  fireEvent.press(screen.getByText('Continue'));
}

/** Scrolls the open document to its end (400 dp viewport over 1400 dp of text), then taps its I agree. */
function agreeTo(doc: 'Terms & Conditions' | 'Privacy Policy') {
  fireEvent.scroll(screen.getByTestId('terms-body'), {
    nativeEvent: { contentOffset: { y: 1000 }, layoutMeasurement: { height: 400 }, contentSize: { height: 1400 } },
  });
  fireEvent.press(screen.getByText(`I agree to the ${doc}`));
}

describe('RegisterScreen — role step', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  it('asks how the person will use TaskBuddy with both role cards and a Continue button', () => {
    render(<RegisterScreen {...baseProps} />);

    expect(screen.getByText('How will you use TaskBuddy?')).toBeTruthy();
    expect(screen.getByText("You can't switch later, so pick the one that fits.")).toBeTruthy();
    expect(screen.getByText(HOMEOWNER_CARD)).toBeTruthy();
    expect(screen.getByText(PROVIDER_CARD)).toBeTruthy();
    expect(screen.getByText('Client')).toBeTruthy();
    expect(screen.queryByText('Homeowner')).toBeNull();
    expect(screen.getByText('Continue')).toBeTruthy();
    expect(screen.queryByTestId('input-name')).toBeNull();
  });

  it('starts on the homeowner role and moves the selection when a card is pressed', () => {
    render(<RegisterScreen {...baseProps} />);

    expect(screen.getByRole('radio', { name: /I need help at home/ }).props.accessibilityState)
      .toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: /I want to work/ }).props.accessibilityState)
      .toMatchObject({ checked: false });

    fireEvent.press(screen.getByText(PROVIDER_CARD));

    expect(screen.getByRole('radio', { name: /I want to work/ }).props.accessibilityState)
      .toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: /I need help at home/ }).props.accessibilityState)
      .toMatchObject({ checked: false });
  });

  it('returns to sign in from the first step', () => {
    const onLogin = jest.fn();
    render(<RegisterScreen {...baseProps} onLogin={onLogin} />);

    fireEvent.press(screen.getByLabelText('Back to sign in'));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('goes back from the details form to the role step', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByTestId('input-name')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Back to role choice'));

    expect(screen.getByText('How will you use TaskBuddy?')).toBeTruthy();
    expect(screen.queryByTestId('input-name')).toBeNull();
  });
});

describe('RegisterScreen — required-field asterisks (#15)', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  it('marks Full Name, Email, Password and Confirm Password as required (homeowner role)', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    // Each required label renders as "<Label>" followed by a nested " *" Text
    // node, so the label's full flattened text content is "<Label> *".
    for (const label of ['Full Name', 'Email Address', 'Password', 'Confirm Password']) {
      expect(screen.getByText(`${label} *`)).toBeTruthy();
    }

    // Skill Category (SP-only) must not appear for the homeowner role.
    expect(screen.queryByText(/Skill Category/)).toBeNull();
  });

  it('stops the full name at 120 characters and the email at 254', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByTestId('input-name').props.maxLength).toBe(120);
    expect(screen.getByTestId('input-email').props.maxLength).toBe(254);
  });

  it('also marks Skill Category as required for the provider role', () => {
    render(<RegisterScreen {...baseProps} />);

    chooseRole(PROVIDER_CARD);

    expect(screen.getByText('Skill Category *')).toBeTruthy();
  });
});

describe('RegisterScreen — skill category dropdown', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  it('selects a category when an option is tapped and closes the list', () => {
    render(<RegisterScreen {...baseProps} />);
    chooseRole(PROVIDER_CARD);
    fireEvent.press(screen.getByText('Select your skill…'));
    fireEvent.press(screen.getByText('Plumbing'));

    expect(screen.getByText('Plumbing')).toBeTruthy();
    expect(screen.queryByText('Cleaning')).toBeNull();
  });

  it('renders the options in normal layout flow, not absolutely positioned', () => {
    // An absolute list hangs outside its parent's bounds; Android drops taps there.
    render(<RegisterScreen {...baseProps} />);
    chooseRole(PROVIDER_CARD);
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
    chooseRole(PROVIDER_CARD);
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
    chooseRole(PROVIDER_CARD);
    fireEvent.press(screen.getByText('Select your skill…'));
    expect(screen.getByText('Cleaning')).toBeTruthy();

    fireEvent.press(screen.getByText('Select your skill…'));

    expect(screen.queryByText('Cleaning')).toBeNull();
    expect(screen.getByText('Select your skill…')).toBeTruthy();
  });
});

it.each([
  { role: 'homeowner', card: HOMEOWNER_CARD },
  { role: 'provider', card: PROVIDER_CARD },
])('registers $role with three consents and no identity-processing signup field', async ({ card }) => {
  const onRegister = jest.fn().mockResolvedValue({ needsEmailConfirmation: false });
  (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
  if (card === PROVIDER_CARD) {
    chooseRole(PROVIDER_CARD);
    fireEvent.press(screen.getByText('Select your skill…'));
    fireEvent.press(screen.getByText('Plumbing'));
  } else {
    fireEvent.press(screen.getByText('Continue'));
  }
  fireEvent.changeText(screen.getByTestId('input-name'), 'Test User');
  fireEvent.changeText(screen.getByTestId('input-email'), 'test@example.test');
  fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
  fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password123');
  fireEvent.press(screen.getByTestId('chk-terms'));
  agreeTo('Terms & Conditions');
  agreeTo('Privacy Policy');
  fireEvent.press(screen.getByTestId('chk-data-collection'));
  expect(screen.queryByTestId('chk-biometric')).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));
  expect(onRegister).toHaveBeenCalledWith(expect.objectContaining({
    consentedTerms: true, consentedPrivacy: true, consentedDataCollection: true,
  }));
  expect(onRegister.mock.calls[0][0]).not.toHaveProperty('consentedBiometric');
});

describe('RegisterScreen — create account', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  it('shows the length, letter and number rules and ticks each as it is met', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    fireEvent.changeText(screen.getByTestId('input-password'), 'abcdefg');
    expect(screen.getByLabelText('8–72 characters: not yet')).toBeTruthy();
    expect(screen.getByLabelText('A letter: met')).toBeTruthy();
    expect(screen.getByLabelText('A number: not yet')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('input-password'), 'abcdefg1');
    expect(screen.getByLabelText('8–72 characters: met')).toBeTruthy();
    expect(screen.getByLabelText('A number: met')).toBeTruthy();
  });

  it('presents Terms and Privacy as one checkbox, ticked only after both documents are accepted', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));
    const termsRow = () => screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' });

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(termsRow().props.accessibilityState).toMatchObject({ checked: false });

    fireEvent.press(screen.getByTestId('chk-terms'));
    expect(screen.getByRole('tab', { name: 'Terms' }).props.accessibilityState).toMatchObject({ selected: true });
    agreeTo('Terms & Conditions');
    expect(screen.getByRole('tab', { name: 'Terms ✓' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Privacy' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(termsRow().props.accessibilityState).toMatchObject({ checked: false });

    agreeTo('Privacy Policy');
    expect(termsRow().props.accessibilityState).toMatchObject({ checked: true });

    fireEvent.press(screen.getByTestId('chk-terms'));
    expect(termsRow().props.accessibilityState).toMatchObject({ checked: false });
  });

  it('a close after accepting one document keeps it, and the next tick opens on the other', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    fireEvent.press(screen.getByTestId('chk-terms'));
    agreeTo('Terms & Conditions');
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).props.accessibilityState)
      .toMatchObject({ checked: false });

    fireEvent.press(screen.getByTestId('chk-terms'));
    expect(screen.getByRole('tab', { name: 'Privacy' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('tab', { name: 'Terms ✓' })).toBeTruthy();
  });

  it('will not create the account until the consents are ticked', async () => {
    const onRegister = jest.fn();
    render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-name'), 'Test User');
    fireEvent.changeText(screen.getByTestId('input-email'), 'test@example.test');
    fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
    fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password123');

    await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));

    expect(screen.getByText('Please accept the Terms & Conditions to continue.')).toBeTruthy();
    expect(screen.getByText('Please accept the Data Collection consent to continue.')).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('refuses a password that does not match its confirmation', async () => {
    const onRegister = jest.fn();
    render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
    fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password124');

    await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));

    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('keeps Continue with Google on the create-account step', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('Continue with Google')).toBeTruthy();
  });
});

describe('RegisterScreen — name and email are checked', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  /** Ticks the three consents the same way the registration test does. */
  function tickConsents() {
    fireEvent.press(screen.getByTestId('chk-terms'));
    agreeTo('Terms & Conditions');
    agreeTo('Privacy Policy');
    fireEvent.press(screen.getByTestId('chk-data-collection'));
  }

  it('capitalises the name as words, and gives the email field the plain email keyboard', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByTestId('input-name').props.autoCapitalize).toBe('words');
    const email = screen.getByTestId('input-email');
    expect(email.props.keyboardType).toBe('email-address');
    expect(email.props.autoCapitalize).toBe('none');
    expect(email.props.autoCorrect).toBe(false);
  });

  it('shows the name message once the name field is left, not while typing', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    fireEvent.changeText(screen.getByTestId('input-name'), 'Test 2');
    expect(screen.queryByText("Full name can't include numbers")).toBeNull();

    fireEvent(screen.getByTestId('input-name'), 'blur');
    expect(screen.getByText("Full name can't include numbers")).toBeTruthy();
  });

  it('refuses to create the account for a name with digits, and says why', async () => {
    const onRegister = jest.fn();
    render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-name'), 'Test User 2');
    fireEvent.changeText(screen.getByTestId('input-email'), 'test@example.test');
    fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
    fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password123');
    tickConsents();

    await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));

    expect(screen.getByText("Full name can't include numbers")).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('shows the email message under the field once the field is left', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));

    fireEvent.changeText(screen.getByTestId('input-email'), 'test@example');
    fireEvent(screen.getByTestId('input-email'), 'blur');

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
  });

  it('refuses to create the account for a malformed email, and says why', async () => {
    const onRegister = jest.fn();
    render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-name'), 'Test User');
    fireEvent.changeText(screen.getByTestId('input-email'), 'test@example');
    fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
    fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password123');
    tickConsents();

    await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('sends the trimmed email and the name with single spaces', async () => {
    const onRegister = jest.fn().mockResolvedValue({ needsEmailConfirmation: false });
    render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-name'), '  Test   User ');
    fireEvent.changeText(screen.getByTestId('input-email'), '  test@example.test ');
    fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
    fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password123');
    tickConsents();

    await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));

    expect(onRegister).toHaveBeenCalledWith(expect.objectContaining({
      email: 'test@example.test',
      fullName: 'Test User',
      password: 'password123',
    }));
  });
});

describe('RegisterScreen — passwords', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp: jest.fn() });
  });

  it('refuses a password with no letter or number, even when it is eight characters long', async () => {
    const onRegister = jest.fn();
    render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-password'), '        ');
    fireEvent.changeText(screen.getByTestId('input-confirm-password'), '        ');

    await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));

    expect(screen.getByText('Password must contain at least one letter and one number.')).toBeTruthy();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('shows the eight-character message once the password field is left', () => {
    render(<RegisterScreen {...baseProps} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-password'), 'short');
    expect(screen.queryByText('Password must be 8–72 characters.')).toBeNull();

    fireEvent(screen.getByTestId('input-password'), 'blur');

    expect(screen.getByText('Password must be 8–72 characters.')).toBeTruthy();
  });
});

describe('RegisterScreen — the email code', () => {
  it('keeps all six digits of a code pasted with a space in it', async () => {
    const verifyEmailOtp = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ verifyEmailOtp });
    const onRegister = jest.fn().mockResolvedValue({ needsEmailConfirmation: true });
    render(<RegisterScreen {...baseProps} onRegister={onRegister} />);
    fireEvent.press(screen.getByText('Continue'));
    fireEvent.changeText(screen.getByTestId('input-name'), 'Test User');
    fireEvent.changeText(screen.getByTestId('input-email'), 'test@example.test');
    fireEvent.changeText(screen.getByTestId('input-password'), 'password123');
    fireEvent.changeText(screen.getByTestId('input-confirm-password'), 'password123');
    fireEvent.press(screen.getByTestId('chk-terms'));
    agreeTo('Terms & Conditions');
    agreeTo('Privacy Policy');
    fireEvent.press(screen.getByTestId('chk-data-collection'));
    await act(async () => fireEvent.press(screen.getByTestId('btn-create-account')));

    // A native length cap smaller than the pasted text would cut the code before the
    // handler sees it, so the box must allow a formatted six-digit code to arrive whole.
    const cap = screen.getByLabelText('Verification code').props.maxLength;
    expect(cap === undefined || cap >= '123 456'.length).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Verification code'), '123 456');

    expect(screen.getByLabelText('Verification code').props.value).toBe('123456');
    await act(async () => fireEvent.press(screen.getByText('Verify Email')));
    expect(verifyEmailOtp).toHaveBeenCalledWith({ email: 'test@example.test', token: '123456' });
  });
});
