import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SPMyJobsScreen from '../SPMyJobsScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { clearRetainedState } from '../../../../src/hooks/useRetainedState';

jest.mock('../../../../src/lib/api', () => ({
  api: {
    myApplications: jest.fn(),
    assignedJobs: jest.fn(),
  },
}));

const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

const cancelledJob = {
  id: 'job-cancelled',
  title: 'Cancelled sink repair',
  status: 'cancelled',
  urgency: 'normal',
  address: '456 Side St',
  budget: 800,
  scheduled_at: null,
};

const activeJob = {
  id: 'job-active',
  title: 'Active cleaning',
  status: 'confirmed',
  urgency: 'normal',
  address: '789 Main St',
  budget: 1200,
  scheduled_at: null,
};

const completedJob = {
  id: 'job-completed',
  title: 'Completed handyman work',
  status: 'completed',
  urgency: 'normal',
  address: '12 Oak Ave',
  budget: 2000,
  scheduled_at: null,
};

describe('SPMyJobsScreen — declined-job visibility (Closed filter)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    clearRetainedState();
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.assignedJobs as jest.Mock).mockResolvedValue([cancelledJob, activeJob, completedJob]);
  });

  it('does not show a cancelled job under Booked or Done', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByRole('button', { name: 'Booked, 1' }));
    await waitFor(() => expect(screen.getByText('Active cleaning')).toBeTruthy());
    expect(screen.queryByText('Cancelled sink repair')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Done, 1' }));
    await waitFor(() => expect(screen.getByText('Completed handyman work')).toBeTruthy());
    expect(screen.queryByText('Cancelled sink repair')).toBeNull();
  });

  it('shows a cancelled job under Closed', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByRole('button', { name: 'Closed, 1' }));
    await waitFor(() => expect(screen.getByText('Cancelled sink repair')).toBeTruthy());
  });

  it('treats an expired job the same as cancelled', async () => {
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      { ...cancelledJob, id: 'job-expired', title: 'Expired job', status: 'expired' },
    ]);

    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    fireEvent.press(await screen.findByRole('button', { name: 'Closed, 1' }));
    await waitFor(() => expect(screen.getByText('Expired job')).toBeTruthy());
  });
});

function job(fields: Record<string, unknown> & { id: string; title: string; status: string }) {
  return {
    urgency: 'normal',
    address: 'Quezon City',
    budget: 800,
    scheduled_at: null,
    assigned_at: daysFromNow(-3),
    completed_at: null,
    job_tasks: [],
    ...fields,
  };
}

function application(id: string, status: string, applicationJob: ReturnType<typeof job>, appliedDaysAgo = 2) {
  return {
    id,
    status,
    applied_at: daysFromNow(-appliedDaysAgo),
    decided_at: null,
    jobs: { ...applicationJob },
  };
}

