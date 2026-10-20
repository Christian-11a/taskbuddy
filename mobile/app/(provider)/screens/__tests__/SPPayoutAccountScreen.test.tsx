import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPPayoutAccountScreen, { accountLabel, payoutStatus, payoutTitle } from '../SPPayoutAccountScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    payoutAccount: jest.fn(),
    linkPayoutAccount: jest.fn(),
    payoutBanks: jest.fn(),
    unlinkPayoutAccount: jest.fn(),
  },
}));

describe('accountLabel', () => {
  it('names the wallet app or the bank, with the last four digits', () => {
    expect(accountLabel({ method: 'gcash', bank_name: null, account_last4: '4567' })).toBe('GCash ••••4567');
    expect(accountLabel({ method: 'maya', bank_name: null, account_last4: '1111' })).toBe('Maya ••••1111');
    expect(accountLabel({ method: 'bank', bank_name: 'BPI', account_last4: '0123' })).toBe('BPI ••••0123');
    expect(accountLabel({ method: 'bank', bank_name: null, account_last4: '0123' })).toBe('Bank ••••0123');
  });
});

describe('payoutStatus', () => {
  it('labels completed, pending and failed payouts, and shows unknown values raw', () => {
    expect(payoutStatus('completed')).toEqual({ label: 'Sent', tone: 'success' });
    expect(payoutStatus('pending')).toEqual({ label: 'Pending', tone: 'warning' });
    expect(payoutStatus('failed')).toEqual({ label: 'Failed', tone: 'danger' });
    expect(payoutStatus('on_hold')).toEqual({ label: 'On_hold', tone: 'neutral' });
  });
});

describe('payoutTitle', () => {
  it('shows old Withdrawal and empty titles as Payout, and other titles as they are', () => {
    expect(payoutTitle('Withdrawal')).toBe('Payout');
    expect(payoutTitle('  withdrawal  ')).toBe('Payout');
    expect(payoutTitle('')).toBe('Payout');
    expect(payoutTitle('   ')).toBe('Payout');
    expect(payoutTitle(null)).toBe('Payout');
    expect(payoutTitle('Booking payment')).toBe('Booking payment');
  });
});

