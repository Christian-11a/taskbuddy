import React from 'react';
import { ActivityIndicator, Keyboard, Modal, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import WithdrawModal, { readWithdrawal } from '../WithdrawModal';
import { api } from '../../lib/api';
import { lightPalette } from '../../constants/palettes';
import { showToast } from '../Toast';

jest.mock('../Toast', () => ({ showToast: jest.fn() }));

/** The colours a host element is drawn with: its style, flattened. */
function styleOf(element: { props: Record<string, any> }): Record<string, any> {
  return StyleSheet.flatten(element.props.style) ?? {};
}

jest.mock('../../lib/api', () => ({
  api: { requestWithdrawal: jest.fn() },
}));

describe('WithdrawModal — keyboard dismissal on outside tap (#7/#17)', () => {
  it('dismisses the keyboard, but does not close the modal, when the card body is tapped', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const onClose = jest.fn();
    const onFiled = jest.fn();

    render(
      <WithdrawModal visible available={1000} onClose={onClose} onFiled={onFiled} />,
    );

    fireEvent.press(screen.getByTestId('withdraw-dialog'), { stopPropagation: jest.fn() });

    expect(dismissSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    dismissSpy.mockRestore();
  });
});

/** The sheet open with ₱425.00 available, and the two callbacks it was given. */
function renderSheet() {
  const onClose = jest.fn();
  const onFiled = jest.fn();
  render(<WithdrawModal visible available={425} onClose={onClose} onFiled={onFiled} />);
  return { onClose, onFiled };
}

function fill(amount: string, destination: string) {
  fireEvent.changeText(screen.getByLabelText('Amount to withdraw'), amount);
  fireEvent.changeText(screen.getByLabelText('Send to'), destination);
}

/** Whether a button is drawn disabled (its host view carries accessibilityState.disabled). */
function isDisabled(name: string) {
  return screen.getByRole('button', { name }).props.accessibilityState?.disabled === true;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WithdrawModal — form page', () => {
  it('shows the available amount, the amount and Send to fields, and what happens next', () => {
    renderSheet();

    expect(screen.getByText('Withdraw')).toBeTruthy();
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.getByText('₱425.00')).toBeTruthy();
    expect(screen.getByLabelText('Amount to withdraw')).toBeTruthy();
    expect(screen.getByLabelText('Send to')).toBeTruthy();
    expect(screen.getByText('Account name must match your profile')).toBeTruthy();
    expect(screen.getByText('The TaskBuddy team sends it by hand')).toBeTruthy();
    expect(screen.getByText("Shows as Pending in your wallet until it's sent")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('keeps Continue disabled until both the amount and the destination are filled in', () => {
    renderSheet();
    expect(isDisabled('Continue')).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Amount to withdraw'), '400');
    expect(isDisabled('Continue')).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Send to'), 'GCash 0917 123 4567');
    expect(isDisabled('Continue')).toBe(false);
  });

  it('keeps Continue disabled for a destination that is only spaces', () => {
    renderSheet();
    fill('400', '    ');

    expect(isDisabled('Continue')).toBe(true);
  });

  it('refuses an amount above the available balance, and says what the balance is', () => {
    renderSheet();
    fireEvent.changeText(screen.getByLabelText('Amount to withdraw'), '425.01');
    fireEvent(screen.getByLabelText('Amount to withdraw'), 'blur');

    expect(screen.getByText("That's more than your ₱425.00 available.")).toBeTruthy();
    expect(isDisabled('Continue')).toBe(true);
  });

  it('asks for a destination once the field has been left empty', () => {
    renderSheet();
    fireEvent(screen.getByLabelText('Send to'), 'blur');

    expect(screen.getByText('Add where to send it.')).toBeTruthy();
  });

  it('caps the destination at 200 characters', () => {
    renderSheet();

    expect(screen.getByLabelText('Send to').props.maxLength).toBe(200);
  });
});

describe('WithdrawModal — confirmation page', () => {
  it('Continue shows the confirmation with the wallet after, and files nothing yet', () => {
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText("You're withdrawing")).toBeTruthy();
    expect(screen.getByText('₱400.00')).toBeTruthy();
    expect(screen.getByText('To')).toBeTruthy();
    expect(screen.getByText('GCash 0917 123 4567')).toBeTruthy();
    expect(screen.getByText('Wallet after')).toBeTruthy();
    expect(screen.getByText('₱25.00')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Pending until sent')).toBeTruthy();
    expect(screen.getByText("You can cancel it while it's Pending.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request ₱400.00' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(api.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('Request files exactly one withdrawal with the typed amount and the trimmed destination, then closes', async () => {
    (api.requestWithdrawal as jest.Mock).mockResolvedValue({});
    const { onClose, onFiled } = renderSheet();
    fill('400', '  GCash 0917 123 4567  ');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    await waitFor(() => expect(onFiled).toHaveBeenCalledTimes(1));
    expect(api.requestWithdrawal).toHaveBeenCalledTimes(1);
    expect(api.requestWithdrawal).toHaveBeenCalledWith({ amount: 400, destination: 'GCash 0917 123 4567' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Back returns to the form with the amount and destination still filled in', () => {
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('Amount to withdraw').props.value).toBe('400');
    expect(screen.getByLabelText('Send to').props.value).toBe('GCash 0917 123 4567');
    expect(api.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('Cancel on the form closes without filing anything', () => {
    const { onClose, onFiled } = renderSheet();
    fill('400', 'GCash 0917 123 4567');

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onFiled).not.toHaveBeenCalled();
    expect(api.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('shows the reason when the request fails, on the confirmation page, and keeps the sheet open', async () => {
    (api.requestWithdrawal as jest.Mock).mockRejectedValue(new Error('Your balance changed. Try again.'));
    const { onClose, onFiled } = renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    expect(await screen.findByText('Your balance changed. Try again.')).toBeTruthy();
    expect(api.requestWithdrawal).toHaveBeenCalledTimes(1);
    expect(onFiled).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("You're withdrawing")).toBeTruthy();
  });

  it('uses its own message when a failed request carries none', async () => {
    (api.requestWithdrawal as jest.Mock).mockRejectedValue('offline');
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    expect(await screen.findByText('Could not file the request.')).toBeTruthy();
  });

  it('keeps the Request label and its name while the request is in flight, and does not file twice', async () => {
    let finish: (value: unknown) => void = () => {};
    (api.requestWithdrawal as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    const busy = screen.getByRole('button', { name: 'Request ₱400.00' });
    expect(busy.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    fireEvent.press(busy);
    expect(api.requestWithdrawal).toHaveBeenCalledTimes(1);

    await act(async () => { finish({}); });
  });

  it('cannot be closed by the Android back button while the request is in flight', async () => {
    let finish: (value: unknown) => void = () => {};
    (api.requestWithdrawal as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { onClose } = renderSheet();
    expect(screen.UNSAFE_getByType(Modal).props.onRequestClose).toBeDefined();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    expect(screen.UNSAFE_getByType(Modal).props.onRequestClose).toBeUndefined();

    await act(async () => { finish({}); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('WithdrawModal — a repeated Request says why it was ignored', () => {
  it('two taps on Request inside one act() file one withdrawal, and the second shows the notice', async () => {
    let finish: (value: unknown) => void = () => {};
    (api.requestWithdrawal as jest.Mock).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    const request = screen.getByRole('button', { name: 'Request ₱400.00' });

    // Both taps land before React re-renders, so they reach the same handler.
    act(() => {
      fireEvent.press(request);
      fireEvent.press(request);
    });

    expect(api.requestWithdrawal).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith("We're already filing your withdrawal request. Please wait.", 'info');

    await act(async () => { finish({}); });
  });
});

describe('WithdrawModal — button labels always render (FLOWS bug 3)', () => {
  it('draws the Continue label in onPrimary on the primary colour once the form is complete', () => {
    renderSheet();
    fill('400', 'GCash 0917 123 4567');

    expect(styleOf(screen.getByRole('button', { name: 'Continue' })).backgroundColor).toBe(lightPalette.Colors.primary);
    expect(styleOf(screen.getByText('Continue')).color).toBe(lightPalette.Colors.onPrimary);
  });

  it('draws the Continue label in ink700 on ink100 while the form is incomplete', () => {
    renderSheet();

    expect(styleOf(screen.getByRole('button', { name: 'Continue' })).backgroundColor).toBe(lightPalette.V6Colors.ink100);
    expect(styleOf(screen.getByText('Continue')).color).toBe(lightPalette.V6Colors.ink700);
  });

  it('recreates the Continue button when the form becomes complete, so Android repaints its fill and label', () => {
    renderSheet();
    const before = screen.getByRole('button', { name: 'Continue' });
    const beforeLabel = screen.getByText('Continue');

    fill('400', 'GCash 0917 123 4567');

    expect(screen.getByRole('button', { name: 'Continue' })).not.toBe(before);
    expect(screen.getByText('Continue')).not.toBe(beforeLabel);
  });

  it('shows the Request label again, in onPrimary on the primary colour, once a failed request ends', async () => {
    (api.requestWithdrawal as jest.Mock).mockRejectedValue(new Error('Try again'));
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    expect(await screen.findByText('Try again')).toBeTruthy();
    expect(styleOf(screen.getByText('Request ₱400.00')).color).toBe(lightPalette.Colors.onPrimary);
    expect(styleOf(screen.getByRole('button', { name: 'Request ₱400.00' })).backgroundColor).toBe(lightPalette.Colors.primary);
  });
});

describe('WithdrawModal — money text fits its line instead of being cut off', () => {
  const fit = expect.objectContaining({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 });

  it('the available amount on the form page shrinks to fit', () => {
    renderSheet();

    expect(screen.getByText('₱425.00').props).toEqual(fit);
  });

  it('the amount field steps its text down for a long figure, so it stays inside the box at 1.3x text', () => {
    renderSheet();
    const field = () => screen.getByLabelText('Amount to withdraw');

    fireEvent.changeText(field(), '400');
    expect(styleOf(field()).fontSize).toBe(40);

    fireEvent.changeText(field(), '1248397.00');
    expect(styleOf(field()).fontSize).toBeLessThan(40);
  });

  it('the amount on the confirmation page and the Request button shrink to fit', () => {
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('₱400.00').props).toEqual(fit);
    expect(screen.getByText('Request ₱400.00').props).toEqual(fit);
  });
});

describe('WithdrawModal — the sheet body keeps a margin from the screen edges', () => {
  it('pads the form page 20 dp on both sides', () => {
    renderSheet();

    expect(styleOf(screen.getByTestId('withdraw-sheet-body')).paddingHorizontal).toBe(20);
  });

  it('pads the confirmation page 20 dp on both sides too', () => {
    renderSheet();
    fill('400', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(styleOf(screen.getByTestId('withdraw-sheet-body')).paddingHorizontal).toBe(20);
  });
});

describe('WithdrawModal — the amount field takes only amounts', () => {
  const amountField = () => screen.getByLabelText('Amount to withdraw');

  it('leaves the amount empty when letters are typed into it', () => {
    renderSheet();
    fireEvent.changeText(amountField(), 'abc');

    expect(amountField().props.value).toBe('');
    expect(isDisabled('Continue')).toBe(true);
  });

  it('keeps 12.34 and cuts a third decimal place, so 12.345 becomes 12.34', () => {
    renderSheet();
    fireEvent.changeText(amountField(), '12.345');

    expect(amountField().props.value).toBe('12.34');
  });

  it('refuses a pasted minus sign, so -400 is not read as 400', () => {
    renderSheet();
    fireEvent.changeText(amountField(), '-400');

    expect(amountField().props.value).toBe('');
  });

  it('refuses a minus sign typed after an amount, and the amount already in the field stays', () => {
    renderSheet();
    fireEvent.changeText(amountField(), '400');
    fireEvent.changeText(amountField(), '-400');

    expect(amountField().props.value).toBe('400');
  });

  it('refuses a pasted 1e3 or -1000 rather than reading it as 13 or 1000', () => {
    renderSheet();
    fireEvent.changeText(amountField(), '400');
    fireEvent.changeText(amountField(), '1e3');
    expect(amountField().props.value).toBe('400');

    fireEvent.changeText(amountField(), '-1000');
    expect(amountField().props.value).toBe('400');
  });

  it('blocks zero and names the minimum once the field is left', () => {
    renderSheet();
    fireEvent.changeText(amountField(), '0');
    fireEvent(amountField(), 'blur');

    expect(screen.getByText('Minimum is ₱1')).toBeTruthy();
    expect(isDisabled('Continue')).toBe(true);
  });

  it('blocks an amount below the ₱1 minimum', () => {
    renderSheet();
    fireEvent.changeText(amountField(), '0.5');
    fireEvent(amountField(), 'blur');

    expect(screen.getByText('Minimum is ₱1')).toBeTruthy();
    expect(isDisabled('Continue')).toBe(true);
  });

  it('asks for an amount once the empty field is left, and keeps Continue disabled', () => {
    renderSheet();
    fireEvent.changeText(screen.getByLabelText('Send to'), 'GCash 0917 123 4567');
    fireEvent(amountField(), 'blur');

    expect(screen.getByText('Enter an amount')).toBeTruthy();
    expect(isDisabled('Continue')).toBe(true);
  });

  it('files the request with the cut amount, so 400.999 is requested as 400.99', async () => {
    (api.requestWithdrawal as jest.Mock).mockResolvedValue({});
    const { onFiled } = renderSheet();
    fill('400.999', 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.99' }));

    await waitFor(() => expect(onFiled).toHaveBeenCalledTimes(1));
    expect(api.requestWithdrawal).toHaveBeenCalledWith({ amount: 400.99, destination: 'GCash 0917 123 4567' });
  });
});

describe('WithdrawModal — the destination is one GCash or bank account number', () => {
  const destinationField = () => screen.getByLabelText('Send to');

  it.each([
    ['Cash pickup at Ortigas', 'Add your GCash number or bank account number.'],
    ['GCash 0917123456', 'A GCash number is 09 followed by 9 digits.'],
    ['GCash 09XX XXX XXXX', 'A GCash number is 09 followed by 9 digits.'],
    ['BDO 1234567', 'A bank account number is 8 to 20 digits.'],
    ['+639171234567', 'Use digits only, with no + sign.'],
    ['GCash 0917 123 4567 BDO 12345678', 'Keep it to one number: your GCash or bank account number.'],
  ])('refuses %j once the field is left, with %j, and keeps Continue disabled', (destination, message) => {
    renderSheet();
    fireEvent.changeText(screen.getByLabelText('Amount to withdraw'), '400');
    fireEvent.changeText(destinationField(), destination);
    fireEvent(destinationField(), 'blur');

    expect(screen.getByText(message)).toBeTruthy();
    expect(isDisabled('Continue')).toBe(true);
  });

  it.each([
    ['09171234567'],
    ['GCash 0917 123 4567'],
    ['BDO 1234 5678 9012'],
    ['Juan dela Cruz BPI 00123456789'],
  ])('accepts %j and lets Continue through', (destination) => {
    renderSheet();
    fill('400', destination);

    expect(isDisabled('Continue')).toBe(false);
  });

  it('sends the destination without the spaces and blank lines around it', async () => {
    (api.requestWithdrawal as jest.Mock).mockResolvedValue({});
    const { onFiled } = renderSheet();
    fill('400', '\n  GCash 0917 123 4567  \n\n\n\n');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    await waitFor(() => expect(onFiled).toHaveBeenCalledTimes(1));
    expect(api.requestWithdrawal).toHaveBeenCalledWith({ amount: 400, destination: 'GCash 0917 123 4567' });
  });
});

describe('readWithdrawal — a balance that did not load cannot be withdrawn from', () => {
  it('refuses any amount when the available balance is not a number', () => {
    const reading = readWithdrawal('5', 'GCash 0917 123 4567', Number.NaN);

    expect(reading.amountValid).toBe(false);
    expect(reading.amountError).toBe("That's more than your ₱0.00 available.");
  });
});
