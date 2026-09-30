import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOWalletScreen from '../HOWalletScreen';
import { api } from '../../../../src/lib/api';
import { showToast } from '../../../../src/components/Toast';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { openRedirectSession } from '../../../../src/lib/appRedirectSession';

jest.mock('../../../../src/lib/api', () => ({
  MIN_TOPUP_PHP: 20,
  api: {
    wallet: jest.fn(),
    withdrawals: jest.fn(),
    createCheckoutSession: jest.fn(),
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
    // The withdraw modal opened (its body copy is unique — the button and
    // the modal title both just say "Withdraw").
    expect(
      screen.getByText(/Send a request to withdraw your available wallet balance/),
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
    jest.useRealTimers();
  });

  const startTopup = async () => {
    render(<HOWalletScreen />);
    await waitFor(() => expect(screen.getByText('Add Money')).toBeTruthy());
    fireEvent.press(screen.getByText('Add Money'));
    fireEvent.press(screen.getByTestId('wallet-quick-500'));
    fireEvent.press(screen.getByTestId('wallet-add-money-continue'));
  };

  it('shows a "Money added" result with only a Done button once the credit lands', async () => {
    (api.wallet as jest.Mock)
      .mockResolvedValueOnce(walletAt(0)) // initial load
      .mockResolvedValue(walletAt(500)); // first poll sees the credit
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=success',
    });

    await startTopup();

    await waitFor(() => expect(screen.getByText('Money added')).toBeTruthy(), { timeout: 30000 });
    expect(screen.getByTestId('wallet-topup-done')).toBeTruthy();
    expect(screen.queryByTestId('wallet-add-money-continue')).toBeNull();
  });

  it('shows "Payment received" (not the form) when the credit has not landed yet, and Done never re-opens Stripe', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0)); // webhook never arrives during the poll
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=success',
    });

    await startTopup();

    await waitFor(() => expect(screen.getByText('Payment received')).toBeTruthy(), { timeout: 60000 });
    expect(screen.queryByTestId('wallet-add-money-continue')).toBeNull();

    fireEvent.press(screen.getByTestId('wallet-topup-done'));

    await waitFor(() => expect(screen.queryByTestId('wallet-topup-done')).toBeNull());
    expect(api.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(openRedirectSession).toHaveBeenCalledTimes(1);
  });

  it('opens a fresh form (no leftover result) when Add Money is tapped again after Done', async () => {
    (api.wallet as jest.Mock)
      .mockResolvedValueOnce(walletAt(0))
      .mockResolvedValue(walletAt(500));
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=success',
    });

    await startTopup();
    await waitFor(() => expect(screen.getByText('Money added')).toBeTruthy(), { timeout: 30000 });
    fireEvent.press(screen.getByTestId('wallet-topup-done'));
    await waitFor(() => expect(screen.queryByTestId('wallet-topup-done')).toBeNull());

    fireEvent.press(screen.getByText('Add Money'));

    expect(screen.queryByText('Money added')).toBeNull();
    expect(screen.getByTestId('wallet-add-money-continue')).toBeTruthy();
  });

  it('keeps the form with Continue (so the user can retry) when the payment was cancelled', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0));
    (openRedirectSession as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'taskbuddy://?topup=cancelled',
    });

    await startTopup();

    await waitFor(() => expect(screen.getByText('Payment was cancelled.')).toBeTruthy());
    expect(screen.getByTestId('wallet-add-money-continue')).toBeTruthy();
    expect(screen.queryByTestId('wallet-topup-done')).toBeNull();
  });

  it('keeps the form without a result when the browser is dismissed', async () => {
    (api.wallet as jest.Mock).mockResolvedValue(walletAt(0));
    (openRedirectSession as jest.Mock).mockResolvedValue({ type: 'dismiss' });

    await startTopup();

    await waitFor(() => expect(openRedirectSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('wallet-add-money-continue')).toBeTruthy());
    expect(screen.queryByTestId('wallet-topup-done')).toBeNull();
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
