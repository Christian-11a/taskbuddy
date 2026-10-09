import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOWalletScreen from '../HOWalletScreen';
import { api, type WalletTransaction } from '../../../../src/lib/api';
import { showToast } from '../../../../src/components/Toast';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { openRedirectSession } from '../../../../src/lib/appRedirectSession';

jest.mock('../../../../src/lib/api', () => ({
  MIN_TOPUP_PHP: 50,
  api: {
    wallet: jest.fn(),
    withdrawals: jest.fn(),
    cancelWithdrawal: jest.fn(),
    createCheckoutSession: jest.fn(),
    requestWithdrawal: jest.fn(),
  },
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'taskbuddy://',
}));

jest.mock('../../../../src/lib/appRedirectSession', () => ({
  openRedirectSession: jest.fn(),
}));

jest.mock('../../../../src/components/Toast', () => ({
  showToast: jest.fn(),
  ToastHost: () => null,
}));

describe('HOWalletScreen — Withdraw when the wallet failed to load (QA #19)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // useAsyncData's cache is a module-level singleton shared by every it()
    // in this file — without this, a prior test's cached wallet data would
    // leak into the next test's first render.
    clearAsyncDataCache();
    (api.withdrawals as jest.Mock).mockResolvedValue([]);
  });

  it('shows a "couldn\'t load" toast, not "no funds", when the wallet request failed', async () => {
    (api.wallet as jest.Mock).mockRejectedValue(new Error('Network error'));

    render(<HOWalletScreen />);

    await waitFor(() => expect(screen.getByText('Withdraw')).toBeTruthy());

    fireEvent.press(screen.getByText('Withdraw'));

    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/couldn.t load your wallet/i),
    );
    expect(showToast).not.toHaveBeenCalledWith(
      expect.stringMatching(/no funds/i),
    );
  });

  it('still shows the real "no funds" message once the wallet has actually loaded at zero', async () => {
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 0, available: 0, held: 0 });

    render(<HOWalletScreen />);

    await waitFor(() => expect(screen.getByText('Withdraw')).toBeTruthy());

    fireEvent.press(screen.getByText('Withdraw'));

    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/no funds available to withdraw/i),
    );
  });

  it('does not block Withdraw when a valid cached balance is showing but a background refresh just failed', async () => {
    // First mount: a normal successful load, seeding useAsyncData's cache
    // under the 'ho-wallet' key with a positive, withdrawable balance.
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 500, available: 500, held: 0 });
    const { unmount } = render(<HOWalletScreen />);
    await waitFor(() => expect(screen.getByText('₱500.00')).toBeTruthy());
    unmount();

    // Remount (a real tab revisit): the cache seeds `data` synchronously
    // with the same good balance, rendered immediately, while the request
    // this mount actually makes fails in the background.
    (api.wallet as jest.Mock).mockRejectedValue(new Error('Network error'));
    render(<HOWalletScreen />);

    // The stale-but-valid balance is already on screen from cache.
    expect(screen.getByText('₱500.00')).toBeTruthy();
    // Wait for this mount's own (failing) request to settle.
    await waitFor(() => expect(api.wallet as jest.Mock).toHaveBeenCalledTimes(2));

    fireEvent.press(screen.getByText('Withdraw'));

    expect(showToast).not.toHaveBeenCalledWith(
      expect.stringMatching(/couldn.t load your wallet/i),
    );
    // The withdraw sheet opened (its test id is unique — the button and the
    // sheet title both just say "Withdraw").
    expect(screen.getByTestId('withdraw-hw-dialog')).toBeTruthy();
    expect(
      screen.getByText("Shows as Pending in your wallet until it's sent"),
    ).toBeTruthy();
  });
});

