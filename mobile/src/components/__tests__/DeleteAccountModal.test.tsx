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

/** Types the word the red button asks for, so the button can be pressed. */
const typeDelete = () => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');

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
    typeDelete();

    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the sheet open with the error when the delete fails for another reason', async () => {
    (api.deleteAccount as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    renderModal();
    typeDelete();

    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByText('Network request failed')).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeTruthy();
  });

  it('locks Keep my account while the delete is in flight', async () => {
    (api.deleteAccount as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    renderModal();
    typeDelete();

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
    typeDelete();

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
    typeDelete();
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    await screen.findByText("You can't delete your account yet");

    fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteAccountModal — the word DELETE is typed first', () => {
  const field = () => screen.getByLabelText('Type DELETE to confirm');
  const deleteButton = () => screen.getByRole('button', { name: 'Delete my account' });

  it('keeps the red button disabled until DELETE is typed', () => {
    renderModal();
    expect(deleteButton()).toBeDisabled();

    fireEvent.changeText(field(), 'DELET');
    expect(deleteButton()).toBeDisabled();

    fireEvent.changeText(field(), 'DELETE');
    expect(deleteButton()).toBeEnabled();
  });

  it('accepts the word in any case, and ignores spaces around it', () => {
    renderModal();

    fireEvent.changeText(field(), '  delete ');

    expect(deleteButton()).toBeEnabled();
  });

  it('keeps the button disabled for a wrong word, and sends nothing when it is pressed', () => {
    renderModal();

    fireEvent.changeText(field(), 'REMOVE');
    fireEvent.press(deleteButton());

    expect(deleteButton()).toBeDisabled();
    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  it('calls the delete once, even when the button is pressed again while it runs', () => {
    (api.deleteAccount as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    renderModal();
    typeDelete();

    fireEvent.press(deleteButton());
    fireEvent.press(deleteButton());

    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('explains why the word is needed, and types it in capitals without autocorrect', () => {
    renderModal();

    expect(screen.getByText("This can't be undone, so please type DELETE.")).toBeTruthy();
    expect(field().props.autoCapitalize).toBe('characters');
    expect(field().props.autoCorrect).toBe(false);
  });

  it('clears the typed word each time the sheet opens', () => {
    const { rerender } = render(<DeleteAccountModal visible onClose={onClose} onDeleted={onDeleted} />);
    fireEvent.changeText(field(), 'DELETE');

    rerender(<DeleteAccountModal visible={false} onClose={onClose} onDeleted={onDeleted} />);
    rerender(<DeleteAccountModal visible onClose={onClose} onDeleted={onDeleted} />);

    expect(field().props.value).toBe('');
    expect(deleteButton()).toBeDisabled();
  });
});
