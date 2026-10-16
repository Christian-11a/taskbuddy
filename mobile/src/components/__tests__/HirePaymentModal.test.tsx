import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HirePaymentModal from '../HirePaymentModal';

jest.mock('../../lib/api', () => ({
  MIN_TOPUP_PHP: 50,
  MAX_CARD_PHP: 100000,
}));

type Props = React.ComponentProps<typeof HirePaymentModal>;

function renderSheet(overrides: Partial<Props> = {}) {
  const props: Props = {
    visible: true,
    providerName: 'Alex Reyes',
    jobTitle: 'Window cleaning',
    budget: 1000,
    busy: null,
    message: null,
    onPayWallet: jest.fn(),
    onPayCard: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  const view = render(<HirePaymentModal {...props} />);
  return { props, view };
}

const ONLINE = "GCash, Maya, card or bank, ₱1,000.00 on Xendit's secure page (test mode)";
const onlineRadio = () => screen.getByRole('radio', { name: ONLINE });

describe('HirePaymentModal: paying online', () => {
  it('shows the job, the amount and the escrow promise, and no wallet', () => {
    renderSheet();

    expect(screen.getByRole('header', { name: 'Hire Alex Reyes' })).toBeTruthy();
    expect(screen.getByText('Window cleaning')).toBeTruthy();
    expect(screen.getByLabelText('Amount ₱1,000.00')).toBeTruthy();
    expect(screen.getByText(/held in escrow/)).toBeTruthy();
    expect(screen.queryByText(/Wallet/)).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('keeps Continue disabled until the online option is picked, and picking it pays nothing', () => {
    const { props } = renderSheet();

    expect(screen.getByRole('button', { name: 'Continue', disabled: true })).toBeTruthy();
    fireEvent.press(onlineRadio());
    expect(screen.getByRole('button', { name: 'Continue', disabled: false })).toBeTruthy();
    expect(props.onPayCard).not.toHaveBeenCalled();
  });

  it('Confirm opens the online checkout exactly once', () => {
    const { props } = renderSheet();

    fireEvent.press(onlineRadio());
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('GCash, Maya, card or bank')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire · ₱1,000.00' }));

    expect(props.onPayCard).toHaveBeenCalledTimes(1);
    expect(props.onPayWallet).not.toHaveBeenCalled();
  });

  it('Back returns to the choice page with the option still selected', () => {
    renderSheet();

    fireEvent.press(onlineRadio());
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('radio', { name: ONLINE, selected: true })).toBeTruthy();
  });

  it('Cancel closes the sheet and pays nothing', () => {
    const { props } = renderSheet();

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onPayCard).not.toHaveBeenCalled();
  });

  it('explains why online payment is unavailable outside its limits', () => {
    const { props, view } = renderSheet({ budget: 20 });

    expect(
      screen.getByRole('radio', { name: 'GCash, Maya, card or bank, Online payments need at least ₱50.00', disabled: true }),
    ).toBeTruthy();

    view.rerender(<HirePaymentModal {...props} budget={150000} />);

    expect(
      screen.getByRole('radio', {
        name: "GCash, Maya, card or bank, Online payments can't take more than ₱100,000.00",
        disabled: true,
      }),
    ).toBeTruthy();
  });

  it('a job without a budget skips the choice: Hire goes straight to the confirm page', () => {
    const { props } = renderSheet({ budget: null });

    expect(screen.queryByText('Pay with')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Hire Alex Reyes' }));
    expect(screen.getByText("Nothing is held — they're hired straight away.")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire' }));

    expect(props.onPayWallet).toHaveBeenCalledTimes(1);
    expect(props.onPayCard).not.toHaveBeenCalled();
  });

  it('nothing can be chosen while the job is still loading', () => {
    renderSheet({ loading: true });

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue', disabled: true })).toBeTruthy();
  });

  it('shows the message from the last attempt under the options', () => {
    renderSheet({ message: { text: 'Payment was cancelled.', tone: 'info' } });

    expect(screen.getByTestId('hire-payment-message').props.children).toBe('Payment was cancelled.');
  });
});

describe('HirePaymentModal: when the job could not be loaded', () => {
  const loadError = { text: 'Could not reach TaskBuddy.', tone: 'error' as const };

  it('offers no hire: no escrow or no-budget copy, no options, Continue disabled, Cancel still works', () => {
    const { props } = renderSheet({ budget: null, jobTitle: null, loadFailed: true, message: loadError });

    expect(screen.getByTestId('hire-payment-message').props.children).toBe('Could not reach TaskBuddy.');
    expect(screen.queryByText(/Nothing is held/)).toBeNull();
    expect(screen.queryByText(/no budget/)).toBeNull();
    expect(screen.queryByText(/held in escrow/)).toBeNull();
    expect(screen.queryByText('Pay with')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue', disabled: true })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onPayWallet).not.toHaveBeenCalled();
    expect(props.onPayCard).not.toHaveBeenCalled();
  });

  it('Continue cannot reach the confirm page, so nothing is paid', () => {
    const { props } = renderSheet({ budget: null, loadFailed: true, message: loadError });

    fireEvent.press(screen.getByRole('button', { name: 'Continue', disabled: true }));

    expect(screen.queryByRole('button', { name: 'Confirm and hire' })).toBeNull();
    expect(props.onPayWallet).not.toHaveBeenCalled();
  });

  it('a job that loaded with a zero budget still hires straight away, as a real no-budget job does', () => {
    const { props } = renderSheet({ budget: 0 });

    expect(screen.queryByText('Pay with')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Hire Alex Reyes' }));
    expect(screen.getByText("Nothing is held — they're hired straight away.")).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire' }));
    expect(props.onPayWallet).toHaveBeenCalledTimes(1);
    expect(props.onPayCard).not.toHaveBeenCalled();
  });
});

describe('HirePaymentModal: a card payment that is still being confirmed', () => {
  const STILL_CONFIRMING = "We're still confirming your payment. If you already paid, please don't pay again.";

  it('explains the wait, and offers only a status check and starting over', () => {
    renderSheet({
      awaiting: { onCheckPayment: jest.fn(), onStartNewPayment: jest.fn() },
      message: { text: 'No payment was confirmed. If you did pay, your hire will appear shortly.', tone: 'info' },
    });

    expect(screen.getByRole('header', { name: 'Hire Alex Reyes' })).toBeTruthy();
    expect(screen.getByText(STILL_CONFIRMING)).toBeTruthy();
    expect(screen.getByText('Window cleaning')).toBeTruthy();
    expect(screen.getByTestId('hire-payment-message').props.children).toBe(
      'No payment was confirmed. If you did pay, your hire will appear shortly.',
    );
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a new payment' })).toBeTruthy();
    expect(screen.queryByText('Pay with')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Confirm and hire/ })).toBeNull();
  });

  it('Check payment status runs one check, and while the check runs the sheet is locked', () => {
    const { props, view } = renderSheet({ awaiting: { onCheckPayment: jest.fn(), onStartNewPayment: jest.fn() } });

    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    expect(props.awaiting!.onCheckPayment).toHaveBeenCalledTimes(1);

    view.rerender(<HirePaymentModal {...props} busy="check" />);
    expect(screen.getByRole('button', { name: 'Check payment status', disabled: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a new payment', disabled: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close', disabled: true })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Check payment status' }));
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(props.awaiting!.onCheckPayment).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Start a new payment asks in a centred dialog first: Keep waiting changes nothing, Yes, start over calls onStartNewPayment', () => {
    const { props } = renderSheet({ awaiting: { onCheckPayment: jest.fn(), onStartNewPayment: jest.fn() } });

    fireEvent.press(screen.getByRole('button', { name: 'Start a new payment' }));
    expect(screen.getByText('Start a new payment?')).toBeTruthy();
    expect(
      screen.getByText(
        'Only do this if you did not complete the payment. If you already paid, wait a moment and check the status instead.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Keep waiting' }));
    expect(props.awaiting!.onStartNewPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Start a new payment' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, start over' }));
    expect(props.awaiting!.onStartNewPayment).toHaveBeenCalledTimes(1);
    expect(props.onPayWallet).not.toHaveBeenCalled();
    expect(props.onPayCard).not.toHaveBeenCalled();
  });

  it('once the wait is over, the pay options return on the choice page with nothing selected', () => {
    const onStartNewPayment = jest.fn();
    const { props, view } = renderSheet();

    // The payment was started from the confirm page, then the wait began.
    fireEvent.press(onlineRadio());
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    view.rerender(
      <HirePaymentModal {...props} awaiting={{ onCheckPayment: jest.fn(), onStartNewPayment }} />,
    );
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Start a new payment' }));
    fireEvent.press(screen.getByRole('button', { name: 'Yes, start over' }));
    expect(onStartNewPayment).toHaveBeenCalledTimes(1);

    view.rerender(<HirePaymentModal {...props} awaiting={null} />);
    expect(screen.getByText('Pay with')).toBeTruthy();
    expect(screen.getByRole('radio', { name: ONLINE, selected: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue', disabled: true })).toBeTruthy();
  });
});

describe('HirePaymentModal: the sheet stays locked while a payment is in flight', () => {
  it('disables Cancel and Back, and keeps the confirm button labelled while busy', () => {
    const { props, view } = renderSheet({ busy: null });

    fireEvent.press(onlineRadio());
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    view.rerender(
      <HirePaymentModal
        visible
        providerName="Alex Reyes"
        jobTitle="Window cleaning"
        budget={1000}
        busy="card"
        message={null}
        onPayWallet={props.onPayWallet}
        onPayCard={props.onPayCard}
        onClose={props.onClose}
      />,
    );

    expect(screen.getByRole('button', { name: 'Back', disabled: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm and hire · ₱1,000.00', disabled: true })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Confirm and hire · ₱1,000.00' }));
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));

    expect(props.onPayCard).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