describe('SPPayoutAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    (api.linkPayoutAccount as jest.Mock).mockResolvedValue({});
    (api.unlinkPayoutAccount as jest.Mock).mockResolvedValue({ removed: true });
    (api.payoutBanks as jest.Mock).mockResolvedValue([
      { code: 'PH_BPI', name: 'BPI' },
      { code: 'PH_BDO', name: 'BDO' },
    ]);
  });

  it('shows no refresh bar once the reads settle, and reads each endpoint once', async () => {
    (api.payoutAccount as jest.Mock).mockResolvedValue({ method: 'gcash', bank_name: null, account_name: 'Ana', account_last4: '4567' });
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    expect(await screen.findByTestId('linked-account')).toBeTruthy();
    expect(screen.queryByTestId('refresh-bar')).toBeNull();
    expect(api.payoutAccount).toHaveBeenCalledTimes(1);
    expect(api.payoutBanks).toHaveBeenCalledTimes(1);
  });

  it('saves a GCash account with the number as digits only', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    expect(await screen.findByTestId('no-account')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Account holder name'), 'Ana Reyes');
    fireEvent.changeText(screen.getByLabelText('GCash mobile number'), '0917-123-4567');
    expect(screen.getByLabelText('GCash mobile number').props.value).toBe('0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Save account' }));

    await waitFor(() => expect(api.linkPayoutAccount).toHaveBeenCalledTimes(1));
    expect(api.linkPayoutAccount).toHaveBeenCalledWith({
      method: 'gcash',
      bank_code: undefined,
      account_name: 'Ana Reyes',
      account_number: '09171234567',
    });
    expect(await screen.findByText('Account saved.')).toBeTruthy();
  });

  it('saves a +63 GCash number in the 09 form', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    expect(await screen.findByTestId('no-account')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Account holder name'), 'Ana Reyes');
    fireEvent.changeText(screen.getByLabelText('GCash mobile number'), '+639171234567');
    expect(screen.getByLabelText('GCash mobile number').props.value).toBe('+63 917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Save account' }));

    await waitFor(() => expect(api.linkPayoutAccount).toHaveBeenCalledTimes(1));
    expect(api.linkPayoutAccount).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'gcash', account_number: '09171234567' }),
    );
  });

  it('sends the chosen bank by its Xendit channel code', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    await screen.findByTestId('no-account');
    fireEvent.press(screen.getByRole('radio', { name: 'Bank' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'BDO' }));
    fireEvent.changeText(screen.getByLabelText('Account holder name'), 'Ana Reyes');
    fireEvent.changeText(screen.getByLabelText('Account number'), '0012345678');
    fireEvent.press(screen.getByRole('button', { name: 'Save account' }));

    await waitFor(() =>
      expect(api.linkPayoutAccount).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'bank', bank_code: 'PH_BDO', account_number: '0012345678' }),
      ),
    );
  });

  it('does not save an incomplete form, and says what is missing', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    await screen.findByTestId('no-account');
    fireEvent.press(screen.getByRole('button', { name: 'Save account' }));

    expect(await screen.findByText('Enter the account holder name.')).toBeTruthy();
    expect(api.linkPayoutAccount).not.toHaveBeenCalled();
  });

  it('shows an error under each field, and under the bank picker, and clears them as the user edits', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    await screen.findByTestId('no-account');
    fireEvent.press(screen.getByRole('radio', { name: 'Bank' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save account' }));

    expect(await screen.findByText('Choose your bank.')).toBeTruthy();
    expect(screen.getByText('Enter the account holder name.')).toBeTruthy();
    expect(screen.getByText('Enter an account number of 10 to 16 digits.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Account holder name'), 'Ana');
    expect(screen.queryByText('Enter the account holder name.')).toBeNull();
    fireEvent.press(await screen.findByRole('radio', { name: 'BPI' }));
    expect(screen.queryByText('Choose your bank.')).toBeNull();
    expect(api.linkPayoutAccount).not.toHaveBeenCalled();
  });

  it('rejects a mobile number that starts with neither 09 nor +63', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    await screen.findByTestId('no-account');
    fireEvent.changeText(screen.getByLabelText('Account holder name'), 'Ana Reyes');
    fireEvent.changeText(screen.getByLabelText('GCash mobile number'), '08171234567');
    fireEvent.press(screen.getByRole('button', { name: 'Save account' }));

    expect(await screen.findByText('Enter a mobile number like 0917 123 4567 or +63 917 123 4567.')).toBeTruthy();
    expect(api.linkPayoutAccount).not.toHaveBeenCalled();
  });

  describe('with a linked account', () => {
    const linked = { method: 'gcash', bank_name: null, account_name: 'Ana Reyes', account_last4: '4567', updated_at: '2026-10-01' };
    beforeEach(() => {
      (api.payoutAccount as jest.Mock).mockResolvedValue(linked);
    });

    it('shows the account card with a masked number and no form', async () => {
      render(<SPPayoutAccountScreen onBack={jest.fn()} />);

      expect(await screen.findByTestId('linked-account')).toBeTruthy();
      expect(screen.getByText('GCash')).toBeTruthy();
      expect(screen.getByText('Ana Reyes')).toBeTruthy();
      expect(screen.getByTestId('masked-number').props.children).toBe('•••• 4567');
      expect(screen.getByText('Payouts go here')).toBeTruthy();
      expect(screen.queryByLabelText('GCash mobile number')).toBeNull();
    });

    it('opens the form pre-filled with the name and an empty number when changing', async () => {
      render(<SPPayoutAccountScreen onBack={jest.fn()} />);

      fireEvent.press(await screen.findByRole('button', { name: 'Change account' }));

      expect(screen.getByLabelText('Account holder name').props.value).toBe('Ana Reyes');
      expect(screen.getByLabelText('GCash mobile number').props.value).toBe('');
      fireEvent.changeText(screen.getByLabelText('GCash mobile number'), '09171234567');
      fireEvent.press(screen.getByRole('button', { name: 'Save account' }));
      await waitFor(() => expect(api.linkPayoutAccount).toHaveBeenCalledWith(expect.objectContaining({ account_number: '09171234567', account_name: 'Ana Reyes' })));
      expect(await screen.findByText('Account saved.')).toBeTruthy();
    });

    it('pre-selects the bank on Change when its name matches the bank list', async () => {
      (api.payoutAccount as jest.Mock).mockResolvedValue({ ...linked, method: 'bank', bank_name: ' bpi ' });
      render(<SPPayoutAccountScreen onBack={jest.fn()} />);

      await screen.findByTestId('linked-account');
      await waitFor(() => expect(api.payoutBanks).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      fireEvent.press(await screen.findByRole('button', { name: 'Change account' }));

      expect(screen.getByRole('radio', { name: 'BPI' }).props.accessibilityState.selected).toBe(true);
      expect(screen.getByRole('radio', { name: 'BDO' }).props.accessibilityState.selected).toBe(false);
    });

    it('leaves the bank unselected when no name matches', async () => {
      (api.payoutAccount as jest.Mock).mockResolvedValue({ ...linked, method: 'bank', bank_name: 'Unknown Bank' });
      render(<SPPayoutAccountScreen onBack={jest.fn()} />);

      await screen.findByTestId('linked-account');
      await new Promise((r) => setTimeout(r, 0));
      fireEvent.press(await screen.findByRole('button', { name: 'Change account' }));

      expect(screen.getByRole('radio', { name: 'BPI' }).props.accessibilityState.selected).toBe(false);
    });

    it('clears the saved note when editing again', async () => {
      render(<SPPayoutAccountScreen onBack={jest.fn()} />);

      fireEvent.press(await screen.findByRole('button', { name: 'Change account' }));
      fireEvent.changeText(screen.getByLabelText('GCash mobile number'), '09171234567');
      fireEvent.press(screen.getByRole('button', { name: 'Save account' }));
      await screen.findByText('Account saved.');
      fireEvent.press(await screen.findByRole('button', { name: 'Change account' }));
      expect(screen.queryByText('Account saved.')).toBeNull();
    });

    it('removes the account after the confirm', async () => {
      render(<SPPayoutAccountScreen onBack={jest.fn()} />);

      fireEvent.press(await screen.findByRole('button', { name: 'Remove' }));
      expect(api.unlinkPayoutAccount).not.toHaveBeenCalled();
      await screen.findByText('Remove payout account?');
      fireEvent.press(screen.getAllByText('Remove').slice(-1)[0]);

      await waitFor(() => expect(api.unlinkPayoutAccount).toHaveBeenCalledTimes(1));
    });
  });

  it('links to Earnings from a single row', async () => {
    const onOpenEarnings = jest.fn();
    render(<SPPayoutAccountScreen onBack={jest.fn()} onOpenEarnings={onOpenEarnings} />);

    await screen.findByTestId('no-account');
    fireEvent.press(screen.getByRole('button', { name: 'See your earnings and payouts' }));
    expect(onOpenEarnings).toHaveBeenCalledTimes(1);
  });
});
