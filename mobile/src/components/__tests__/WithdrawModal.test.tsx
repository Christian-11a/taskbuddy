import React from 'react';
import { ActivityIndicator, Keyboard, Modal, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import WithdrawModal from '../WithdrawModal';
import { api } from '../../lib/api';
import { lightPalette } from '../../constants/palettes';

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