describe('HOWalletScreen — Add Money after Stripe returns', () => {
  const walletAt = (balance: number) => ({
    balance,
    available: balance,
    pending: 0,
    total_credited: balance,
    total_debited: 0,
    transactions: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    jest.useFakeTimers();
    (api.withdrawals as jest.Mock).mockResolvedValue([]);
    (api.createCheckoutSession as jest.Mock).mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      session_id: 'cs_test_1',
      amount: 500,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('blocks amounts below PHP50 before opening Checkout', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0));
    render(<HOWalletScreen />);
    await waitFor(() => expect(screen.getByText('Add money')).toBeTruthy());
    fireEvent.press(screen.getByText('Add money'));
    expect(screen.getByText('Minimum ₱50')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '49.99');
    fireEvent.press(screen.getByTestId('wallet-add-money-continue'));
    expect(api.createCheckoutSession).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '50');
    expect(screen.getByTestId('wallet-add-money-continue')).not.toBeDisabled();
  });

  const startTopup = async () => {
    render(<HOWalletScreen />);
    await waitFor(() => expect(screen.getByText('Add money')).toBeTruthy());
    fireEvent.press(screen.getByText('Add money'));
    fireEvent.press(screen.getByTestId('wallet-quick-500'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('wallet-add-money-continue'));
    });
  };

  it('closes Add Money as soon as Stripe returns success and refreshes the wallet', async () => {
    (api.wallet as jest.Mock)
      .mockResolvedValueOnce(walletAt(0)) // initial load
      .mockResolvedValue(walletAt(500)); // first poll sees the credit
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=success',
    });

    await startTopup();

    await waitFor(() => expect(screen.queryByTestId('add-money-dialog')).toBeNull());
    expect(showToast).toHaveBeenCalledWith('Payment received. Your wallet is updating.');
    expect(api.createCheckoutSession).toHaveBeenCalledTimes(1);
    await act(async () => { await jest.runAllTimersAsync(); });
    expect(api.wallet).toHaveBeenCalledTimes(4);
  });

  it('closes before a delayed webhook credits the wallet', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0)); // webhook never arrives during the poll
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=success',
    });

    await startTopup();

    await waitFor(() => expect(screen.queryByTestId('add-money-dialog')).toBeNull());
    expect(api.wallet).toHaveBeenCalledTimes(2); // initial load and immediate refresh
    expect(api.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(openRedirectSession).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh form when Add Money is tapped again after returning from Stripe', async () => {
    (api.wallet as jest.Mock)
      .mockResolvedValueOnce(walletAt(0))
      .mockResolvedValue(walletAt(500));
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=success',
    });

    await startTopup();
    await waitFor(() => expect(screen.queryByTestId('add-money-dialog')).toBeNull());

    fireEvent.press(screen.getByText('Add money'));

    expect(screen.getByTestId('wallet-add-money-continue')).toBeTruthy();
  });

  it('closes the form when Stripe returns a cancelled payment', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0));
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=cancelled',
    });

    await startTopup();

    await waitFor(() => expect(screen.queryByTestId('add-money-dialog')).toBeNull());
    expect(showToast).toHaveBeenCalledWith('Payment was cancelled.');
    expect(api.createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('closes the form when Android dismisses the browser after returning', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0));
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'dismiss' });

    await startTopup();

    await waitFor(() => expect(screen.queryByTestId('add-money-dialog')).toBeNull());
    expect(openRedirectSession).toHaveBeenCalledTimes(1);
    expect(api.wallet).toHaveBeenCalledTimes(2);
  });

  it('shows the error and keeps Continue when creating the Checkout session fails', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0));
    (api.createCheckoutSession as jest.Mock).mockRejectedValue(new Error('Payments are unavailable'));

    await startTopup();

    await waitFor(() => expect(screen.getByText('Payments are unavailable')).toBeTruthy());
    expect(screen.getByTestId('wallet-add-money-continue')).toBeTruthy();
    expect(openRedirectSession).not.toHaveBeenCalled();
  });

  it('pull-to-refresh re-fetches the wallet', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0));
    render(<HOWalletScreen />);
    await waitFor(() => expect(api.wallet).toHaveBeenCalledTimes(1));

    const refreshControl = screen.getByTestId('wallet-scroll').props.refreshControl;
    expect(refreshControl).toBeTruthy();
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(api.wallet).toHaveBeenCalledTimes(2));
  });
});

