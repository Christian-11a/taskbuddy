import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ChangePasswordModal from '../ChangePasswordModal';
import { api } from '../../lib/api';

jest.mock('../../lib/api', () => ({ api: { changePassword: jest.fn() } }));

const onClose = jest.fn();
const renderModal = () => render(<ChangePasswordModal visible onClose={onClose} />);

const fill = (current: string, next: string, confirm: string) => {
  fireEvent.changeText(screen.getByLabelText('Current password'), current);
  fireEvent.changeText(screen.getByLabelText('New password'), next);
  fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirm);
};
const updateButton = () => screen.getByRole('button', { name: 'Update password' });
const isDisabled = () => updateButton().props.accessibilityState?.disabled === true;

beforeEach(() => {
  jest.clearAllMocks();
  (api.changePassword as jest.Mock).mockResolvedValue({});
});

describe('ChangePasswordModal', () => {
  it('shows the three fields and the rules, with Update password disabled at first', () => {
    renderModal();

    expect(screen.getByText('Change password')).toBeTruthy();
    expect(screen.getByText('Current password')).toBeTruthy();
    expect(screen.getByText('New password')).toBeTruthy();
    expect(screen.getByText('Confirm new password')).toBeTruthy();
    expect(screen.getByText('8–72 characters')).toBeTruthy();
    expect(screen.getByText('Different from your current password')).toBeTruthy();
    expect(screen.getByText('Both new passwords match')).toBeTruthy();
    expect(isDisabled()).toBe(true);
  });

  it('keeps Update password disabled until every rule passes', () => {
    renderModal();

    fill('oldpassword', 'short', 'short');
    expect(isDisabled()).toBe(true);

    fill('oldpassword', 'newpassword1', 'newpassword2');
    expect(isDisabled()).toBe(true);

    fill('oldpassword', 'newpassword1', 'newpassword1');
    expect(isDisabled()).toBe(false);
  });

  it('sends the typed passwords once and then shows the success state', async () => {
    renderModal();
    fill('oldpassword', 'newpassword1', 'newpassword1');

    fireEvent.press(updateButton());

    await waitFor(() =>
      expect(api.changePassword).toHaveBeenCalledWith({
        current_password: 'oldpassword',
        new_password: 'newpassword1',
      }),
    );
    expect(api.changePassword).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Password updated')).toBeTruthy();
  });

  it('shows the server message only after Update password is pressed, and keeps the sheet open', async () => {
    (api.changePassword as jest.Mock).mockRejectedValueOnce(new Error('Current password is incorrect'));
    renderModal();
    fill('wrongpassword', 'newpassword1', 'newpassword1');

    expect(screen.queryByText('Current password is incorrect')).toBeNull();

    await act(async () => {
      fireEvent.press(updateButton());
    });

    expect(await screen.findByText('Current password is incorrect')).toBeTruthy();
    expect(screen.getByLabelText('Current password')).toBeTruthy();
  });

  it('Cancel closes the sheet without sending anything', () => {
    renderModal();
    fill('oldpassword', 'newpassword1', 'newpassword1');

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.changePassword).not.toHaveBeenCalled();
  });
});

const REUSED = "Choose a password you haven't used here";
const MISMATCH = 'Passwords do not match.';
const blurField = (label: string) => fireEvent(screen.getByLabelText(label), 'blur');

describe('ChangePasswordModal — field messages', () => {
  it('refuses a new password that is the same as the current one, once the new field is left', () => {
    renderModal();
    fill('samepassword1', 'samepassword1', 'samepassword1');

    blurField('New password');

    expect(screen.getByText(REUSED)).toBeTruthy();
    expect(isDisabled()).toBe(true);
  });

  it('says why when Done is pressed on the confirm field with a reused password, and does not send', async () => {
    renderModal();
    fill('samepassword1', 'samepassword1', 'samepassword1');

    await act(async () => {
      fireEvent(screen.getByLabelText('Confirm new password'), 'submitEditing');
    });

    expect(screen.getByText(REUSED)).toBeTruthy();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('does not say the new password is too short while it is still being typed', () => {
    renderModal();
    fireEvent.changeText(screen.getByLabelText('New password'), 'abc');

    expect(screen.queryByText('New password must be 8–72 characters.')).toBeNull();

    blurField('New password');

    expect(screen.getByText('New password must be 8–72 characters.')).toBeTruthy();
  });

  it('says the two new passwords do not match once the confirm field is left', () => {
    renderModal();
    fill('oldpassword', 'newpassword1', 'newpassword2');

    blurField('Confirm new password');

    expect(screen.getByText(MISMATCH)).toBeTruthy();
  });

  it('asks for the current password once that field is left empty', () => {
    renderModal();

    blurField('Current password');

    expect(screen.getByText('Enter your current password')).toBeTruthy();
  });

  it('treats a current password made only of spaces as empty: Update stays disabled, and the field says so', () => {
    renderModal();
    fill('        ', 'newpassword1', 'newpassword1');

    expect(isDisabled()).toBe(true);

    blurField('Current password');

    expect(screen.getByText('Enter your current password')).toBeTruthy();
  });

  it('does not show a reuse message when the new password differs from the current one', () => {
    renderModal();
    fill('oldpassword', 'newpassword1', 'newpassword1');

    blurField('New password');

    expect(screen.queryByText(REUSED)).toBeNull();
    expect(isDisabled()).toBe(false);
  });

  it('a new password with no letter or number shows its message, and Update password cannot send it', async () => {
    renderModal();
    fill('oldpassword', '        ', '        ');

    blurField('New password');

    expect(screen.getByText('New password must contain at least one letter and one number.')).toBeTruthy();
    expect(isDisabled()).toBe(true);
    fireEvent.press(updateButton());
    await act(async () => {
      fireEvent(screen.getByLabelText('Confirm new password'), 'submitEditing');
    });
    expect(api.changePassword).not.toHaveBeenCalled();
  });
});