describe('SPMyJobsScreen — filters, groups and rows', () => {
  const pendingJob = job({ id: 'job-pending', title: 'Pending proposal job', status: 'open', budget: 300 });
  const rejectedJob = job({ id: 'job-rejected', title: 'Rejected job', status: 'open', budget: 450 });
  const hiredJob = job({ id: 'job-hired', title: 'Hired job', status: 'confirmed' });
  const checklistJob = job({
    id: 'job-working',
    title: 'Checklist job',
    status: 'in_progress',
    job_tasks: [
      { id: 't1', label: 'Drain', position: 0, is_done: true, completed_at: daysFromNow(-1) },
      { id: 't2', label: 'Seal', position: 1, is_done: false, completed_at: null },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    clearRetainedState();
    (api.myApplications as jest.Mock).mockResolvedValue([
      application('app-pending', 'pending', pendingJob),
      application('app-rejected', 'rejected', rejectedJob),
      application('app-accepted', 'accepted', hiredJob),
    ]);
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      checklistJob,
      job({ id: 'job-awaiting', title: 'Awaiting answer job', status: 'assigned' }),
      job({ id: 'job-hired', title: 'Confirmed job', status: 'confirmed', scheduled_at: daysFromNow(5) }),
      job({ id: 'job-finished', title: 'Finished job', status: 'completed', completed_at: daysFromNow(-4) }),
      job({ id: 'job-cancelled', title: 'Cancelled job', status: 'cancelled' }),
    ]);
  });

  it('shows each filter with its count, leaving out a proposal that became a hired job', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    expect(await screen.findByRole('button', { name: 'All, 7' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Applied, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Booked, 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Working, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Closed, 2' })).toBeTruthy();
  });

  it('under All, groups the rows under their headings with each row status line', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Checklist job')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Working' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Booked' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Applied' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Done' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Closed' })).toBeTruthy();

    expect(screen.getByText('Working · 1/2 tasks done')).toBeTruthy();
    expect(screen.getByText('Booked · Awaiting your answer')).toBeTruthy();
    expect(screen.getByText('Booked · Confirmed')).toBeTruthy();
    expect(screen.getByText('Applied · waiting')).toBeTruthy();
    // "Done" is also a pill and a heading, so the finished row is found by its label.
    expect(screen.getByLabelText('Finished job. Done. ₱800.00')).toBeTruthy();
    expect(screen.getByText('Closed · Not selected')).toBeTruthy();
    expect(screen.getByText('Closed · Cancelled')).toBeTruthy();
  });

  it('a filter shows only its rows, as one list without headings', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);
    await screen.findByText('Checklist job');

    fireEvent.press(screen.getByRole('button', { name: 'Booked, 2' }));

    expect(screen.getByText('Awaiting answer job')).toBeTruthy();
    expect(screen.getByText('Confirmed job')).toBeTruthy();
    expect(screen.queryByText('Checklist job')).toBeNull();
    expect(screen.queryByRole('header', { name: 'Booked' })).toBeNull();
  });

  it('a proposal row shows its budget and no date, since the proposal list does not carry one', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);
    await screen.findByText('Pending proposal job');

    fireEvent.press(screen.getByRole('button', { name: 'Applied, 1' }));

    expect(screen.getByText('Pending proposal job')).toBeTruthy();
    expect(screen.getByLabelText('No date yet')).toBeTruthy();
    expect(screen.getByText('₱300.00')).toBeTruthy();
  });

  it('a row opens its job, whether it is a hired job or a proposal', async () => {
    const navigate = jest.fn();
    render(<SPMyJobsScreen onNavigate={navigate} />);

    fireEvent.press(await screen.findByText('Pending proposal job'));
    expect(navigate).toHaveBeenCalledWith('Job Detail', 'job-pending');

    fireEvent.press(screen.getByText('Checklist job'));
    expect(navigate).toHaveBeenCalledWith('Job Detail', 'job-working');
  });

  it('an empty filter says what would show up there', async () => {
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.assignedJobs as jest.Mock).mockResolvedValue([
      job({ id: 'job-finished', title: 'Only finished job', status: 'completed', completed_at: daysFromNow(-1) }),
    ]);
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);
    await screen.findByText('Only finished job');

    fireEvent.press(screen.getByRole('button', { name: 'Working, 0' }));

    expect(screen.getByText('Nothing in progress')).toBeTruthy();
    expect(screen.queryByText('Only finished job')).toBeNull();
  });

  it('keeps the picked filter when the screen is left and opened again', async () => {
    const view = render(<SPMyJobsScreen onNavigate={jest.fn()} />);
    await screen.findByText('Checklist job');
    fireEvent.press(screen.getByRole('button', { name: 'Booked, 2' }));
    view.unmount();

    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    expect(await screen.findByRole('button', { name: 'Booked, 2', selected: true })).toBeTruthy();
    expect(screen.getByText('Confirmed job')).toBeTruthy();
  });
});

describe('SPMyJobsScreen — empty, error and title row', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    clearRetainedState();
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
  });

  it('with no jobs at all, All says so', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('No jobs yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All, 0' })).toBeTruthy();
  });

  it('a failed load shows the error, and Try again loads the rows', async () => {
    (api.assignedJobs as jest.Mock)
      .mockRejectedValueOnce(new Error('Unable to load jobs'))
      .mockResolvedValue([job({ id: 'job-done', title: 'Finished job', status: 'completed', completed_at: daysFromNow(-1) })]);

    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    expect(await screen.findByText('Unable to load jobs')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));

    expect(await screen.findByText('Finished job')).toBeTruthy();
    expect(screen.queryByText('Unable to load jobs')).toBeNull();
  });

  it('keeps My Work and the List/Calendar switch in the title row', async () => {
    render(
      <SPMyJobsScreen onNavigate={jest.fn()} headerRight={<Text>List or Calendar</Text>} />,
    );

    expect(screen.getByText('My Work')).toBeTruthy();
    expect(screen.getByText('List or Calendar')).toBeTruthy();
    expect(await screen.findByText('No jobs yet')).toBeTruthy();
  });
});

describe('SPMyJobsScreen — every control has an accessible name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAsyncDataCache();
    clearRetainedState();
    (api.myApplications as jest.Mock).mockResolvedValue([]);
    (api.assignedJobs as jest.Mock).mockResolvedValue([]);
  });

  it('names the filters, the title row and the empty state', async () => {
    render(<SPMyJobsScreen onNavigate={jest.fn()} />);

    await screen.findByText('No jobs yet');
    expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
  });
});
