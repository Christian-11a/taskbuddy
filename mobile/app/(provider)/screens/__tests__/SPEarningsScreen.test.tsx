import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPEarningsScreen from '../SPEarningsScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { maskDestination } from '../../../../src/lib/payoutLabels';
import { groupReleasedByMonth, summarizeEarnings } from '../../../../src/lib/earningsSummary';

jest.mock('../../../../src/lib/api', () => ({
  api: { paymentHistory: jest.fn(), assignedJobs: jest.fn() },
}));

const row = (over: Record<string, unknown>) => ({
  id: 'r', direction: 'credit', kind: 'payout', amount: 100, title: 'Payout', status: 'completed',
  withdrawal_destination: null, review_note: null, job_id: 'j1', created_at: '2026-10-10T10:00:00',
  ...over,
}) as any;

const NOW = new Date('2026-10-18T12:00:00');

describe('summarizeEarnings', () => {
  it('splits this month from the total at the month boundary and sums fees', () => {
    const rows = [
      row({ id: 'a', amount: 900, commission_amount: 100, created_at: '2026-10-01T00:00:00' }),
      row({ id: 'b', amount: 450, commission_amount: 50, created_at: '2026-09-30T23:59:59' }),
      row({ id: 'd', kind: 'withdrawal', direction: 'debit', status: 'pending', amount: 999, commission_amount: null }),
    ];
    const s = summarizeEarnings(rows, [], NOW);
    expect(s.paidThisMonth).toBe(900);
    expect(s.paidTotal).toBe(1350);
    expect(s.feesThisMonth).toBe(100);
  });

  it('has no fee figure when no row carries a commission', () => {
    const s = summarizeEarnings([row({ amount: 200 })], [], NOW);
    expect(s.feesThisMonth).toBeNull();
    expect(s.paidThisMonth).toBe(200);
  });

  it('counts money held on jobs in progress as on its way', () => {
    const jobs = [
      { status: 'in_progress', budget: 500 }, { status: 'confirmed', budget: '250' },
      { status: 'completed', budget: 900 }, { status: 'open', budget: 100 },
    ];
    expect(summarizeEarnings([], jobs, NOW).onItsWay).toBe(750);
  });
  it('counts what the provider receives and sets disputed jobs aside as on hold', () => {
    const jobs = [
      { status: 'in_progress', budget: 500, fee: { provider_receives: 450 } },
      { status: 'confirmed', budget: 300 },
      { status: 'in_progress', budget: 1000, display_status: 'disputed', fee: { provider_receives: 900 } },
      { status: 'completed', budget: 900 },
    ];
    const s = summarizeEarnings([], jobs, NOW);
    expect(s.onItsWay).toBe(750);
    expect(s.onHold).toBe(900);
  });

  it('groups released rows by month with released and fee totals', () => {
    const groups = groupReleasedByMonth([
      row({ id: 'a', amount: 900, commission_amount: 100, created_at: '2026-10-01T00:00:00' }),
      row({ id: 'b', amount: 450, commission_amount: 50, created_at: '2026-09-30T12:00:00' }),
      row({ id: 'c', amount: 100, commission_amount: 10, created_at: '2026-10-05T12:00:00' }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['October 2026', 'September 2026']);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['c', 'a']);
    expect(groups[0].summary).toBe('Released ₱1,000.00 · Fees ₱110.00');
  });

  it('leaves the fees part off a month with no fee figures', () => {
    const [g] = groupReleasedByMonth([row({ id: 'a', amount: 425.85, created_at: '2026-10-01T00:00:00' })]);
    expect(g.summary).toBe('Released ₱425.85');
  });

  it('masks long digit runs in a destination', () => {
    expect(maskDestination('GCash 09171234567 - TEST ONLY')).toBe('GCash •••• 4567 - TEST ONLY');
    expect(maskDestination('GCash')).toBe('GCash');
    expect(maskDestination(null)).toBe('');
  });
});

describe('SPEarningsScreen', () => {
  beforeEach(() => {
    clearAsyncDataCache();
    jest.clearAllMocks();
    (api.assignedJobs as jest.Mock).mockResolvedValue([{ id: 'j1', title: 'Fix the sink', status: 'completed', budget: 1000 }]);
  });

  it('lists payouts with job title, fee and status, and opens the job on tap', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([
      row({ id: 'a', amount: 900, commission_amount: 100, created_at: new Date().toISOString() }),
    ]);
    const onOpenJob = jest.fn();
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={onOpenJob} />);
    expect(await screen.findByText('Fix the sink')).toBeTruthy();
    expect(screen.getByTestId('payout-fee')).toBeTruthy();
    expect(screen.getByText('Platform fees this month')).toBeTruthy();
    expect(screen.getByText(/Payouts go to your GCash, Maya or bank account/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('payout-row'));
    expect(onOpenJob).toHaveBeenCalledWith('j1');
  });

  it('shows each send with its own status in a separate section', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([
      row({ id: 'a' }),
      row({ id: 'w1', kind: 'withdrawal', direction: 'debit', status: 'failed', job_id: null, amount: 500, withdrawal_destination: 'GCash' }),
    ]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await screen.findByText('Fix the sink');
    expect(screen.getByTestId('send-status').props.children).toBe('Failed');
    expect(screen.getAllByTestId('payout-row')).toHaveLength(1);
  });

  it('hides fee figures when the server does not send them', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([row({ id: 'a' })]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await screen.findByText('Fix the sink');
    expect(screen.queryByTestId('payout-fee')).toBeNull();
    expect(screen.queryByText('Platform fees this month')).toBeNull();
  });

  it('still shows payouts when the job lookup fails, without On its way', async () => {
    (api.assignedJobs as jest.Mock).mockRejectedValue(new Error('nope'));
    (api.paymentHistory as jest.Mock).mockResolvedValue([row({ id: 'a', title: 'Payout' })]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('payout-row')).toBeTruthy());
    expect(screen.queryByText('On its way')).toBeNull();
    expect(screen.getByText('Payout')).toBeTruthy();
  });

  it('draws released rows as a green +amount with the fee underneath and a natural spoken label', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([
      row({ id: 'a', amount: 255, commission_amount: 45, created_at: new Date().toISOString() }),
    ]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await screen.findByText('Fix the sink');
    expect(screen.getByTestId('payout-amount').props.children).toEqual(['+', expect.stringContaining('255')]);
    expect(screen.getByTestId('payout-fee').props.children.join('')).toContain('−');
    expect(screen.getByLabelText(/Released 255 pesos to you\. Platform fee 45 pesos/)).toBeTruthy();
    expect(screen.getByText(/^Released .* · Fees /)).toBeTruthy();
  });

  it('shows sends without a sign, with a status pill', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([
      row({ id: 'w1', kind: 'withdrawal', direction: 'debit', status: 'completed', job_id: null, amount: 500, withdrawal_destination: 'GCash 09171234567' }),
    ]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('send-row')).toBeTruthy());
    expect(screen.getByTestId('send-status').props.children).toBe('Sent');
    expect(screen.queryByText(/09171234567/)).toBeNull();
    expect(screen.getByLabelText('500 pesos sent to your account, Sent')).toBeTruthy();
  });

  it('shows disputed jobs as an on-hold line, not on its way', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([]);
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      { id: 'j1', title: 'A', status: 'in_progress', budget: 400 },
      { id: 'j2', title: 'B', status: 'in_progress', budget: 600, display_status: 'disputed' },
    ]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    const line = await screen.findByTestId('on-hold');
    expect(line.props.children.join('')).toContain('On hold: complaint open');
    expect(line.props.children.join('')).toContain('600');
    expect(screen.getByTestId('summary-way').findByProps({ children: '₱400.00' })).toBeTruthy();
  });

  it('reloads both reads on pull to refresh and stops the spinner', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([row({ id: 'a' })]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await screen.findByText('Fix the sink');
    const { RefreshControl } = require('react-native');
    const control = screen.UNSAFE_getByType(RefreshControl);
    await act(async () => { control.props.onRefresh(); });
    await waitFor(() => expect(api.paymentHistory).toHaveBeenCalledTimes(2));
    expect(api.assignedJobs).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false));
  });

  it('shows an empty state', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('No payouts yet.')).toBeTruthy());
    expect(screen.getByText('Nothing sent yet.')).toBeTruthy();
  });
});
