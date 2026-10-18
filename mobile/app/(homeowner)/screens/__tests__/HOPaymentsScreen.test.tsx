import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import HOPaymentsScreen from '../HOPaymentsScreen';
import { api, type Job } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn(), getJob: jest.fn(), jobDispute: jest.fn() },
}));

const DAY_MS = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

function job(fields: Partial<Job> & Pick<Job, 'id' | 'title' | 'status'>): Job {
  return {
    assigned_provider_id: 'p1', budget: 1000, posted_at: ago(0), assigned_at: ago(0), created_at: ago(0),
    ...fields,
  } as Job;
}

function mockJobs(jobs: Job[], escrows: Record<string, string | null> = {}, resolution: string | null = null) {
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  (api.getJob as jest.Mock).mockImplementation(async (id: string) => ({
    ...jobs.find((j) => j.id === id),
    escrow: escrows[id] ? { status: escrows[id] } : null,
  }));
  (api.jobDispute as jest.Mock).mockResolvedValue(resolution ? { resolution } : null);
}

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
});

it('sums paid this month (released and held) and held on active jobs', async () => {
  mockJobs(
    [
      job({ id: 'a', title: 'Fix sink', status: 'completed', budget: 500 }),
      job({ id: 'b', title: 'Paint wall', status: 'in_progress', budget: 700 }),
      job({ id: 'c', title: 'Old job', status: 'completed', budget: 900, assigned_at: ago(60), posted_at: ago(60) }),
    ],
    { a: 'released', b: 'held', c: 'released' },
  );
  render(<HOPaymentsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);

  const now = new Date();
  const olderIsOtherMonth = new Date(Date.now() - 60 * DAY_MS).getMonth() !== now.getMonth();
  await waitFor(() => expect(screen.getByTestId('held-total').props.children).toBe('₱700.00'));
  expect(screen.getByTestId('paid-this-month').props.children).toBe(olderIsOtherMonth ? '₱500.00' : '₱1,400.00');
});

it('labels each payment state with its sign, pill and caption', async () => {
  mockJobs(
    [
      job({ id: 'h', title: 'Held job', status: 'confirmed' }),
      job({ id: 'r', title: 'Done job', status: 'completed', assigned_provider: { full_name: 'Ana Cruz' } }),
      job({ id: 'f', title: 'Refunded job', status: 'cancelled' }),
      job({ id: 'p', title: 'Pending refund', status: 'cancelled' }),
    ],
    { h: 'held', r: 'released', f: 'refunded', p: null },
  );
  render(<HOPaymentsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);

  await screen.findByText('Held job');
  expect(screen.getAllByTestId('payment-state').map((n) => n.props.children).sort()).toEqual([
    'Held until you confirm the job is done',
    'Paid to Ana Cruz',
    'Refund on its way',
    'Refunded to your payment method',
  ]);
  expect(screen.getAllByText('−₱1,000.00')).toHaveLength(2);
  expect(screen.getAllByText('+₱1,000.00')).toHaveLength(2);
  expect(screen.getAllByText('On hold')).toHaveLength(3); // card, chip, row pill
  expect(screen.getByText('Processing')).toBeTruthy();
  expect(screen.getByLabelText('Done job. Paid 1000 pesos to Ana Cruz')).toBeTruthy();
  expect(screen.getByLabelText('Refunded job. Refunded 1000 pesos')).toBeTruthy();
  expect(screen.getByText('− money you paid · + money back to you')).toBeTruthy();
});

it('groups by month and filters with the chips', async () => {
  mockJobs(
    [
      job({ id: 'a', title: 'Fix sink', status: 'completed' }),
      job({ id: 'b', title: 'Held job', status: 'confirmed' }),
      job({ id: 'c', title: 'Refunded job', status: 'cancelled' }),
    ],
    { a: 'released', b: 'held', c: 'refunded' },
  );
  render(<HOPaymentsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);

  await screen.findByText('Fix sink');
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  expect(screen.getByText(month)).toBeTruthy();
  expect(screen.getByText('Paid ₱1,000.00 · Refunded ₱1,000.00')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Refunds'));
  expect(screen.queryByText('Fix sink')).toBeNull();
  expect(screen.getByText('Refunded job')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('On hold'));
  expect(screen.getByText('Held job')).toBeTruthy();
  expect(screen.queryByText('Refunded job')).toBeNull();
  fireEvent.press(screen.getByLabelText('Paid'));
  expect(screen.getByText('Fix sink')).toBeTruthy();
  expect(screen.queryByText('Held job')).toBeNull();
});

it('shows a cancelled job as paid when the dispute was resolved that way', async () => {
  mockJobs([job({ id: 'x', title: 'Cancelled', status: 'cancelled' })], { x: 'disputed' }, 'released_to_provider');
  render(<HOPaymentsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);

  expect(await screen.findByText('Paid to your provider')).toBeTruthy();
});

it('shows the empty state', async () => {
  mockJobs([job({ id: 'o', title: 'Open job', status: 'open', assigned_provider_id: null })]);
  render(<HOPaymentsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);

  expect(await screen.findByText(/No payments yet/)).toBeTruthy();
});

it('opens the job when a row is tapped, and goes back', async () => {
  mockJobs([job({ id: 'a', title: 'Fix sink', status: 'completed' })], { a: 'released' });
  const onOpenJob = jest.fn();
  const onBack = jest.fn();
  render(<HOPaymentsScreen onBack={onBack} onOpenJob={onOpenJob} />);

  fireEvent.press(await screen.findByText('Fix sink'));
  expect(onOpenJob).toHaveBeenCalledWith('a');
  fireEvent.press(screen.getByLabelText('Back'));
  expect(onBack).toHaveBeenCalled();
});

describe('HOPaymentsScreen pull-to-refresh', () => {
  const pullControl = () =>
    screen.UNSAFE_getAllByType(ScrollView).find((node) => node.props.refreshControl)!.props.refreshControl;

  it('pulling reloads the jobs list and each job read', async () => {
    mockJobs([job({ id: 'a', title: 'Fix sink', status: 'completed' })], { a: 'released' });
    render(<HOPaymentsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await screen.findByText('Fix sink');
    (api.myJobs as jest.Mock).mockClear();
    (api.getJob as jest.Mock).mockClear();

    await act(async () => {
      pullControl().props.onRefresh();
    });

    await waitFor(() => expect(api.myJobs).toHaveBeenCalledTimes(1));
    expect(api.getJob).toHaveBeenCalledWith('a');
    await waitFor(() => expect(pullControl().props.refreshing).toBe(false));
  });

  it('stops the spinner when the reload fails', async () => {
    mockJobs([job({ id: 'a', title: 'Fix sink', status: 'completed' })], { a: 'released' });
    render(<HOPaymentsScreen onBack={jest.fn()} onOpenJob={jest.fn()} />);
    await screen.findByText('Fix sink');
    (api.myJobs as jest.Mock).mockClear();
    (api.myJobs as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      pullControl().props.onRefresh();
    });

    await waitFor(() => expect(api.myJobs).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pullControl().props.refreshing).toBe(false));
  });
});
