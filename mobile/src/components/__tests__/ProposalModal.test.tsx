import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ProposalModal, { PROPOSAL_MAX_LENGTH, canSendProposal, proposalError } from '../ProposalModal';

describe('proposalError: the message is optional', () => {
  it('accepts no message, or spaces only', () => {
    expect(proposalError('')).toBeNull();
    expect(proposalError('    ')).toBeNull();
    expect(canSendProposal('')).toBe(true);
  });
  it('accepts a short message', () => {
    expect(proposalError('Hi po')).toBeNull();
  });
  it('refuses a message over the limit', () => {
    expect(proposalError('a'.repeat(PROPOSAL_MAX_LENGTH + 1))).toMatch(/Keep it under 300/);
  });
});

describe('ProposalModal — a bottom sheet with tips and an optional message', () => {
  const renderModal = (overrides: Partial<React.ComponentProps<typeof ProposalModal>> = {}) => {
    const props = {
      visible: true,
      jobTitle: 'Fix the sink',
      jobBudget: 1000,
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
    expect(screen.getByText('How you will handle the listed tasks')).toBeTruthy();
    expect(screen.getByText("Similar jobs you've done")).toBeTruthy();
    expect(screen.getByText("The client compares proposals and hires one provider. You'll be notified.")).toBeTruthy();
  });

  it('leaves out the job line when no job title is known', () => {
    renderModal({ jobTitle: undefined });

    expect(screen.queryByText(/^For "/)).toBeNull();
    expect(screen.getByText('Send a proposal')).toBeTruthy();
  });

  it('labels the message optional and shows a live counter', () => {
    renderModal();
    expect(screen.getByText('Your message (optional)')).toBeTruthy();
    expect(screen.getByText('Optional · 0 / 300')).toBeTruthy();
    fireEvent.changeText(message(), 'Hi po');
    expect(screen.getByText('Optional · 5 / 300')).toBeTruthy();
  });

  it('sends a proposal with no message at all', () => {
    const { onSubmit } = renderModal();
    fireEvent.press(send());
    expect(onSubmit).toHaveBeenCalledWith('', 1000);
  });

  it('sends a short message as typed', () => {
    const { onSubmit } = renderModal();
    fireEvent.changeText(message(), 'Hi po');
    fireEvent.press(send());
    expect(onSubmit).toHaveBeenCalledWith('Hi po', 1000);
  });

  it('turns a message of spaces alone into no message', () => {
    const { onSubmit } = renderModal();
    fireEvent.changeText(message(), '     ');
    fireEvent.press(send());
    expect(onSubmit).toHaveBeenCalledWith('', 1000);
  });

  it('sends the message without the spaces at either end', () => {
    const { onSubmit } = renderModal();

    fireEvent.changeText(message(), `  ${'a'.repeat(20)}  `);
    fireEvent.press(send());

    expect(onSubmit).toHaveBeenCalledWith('a'.repeat(20), 1000);
  });

  it('submits one different total quote when the provider chooses it', () => {
    const { onSubmit } = renderModal();
    fireEvent.press(screen.getByRole('button', { name: 'Quote a different total' }));
    fireEvent.changeText(screen.getByTestId('proposal-quote'), '1250');
    fireEvent.changeText(message(), 'I can complete the listed tasks tomorrow.');
    fireEvent.press(send());

    expect(onSubmit).toHaveBeenCalledWith('I can complete the listed tasks tomorrow.', 1250);
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
    render(<ProposalModal visible jobTitle="Fix the sink" jobBudget={1000} onSubmit={onSubmit} onCancel={jest.fn()} />);
    return { onSubmit };
  };
  const send = () => screen.getByRole('button', { name: 'Send proposal' });
  const message = () => screen.getByTestId('proposal-message');

  it('sends the message with the spaces and blank lines at its ends removed, and the blank lines inside kept as typed', () => {
    const { onSubmit } = renderOpen();
    fireEvent.changeText(message(), '\n\n  I can come Friday.\n\n\n\nBring tools.  \n');

    fireEvent.press(send());

    expect(onSubmit).toHaveBeenCalledWith('I can come Friday.\n\n\n\nBring tools.', 1000);
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
