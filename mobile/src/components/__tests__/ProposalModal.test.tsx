import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ProposalModal, {
  PROPOSAL_MAX_LENGTH,
  PROPOSAL_MIN_LENGTH,
  canSendProposal,
} from '../ProposalModal';

describe('canSendProposal', () => {
  it('needs at least 20 characters once the spaces at both ends are not counted', () => {
    expect(PROPOSAL_MIN_LENGTH).toBe(20);
    expect(canSendProposal('a'.repeat(19))).toBe(false);
    expect(canSendProposal('a'.repeat(20))).toBe(true);
    expect(canSendProposal(`   ${'a'.repeat(10)}   `)).toBe(false);
    expect(canSendProposal(`   ${'a'.repeat(20)}   `)).toBe(true);
  });
});

describe('ProposalModal — a bottom sheet with tips and a minimum length', () => {
  const renderModal = (overrides: Partial<React.ComponentProps<typeof ProposalModal>> = {}) => {
    const props = {
      visible: true,
      jobTitle: 'Fix the sink',
      onSubmit: jest.fn(),
      onCancel: jest.fn(),
      ...overrides,
    };
    render(<ProposalModal {...props} />);
    return props;
  };
  const send = () => screen.getByRole('button', { name: 'Send proposal' });
  const message = () => screen.getByTestId('proposal-message');

  it('shows the title, the job, the tips and the notice', () => {
    renderModal();

    expect(screen.getByText('Send a proposal')).toBeTruthy();
    expect(screen.getByText('For "Fix the sink"')).toBeTruthy();
    expect(screen.getByText('Good proposals mention:')).toBeTruthy();
    expect(screen.getByText('When you can come')).toBeTruthy();
    expect(screen.getByText("What's included (tools, parts)")).toBeTruthy();
    expect(screen.getByText("Similar jobs you've done")).toBeTruthy();
    expect(screen.getByText("The client compares proposals and hires one provider. You'll be notified.")).toBeTruthy();
  });

  it('leaves out the job line when no job title is known', () => {
    renderModal({ jobTitle: undefined });

    expect(screen.queryByText(/^For "/)).toBeNull();
    expect(screen.getByText('Send a proposal')).toBeTruthy();
  });

  it('shows a live counter, and the minimum until it is reached', () => {
    renderModal();
    expect(screen.getByText('0 / 300 · at least 20 characters')).toBeTruthy();

    fireEvent.changeText(message(), 'a'.repeat(5));
    expect(screen.getByText('5 / 300 · at least 20 characters')).toBeTruthy();

    fireEvent.changeText(message(), 'a'.repeat(20));
    expect(screen.getByText('20 / 300')).toBeTruthy();
    expect(screen.queryByText(/at least 20/)).toBeNull();
  });

  it('keeps Send proposal tappable but only sends once the message has 20 characters', () => {
    const { onSubmit } = renderModal();

    fireEvent.changeText(message(), 'a'.repeat(19));
    expect(send().props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(send());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Add a few more words (at least 20 characters)')).toBeTruthy();

    fireEvent.changeText(message(), 'a'.repeat(20));
    expect(send().props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(send());
    expect(onSubmit).toHaveBeenCalledWith('a'.repeat(20));
  });

  it('sends the message without the spaces at either end', () => {
    const { onSubmit } = renderModal();

    fireEvent.changeText(message(), `  ${'a'.repeat(20)}  `);
    fireEvent.press(send());

    expect(onSubmit).toHaveBeenCalledWith('a'.repeat(20));
  });

  it('keeps the 300 character limit and closes from Cancel', () => {
    const { onCancel } = renderModal();

    expect(message().props.maxLength).toBe(PROPOSAL_MAX_LENGTH);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks the form while sending and shows the error', () => {
    renderModal({ busy: true, error: 'Could not send your proposal.' });

    expect(message().props.editable).toBe(false);
    expect(send().props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Could not send your proposal.')).toBeTruthy();
  });
});

describe('ProposalModal — the message is checked once the field is left', () => {
  const renderOpen = (onSubmit = jest.fn()) => {
    render(<ProposalModal visible jobTitle="Fix the sink" onSubmit={onSubmit} onCancel={jest.fn()} />);
    return { onSubmit };
  };
  const send = () => screen.getByRole('button', { name: 'Send proposal' });
  const message = () => screen.getByTestId('proposal-message');

  it('refuses a message of spaces alone, and says so only once the field is left', () => {
    renderOpen();
    fireEvent.changeText(message(), '        ');

    expect(screen.queryByText('Add your message')).toBeNull();
    fireEvent(message(), 'blur');
    expect(screen.getByText('Add your message')).toBeTruthy();
  });

  it('names how many more words a short message needs, and clears the words once it is long enough', () => {
    renderOpen();
    fireEvent.changeText(message(), 'a'.repeat(19));
    fireEvent(message(), 'blur');
    expect(screen.getByText('Add a few more words (at least 20 characters)')).toBeTruthy();

    fireEvent.changeText(message(), 'a'.repeat(20));
    expect(screen.queryByText('Add a few more words (at least 20 characters)')).toBeNull();
    expect(send().props.accessibilityState?.disabled).toBe(false);
  });

  it('sends the message with the spaces and blank lines at its ends removed, and the blank lines inside kept as typed', () => {
    const { onSubmit } = renderOpen();
    fireEvent.changeText(message(), '\n\n  I can come Friday.\n\n\n\nBring tools.  \n');

    fireEvent.press(send());

    expect(onSubmit).toHaveBeenCalledWith('I can come Friday.\n\n\n\nBring tools.');
  });
});

describe('ProposalModal — the platform fee breakdown (M15)', () => {
  const fee = { rate: 0.15, amount: 75, provider_receives: 425 };

  it('shows the job price, the fee and what the provider receives above the message', () => {
    render(<ProposalModal visible jobTitle="Fix the sink" jobBudget={500} fee={fee} onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const breakdown = screen.getByTestId('proposal-fee');
    expect(breakdown).toBeTruthy();
    expect(screen.getByLabelText('Job price ₱500.00 · Platform fee (15%) −₱75.00 · You receive ₱425.00')).toBeTruthy();
    expect(screen.getByText('Platform fee (15%)')).toBeTruthy();
    expect(screen.getByText('−₱75.00')).toBeTruthy();
    expect(screen.getByText('₱425.00')).toBeTruthy();
    expect(screen.getByText('You receive ₱425.00 when the client confirms the job is done')).toBeTruthy();
  });

  it('hides the breakdown when the job has no fee', () => {
    render(<ProposalModal visible jobTitle="Fix the sink" jobBudget={500} fee={null} onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.queryByTestId('proposal-fee')).toBeNull();
    expect(screen.queryByText(/Platform fee/)).toBeNull();
    expect(screen.queryByText(/You receive/)).toBeNull();
  });
});

describe('ProposalModal — payout account missing', () => {
  it('hides Send and offers only Link payout account', () => {
    const onLinkPayout = jest.fn();
    render(<ProposalModal visible payoutRequired onLinkPayout={onLinkPayout} onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Send proposal' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Link payout account' }));
    expect(onLinkPayout).toHaveBeenCalledTimes(1);
  });
});
