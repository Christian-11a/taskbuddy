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
    expect(screen.getByText('At least 8 characters')).toBeTruthy();
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
