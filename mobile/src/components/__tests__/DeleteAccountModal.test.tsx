import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import DeleteAccountModal from '../DeleteAccountModal';
import { api, ApiError } from '../../lib/api';

// Keep the real ApiError and 409 parsing; only the network call is replaced.
jest.mock('../../lib/api', () => {
  const actual = jest.requireActual('../../lib/api');
  return { ...actual, api: { ...actual.api, deleteAccount: jest.fn() } };
});

const onClose = jest.fn();
const onDeleted = jest.fn();
const renderModal = () => render(<DeleteAccountModal visible onClose={onClose} onDeleted={onDeleted} />);

const blockedError = () =>
  new ApiError('This account still has obligations in flight', 409, {
    blockers: [
      {
        code: 'wallet_balance',
        message: 'Your wallet still holds PHP 8,397.00. Withdraw it before deleting your account.',
      },
      { code: 'active_job', message: '1 job is still in progress.' },
    ],
  });

beforeEach(() => {
  jest.clearAllMocks();
  (api.deleteAccount as jest.Mock).mockResolvedValue(undefined);
});

describe('DeleteAccountModal — confirm state', () => {
  it('says what is removed and what stays, and sends nothing until the red button is pressed', () => {
    renderModal();

    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(screen.getByText("Your account is closed right away and you're signed out.")).toBeTruthy();
    expect(screen.getByText('Your name, phone, photo and address are removed.')).toBeTruthy();
    expect(screen.getByText(/Past jobs, reviews and payments stay on record/)).toBeTruthy();
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  it('Keep my account closes the sheet and deletes nothing', () => {
    renderModal();

    fireEvent.press(screen.getByRole('button', { name: 'Keep my account' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.deleteAccount).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('Delete my account calls the delete once, closes, and then signs out through onDeleted', async () => {
    renderModal();

    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the sheet open with the error when the delete fails for another reason', async () => {
    (api.deleteAccount as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    renderModal();

    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('Network request failed')).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeTruthy();
  });

  it('locks Keep my account while the delete is in flight', async () => {
    (api.deleteAccount as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    renderModal();

    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Keep my account' }).props.accessibilityState?.disabled).toBe(true),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('DeleteAccountModal — blocked state (409)', () => {
  it('lists every blocker the server returned, with a Close button and no delete', async () => {
    (api.deleteAccount as jest.Mock).mockRejectedValueOnce(blockedError());
    renderModal();

    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText("You can't delete your account yet")).toBeTruthy();
    expect(
      screen.getByText('Your wallet still holds PHP 8,397.00. Withdraw it before deleting your account.'),
    ).toBeTruthy();
    expect(screen.getByText('1 job is still in progress.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();
    // No navigation prop reaches this sheet, so there is no Go to Wallet button.
    expect(screen.queryByRole('button', { name: 'Go to Wallet' })).toBeNull();
  });

  it('Close dismisses the sheet and never signs out', async () => {
    (api.deleteAccount as jest.Mock).mockRejectedValueOnce(blockedError());
    renderModal();
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    await screen.findByText("You can't delete your account yet");

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
  });
});
