import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPPayoutAccountScreen, { accountLabel, payoutProblem, payoutStatus, payoutTitle } from '../SPPayoutAccountScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    payoutAccount: jest.fn(),
    paymentHistory: jest.fn(),
    linkPayoutAccount: jest.fn(),
    payoutBanks: jest.fn(),
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

describe('payoutProblem', () => {
  const ok = { method: 'gcash' as const, bankCode: '', accountName: 'Ana Reyes', accountNumber: '0917 123 4567' };

  it('accepts a complete form', () => {
    expect(payoutProblem(ok)).toBeNull();
  });

  it('asks for the bank only for a bank account', () => {
    expect(payoutProblem({ ...ok, method: 'bank' })).toBe('Choose your bank.');
    expect(payoutProblem({ ...ok, method: 'bank', bankCode: 'PH_BPI' })).toBeNull();
  });

  it('asks for the holder name and a 6 to 20 digit number', () => {
    expect(payoutProblem({ ...ok, accountName: ' ' })).toBe('Enter the account holder name.');
    expect(payoutProblem({ ...ok, accountNumber: '12345' })).toBe('Enter a number of 6 to 20 digits.');
    expect(payoutProblem({ ...ok, accountNumber: '1'.repeat(21) })).toBe('Enter a number of 6 to 20 digits.');
  });
});

describe('SPPayoutAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (api.payoutAccount as jest.Mock).mockResolvedValue(null);
    (api.paymentHistory as jest.Mock).mockResolvedValue([]);
    (api.linkPayoutAccount as jest.Mock).mockResolvedValue({});
    (api.payoutBanks as jest.Mock).mockResolvedValue([
      { code: 'PH_BPI', name: 'BPI' },
      { code: 'PH_BDO', name: 'BDO' },
    ]);
  });

  it('saves a GCash account with the number as digits only', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    expect(await screen.findByTestId('no-account')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Account holder name'), 'Ana Reyes');
    fireEvent.changeText(screen.getByLabelText('GCash mobile number'), '0917-123-4567');
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

  it('sends the chosen bank by its Xendit channel code', async () => {
    render(<SPPayoutAccountScreen onBack={jest.fn()} />);

    await screen.findByTestId('no-account');
    fireEvent.press(screen.getByRole('radio', { name: 'Bank' }));
    fireEvent.press(await screen.findByRole('radio', { name: 'BDO' }));
    fireEvent.changeText(screen.getByLabelText('Account holder name'), 'Ana Reyes');
    fireEvent.changeText(screen.getByLabelText('Account number'), '001234567890');
    fireEvent.press(screen.getByRole('button', { name: 'Save account' }));

    await waitFor(() =>
      expect(api.linkPayoutAccount).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'bank', bank_code: 'PH_BDO', account_number: '001234567890' }),
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
});
