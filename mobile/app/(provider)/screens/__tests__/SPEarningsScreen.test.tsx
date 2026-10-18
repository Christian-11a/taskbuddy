import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPEarningsScreen from '../SPEarningsScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { summarizeEarnings } from '../../../../src/lib/earningsSummary';

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

  it('shows an empty state', async () => {
    (api.paymentHistory as jest.Mock).mockResolvedValue([]);
    render(<SPEarningsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('No payouts yet.')).toBeTruthy());
    expect(screen.getByText('Nothing sent yet.')).toBeTruthy();
  });
});