describe('HOWalletScreen — withdraw sheet: form, confirmation and request', () => {
  const walletAt = (overrides: Record<string, unknown> = {}) => ({
    balance: 1250,
    available: 1000,
    pending: 0,
    pending_withdrawals: 0,
    total_credited: 1250,
    total_debited: 0,
    in_escrow: 0,
    transactions: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (api.withdrawals as jest.Mock).mockResolvedValue([]);
    (api.wallet as jest.Mock).mockResolvedValue(walletAt());
    (api.requestWithdrawal as jest.Mock).mockResolvedValue({});
  });

  /** Renders the wallet and opens the withdraw sheet from the balance card. */
  const openWithdraw = async () => {
    render(<HOWalletScreen />);
    await waitFor(() => expect(screen.getByText('₱1,250.00')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Withdraw' }));
    return screen.getByTestId('withdraw-hw-dialog');
  };
  const amountField = () => screen.getByLabelText('Amount to withdraw');
  const destinationField = () => screen.getByLabelText('Send to');

  it('opens on the form page with the balance it can withdraw and what happens next', async () => {
    await openWithdraw();

    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.getByText('₱1,000.00')).toBeTruthy();
    expect(screen.getByText("Shows as Pending in your wallet until it's sent")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(api.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('Continue shows the confirmation without filing; Request files one withdrawal with the trimmed destination, then reloads', async () => {
    await openWithdraw();
    fireEvent.changeText(amountField(), '400');
    fireEvent.changeText(destinationField(), '  GCash 0917 123 4567  ');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText("You're withdrawing")).toBeTruthy();
    expect(screen.getByText('₱400.00')).toBeTruthy();
    expect(screen.getByText('₱600.00')).toBeTruthy();
    expect(api.requestWithdrawal).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    await waitFor(() => expect(screen.queryByTestId('withdraw-hw-dialog')).toBeNull());
    expect(api.requestWithdrawal).toHaveBeenCalledTimes(1);
    expect(api.requestWithdrawal).toHaveBeenCalledWith({ amount: 400, destination: 'GCash 0917 123 4567' });
    expect(api.wallet).toHaveBeenCalledTimes(2);
    expect(api.withdrawals).toHaveBeenCalledTimes(2);
  });

  it('Back returns to the form with the amount and destination still filled in', async () => {
    await openWithdraw();
    fireEvent.changeText(amountField(), '400');
    fireEvent.changeText(destinationField(), 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(amountField().props.value).toBe('400');
    expect(destinationField().props.value).toBe('GCash 0917 123 4567');
    expect(api.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('Cancel closes the sheet without filing anything', async () => {
    await openWithdraw();
    fireEvent.changeText(amountField(), '400');
    fireEvent.changeText(destinationField(), 'GCash 0917 123 4567');

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByTestId('withdraw-hw-dialog')).toBeNull());
    expect(api.requestWithdrawal).not.toHaveBeenCalled();
  });

  it('shows a failed request on the confirmation page and keeps the sheet open, without reloading', async () => {
    (api.requestWithdrawal as jest.Mock).mockRejectedValue(new Error('Amount is over your balance'));
    await openWithdraw();
    fireEvent.changeText(amountField(), '400');
    fireEvent.changeText(destinationField(), 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    expect(await screen.findByText('Amount is over your balance')).toBeTruthy();
    expect(api.requestWithdrawal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('withdraw-hw-dialog')).toBeTruthy();
    expect(api.wallet).toHaveBeenCalledTimes(1);
  });

  it('keeps its own message when a failed request carries none', async () => {
    (api.requestWithdrawal as jest.Mock).mockRejectedValue('offline');
    await openWithdraw();
    fireEvent.changeText(amountField(), '400');
    fireEvent.changeText(destinationField(), 'GCash 0917 123 4567');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.press(screen.getByRole('button', { name: 'Request ₱400.00' }));

    expect(await screen.findByText('Could not request a withdrawal.')).toBeTruthy();
  });

  it('caps the destination at 200 characters and refuses an amount above the available balance', async () => {
    await openWithdraw();
    expect(destinationField().props.maxLength).toBe(200);

    fireEvent.changeText(amountField(), '1000.01');
    fireEvent(amountField(), 'blur');

    expect(screen.getByText("That's more than your ₱1,000.00 available.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });
});

describe('FullTest escrow display', () => {
  it('uses escrow balances rather than pending ledger amounts and labels the hold as a payment', async () => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (api.withdrawals as jest.Mock).mockResolvedValue([]);
    (api.wallet as jest.Mock).mockResolvedValue({ balance: 600, available: 500, pending: 100, in_escrow: 400,
      transactions: [{ id: 'hold-1', title: 'Repair payment', direction: 'debit', kind: 'escrow_hold', status: 'completed', amount: 400, created_at: '2026-10-01' }] });
    render(<HOWalletScreen />);
    await screen.findByText('Repair payment');
    expect(screen.getByText('₱400.00')).toBeTruthy();
    expect(screen.getByText(/Escrow funded/)).toBeTruthy();
    expect(screen.queryByText(/ · Completed/)).toBeNull();
  });
});

describe('HOWalletScreen — balance card, tiles and history', () => {
  // Days are relative to today, so the Today and Yesterday headings hold whatever day the tests run.
  const dayAt = (daysAgo: number) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12).toISOString();
  };
  const txn = (
    fields: Partial<WalletTransaction> & Pick<WalletTransaction, 'id' | 'direction' | 'kind' | 'amount' | 'title'>,
  ): WalletTransaction => ({
    profile_id: 'homeowner',
    status: 'completed',
    job_id: null,
    created_at: dayAt(0),
    ...fields,
  }) as WalletTransaction;

  const topUp = txn({ id: 'topup', direction: 'credit', kind: 'topup', amount: 500, title: 'Wallet top-up' });
  const voucher = txn({
    id: 'voucher', direction: 'credit', kind: 'recovery_credit', amount: 150,
    title: 'Recovery voucher', created_at: dayAt(1),
  });
  const hold = txn({
    id: 'hold', direction: 'debit', kind: 'escrow_hold', amount: 300, title: 'Held for: Plumbing: Fix toilet',
  });
  const withdrawal = txn({
    id: 'withdrawal', direction: 'debit', kind: 'withdrawal', amount: 100, title: 'GCash cash-out', created_at: dayAt(1),
  });
  const walletAt = (overrides: Record<string, unknown> = {}) => ({
    balance: 1250,
    available: 1000,
    pending: 0,
    pending_withdrawals: 0,
    total_credited: 1650,
    total_debited: 400,
    in_escrow: 300,
    transactions: [topUp, voucher, hold, withdrawal],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    (api.withdrawals as jest.Mock).mockResolvedValue([]);
    (api.cancelWithdrawal as jest.Mock).mockResolvedValue({});
    (api.wallet as jest.Mock).mockResolvedValue(walletAt());
  });

  it('shows the available balance, the withdrawable amount, and the Add money and Withdraw buttons', async () => {
    render(<HOWalletScreen />);

    expect(await screen.findByText('₱1,250.00')).toBeTruthy();
    expect(screen.getByText('Available balance')).toBeTruthy();
    expect(screen.getByText('₱1,000.00 available to withdraw')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add money' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy();
  });

  it('shows Held safely from escrow and Rewards from the recovery vouchers', async () => {
    render(<HOWalletScreen />);

    await screen.findByText('₱1,250.00');
    expect(screen.getByText('Held safely')).toBeTruthy();
    expect(screen.getByText('₱300.00')).toBeTruthy();
    expect(screen.getByText('Released when each job is done')).toBeTruthy();
    expect(screen.getByText('Rewards')).toBeTruthy();
    expect(screen.getByText('₱150.00')).toBeTruthy();
    expect(screen.getByText('1 voucher')).toBeTruthy();
  });

  it('counts each History pill, and pressing one shows only its transactions', async () => {
    render(<HOWalletScreen />);
    await screen.findByText('Wallet top-up');

    // Money in: top-up and voucher. Money out: the withdrawal. Held: the escrow hold.
    expect(screen.getByLabelText('All, 4')).toBeTruthy();
    expect(screen.getByLabelText('Money in, 2')).toBeTruthy();
    expect(screen.getByLabelText('Money out, 1')).toBeTruthy();
    expect(screen.getByLabelText('Held, 1')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Held, 1'));

    expect(screen.getByLabelText('Held, 1').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('wallet-txn-hold')).toBeTruthy();
    expect(screen.queryByTestId('wallet-txn-topup')).toBeNull();
  });

  it('groups the history under Today and Yesterday, with a plus or minus on each amount', async () => {
    render(<HOWalletScreen />);
    await screen.findByText('Wallet top-up');

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('+₱500.00')).toBeTruthy();
    expect(screen.getByText('−₱300.00')).toBeTruthy();
    expect(screen.getByText('+₱150.00')).toBeTruthy();
    expect(screen.getByText('−₱100.00')).toBeTruthy();
  });

  it('says what is missing when a filter has nothing to show', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt({ transactions: [topUp] }));
    render(<HOWalletScreen />);
    await screen.findByText('Wallet top-up');

    fireEvent.press(screen.getByLabelText('Held, 0'));

    expect(screen.getByText('Nothing held right now')).toBeTruthy();
  });

  it('shows the empty history when the wallet has no transactions yet', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt({ transactions: [] }));
    render(<HOWalletScreen />);

    expect(await screen.findByText('No transactions yet')).toBeTruthy();
    expect(screen.getByText('Your payments and wallet activity will appear here.')).toBeTruthy();
  });

  it('shows a failed wallet request as an error, not as an empty history', async () => {
    (api.wallet as jest.Mock).mockRejectedValue(new Error('Network error'));
    render(<HOWalletScreen />);

    expect(await screen.findByText('Network error')).toBeTruthy();
    expect(screen.queryByText('No transactions yet')).toBeNull();
  });

  it('lists a pending withdrawal under Recent withdrawals, and Cancel withdraws it and reloads', async () => {
    (api.withdrawals as jest.Mock).mockResolvedValue([
      { id: 'w1', title: 'Cash out to GCash', status: 'pending', amount: 100, created_at: dayAt(1), review_note: null },
    ]);
    render(<HOWalletScreen />);

    expect(await screen.findByText('Recent withdrawals')).toBeTruthy();
    expect(screen.getByText('Cash out to GCash')).toBeTruthy();

    // The reload after a cancel settles inside act, so no state update lands after the test.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cancel withdrawal, Cash out to GCash'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(api.cancelWithdrawal).toHaveBeenCalledWith('w1');
    expect(api.wallet).toHaveBeenCalledTimes(2);
    expect(api.withdrawals).toHaveBeenCalledTimes(2);
  });
});
