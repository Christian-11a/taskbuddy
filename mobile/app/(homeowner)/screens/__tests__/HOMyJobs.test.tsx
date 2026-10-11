import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { ScrollView } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import MyJobs from '../HOMyJobs';
import { api, type Job, type JobApplication } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { clearRetainedState } from '../../../../src/hooks/useRetainedState';
import ViewSwitch from '../../../../src/components/ui/ViewSwitch';

jest.mock('../../../../src/context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'client' } }),
}));
jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn(), jobApplications: jest.fn() },
}));

const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

function makeJob(fields: Partial<Job> & Pick<Job, 'id' | 'title' | 'status'>): Job {
  return {
    client_id: 'client',
    category_id: 1,
    description: '',
    urgency: 'normal',
    address: 'Quezon City',
    latitude: 14.6,
    longitude: 121,
    provider_accept_address: null,
    provider_accept_latitude: null,
    provider_accept_longitude: null,
    posted_at: daysFromNow(-3),
    assigned_provider_id: null,
    assigned_at: null,
    completed_at: null,
    budget: 500,
    scheduled_at: null,
    photo_urls: [],
    created_at: daysFromNow(-3),
    ...fields,
  } as Job;
}

function application(status: JobApplication['status']): JobApplication {
  return { id: `app-${status}`, status } as JobApplication;
}

// Dates are far enough from today that the groups do not depend on the weekday.
const jobs = [
  makeJob({ id: 'needs', title: 'Cleaning: Window cleaning', status: 'open' }),
  makeJob({ id: 'waiting', title: 'Handyman: Fix cabinet door', status: 'open' }),
  makeJob({ id: 'booked', title: 'Plumbing: Fix toilet', status: 'confirmed', scheduled_at: daysFromNow(20) }),
  makeJob({ id: 'working', title: 'Painting: Living room', status: 'in_progress', scheduled_at: daysFromNow(25) }),
  makeJob({ id: 'done', title: 'Plumbing: Leaking faucet', status: 'completed', scheduled_at: daysFromNow(-10) }),
  makeJob({ id: 'cancelled', title: 'Electrical: Outlet check', status: 'cancelled' }),
  makeJob({ id: 'expired', title: 'Deep clean: Kitchen', status: 'expired' }),
];

const proposalsByJob: Record<string, JobApplication[]> = {
  needs: [application('pending'), application('pending'), application('rejected')],
  waiting: [application('rejected')],
};

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  clearRetainedState();
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  (api.jobApplications as jest.Mock).mockImplementation(
    async (id: string) => proposalsByJob[id] ?? [],
  );
});
afterEach(() => jest.restoreAllMocks());

it('loads every job once, without filters', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');
  expect(api.myJobs).toHaveBeenCalledTimes(1);
  expect(api.myJobs).toHaveBeenCalledWith();
});

it('shows each filter with its count, counting proposals once they load', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');
  expect(await screen.findByRole('button', { name: 'Needs you, 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'All, 7' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Booked, 2' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Waiting, 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Done, 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Closed, 2' })).toBeTruthy();
});

it('groups the live jobs by date, and shows the finished ones under FINISHED', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');
  expect(screen.getByText('Later')).toBeTruthy();
  expect(screen.getByText('No date yet')).toBeTruthy();
  expect(screen.getByText('Finished')).toBeTruthy();
  expect(screen.getByText('Plumbing: Leaking faucet')).toBeTruthy();
  expect(screen.queryByText('This week')).toBeNull();
  expect(screen.queryByText('Earlier')).toBeNull();
});

it('shows each job with its status line', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  expect(await screen.findByText('2 proposals to review')).toBeTruthy();
  expect(screen.getByText('Open · waiting for offers')).toBeTruthy();
  expect(screen.getByText('Confirmed')).toBeTruthy();
  expect(screen.getByText('In progress')).toBeTruthy();
  expect(screen.getByText('Completed')).toBeTruthy();
  expect(screen.getByText('Cancelled')).toBeTruthy();
  expect(screen.getByText('Expired')).toBeTruthy();
});

it('Needs you lists only open jobs that have pending proposals', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');
  fireEvent.press(await screen.findByRole('button', { name: 'Needs you, 1' }));
  expect(screen.getByText('Cleaning: Window cleaning')).toBeTruthy();
  expect(screen.queryByText('Handyman: Fix cabinet door')).toBeNull();
  expect(screen.queryByText('Plumbing: Fix toilet')).toBeNull();
});

it('Waiting lists open jobs without proposals, and Booked lists confirmed and in-progress jobs', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');
  await screen.findByRole('button', { name: 'Needs you, 1' });
  fireEvent.press(screen.getByRole('button', { name: 'Waiting, 1' }));
  expect(screen.getByText('Handyman: Fix cabinet door')).toBeTruthy();
  expect(screen.queryByText('Cleaning: Window cleaning')).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: 'Booked, 2' }));
  expect(screen.getByText('Plumbing: Fix toilet')).toBeTruthy();
  expect(screen.getByText('Painting: Living room')).toBeTruthy();
  expect(screen.queryByText('Handyman: Fix cabinet door')).toBeNull();
});

it('Done and Closed show one newest-first list without date headings', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');
  fireEvent.press(screen.getByRole('button', { name: 'Done, 1' }));
  expect(screen.getByText('Plumbing: Leaking faucet')).toBeTruthy();
  expect(screen.queryByText('Earlier')).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: 'Closed, 2' }));
  expect(screen.getByText('Electrical: Outlet check')).toBeTruthy();
  expect(screen.getByText('Deep clean: Kitchen')).toBeTruthy();
  expect(screen.queryByText('Plumbing: Leaking faucet')).toBeNull();
});

it('an empty filter says what would show up there', async () => {
  (api.myJobs as jest.Mock).mockResolvedValueOnce([
    makeJob({ id: 'open', title: 'Open one', status: 'open' }),
  ]);
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Open one');

  fireEvent.press(screen.getByRole('button', { name: 'Done, 0' }));

  expect(screen.getByText('No completed jobs')).toBeTruthy();
  expect(within(screen.getByTestId('empty-card')).getByText('No completed jobs')).toBeTruthy();
  expect(screen.queryByText('Open one')).toBeNull();
});

it('a new account is invited to post a job, which opens Create Job', async () => {
  (api.myJobs as jest.Mock).mockResolvedValueOnce([]);
  const navigate = jest.fn();
  render(<MyJobs onNavigate={navigate} />);

  await screen.findByText('No jobs yet');
  expect(within(screen.getByTestId('empty-card')).getByText('No jobs yet')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Post a job' }));

  expect(navigate).toHaveBeenCalledWith('Create Job');
});

it('renders the list before proposal counts arrive', async () => {
  (api.jobApplications as jest.Mock).mockReturnValue(new Promise(() => {}));
  render(<MyJobs onNavigate={jest.fn()} />);

  await screen.findByText('Cleaning: Window cleaning');
  expect(screen.getAllByText('Open · waiting for offers')).toHaveLength(2);
  expect(screen.getByLabelText('Needs you')).toBeTruthy();
});

it('Needs you and Waiting show no number until the proposal counts arrive, then their real counts', async () => {
  const answers: Array<() => void> = [];
  (api.jobApplications as jest.Mock).mockImplementation(
    (id: string) => new Promise((resolve) => {
      answers.push(() => resolve(proposalsByJob[id] ?? []));
    }),
  );
  render(<MyJobs onNavigate={jest.fn()} />);

  await screen.findByText('Cleaning: Window cleaning');
  await waitFor(() => expect(api.jobApplications).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Needs you')).toBeTruthy();
  expect(screen.getByLabelText('Waiting')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'All, 7' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Booked, 2' })).toBeTruthy();

  await act(async () => {
    answers.forEach((answer) => answer());
  });

  expect(await screen.findByRole('button', { name: 'Needs you, 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Waiting, 1' })).toBeTruthy();
});

it('a failed proposal lookup leaves that job under Waiting', async () => {
  (api.jobApplications as jest.Mock).mockRejectedValue(new Error('offline'));
  render(<MyJobs onNavigate={jest.fn()} />);

  await screen.findByText('Cleaning: Window cleaning');
  expect(await screen.findByRole('button', { name: 'Waiting, 2' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Needs you, 0' })).toBeTruthy();
});

it('tapping a job opens its detail, and New opens Create Job', async () => {
  const navigate = jest.fn();
  render(<MyJobs onNavigate={navigate} />);

  fireEvent.press(await screen.findByText('Plumbing: Fix toilet'));
  expect(navigate).toHaveBeenCalledWith('Job Detail', 'booked');

  fireEvent.press(screen.getByText('New'));
  expect(navigate).toHaveBeenCalledWith('Create Job');
});

it('pull-to-refresh reloads the jobs', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');

  const refreshControl = screen.getByTestId('my-jobs-list').props.refreshControl;
  expect(refreshControl).toBeTruthy();
  await act(async () => {
    refreshControl.props.onRefresh();
  });

  await waitFor(() => expect(api.myJobs).toHaveBeenCalledTimes(2));
});

it('keeps the selected filter and restores scroll after opening a job and returning', async () => {
  const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
  const navigate = jest.fn();
  const view = render(<MyJobs onNavigate={navigate} />);
  await screen.findByText('Plumbing: Fix toilet');
  fireEvent.press(await screen.findByRole('button', { name: 'Booked, 2' }));
  await screen.findByText('Painting: Living room');
  fireEvent.scroll(screen.getByTestId('my-jobs-list'), {
    nativeEvent: { contentOffset: { y: 400 } },
  });
  fireEvent.press(screen.getByText('Painting: Living room'));
  expect(navigate).toHaveBeenCalledWith('Job Detail', 'working');
  view.unmount();

  render(<MyJobs onNavigate={navigate} />);
  await screen.findByText('Painting: Living room');
  expect(screen.queryByText('Cleaning: Window cleaning')).toBeNull();
  fireEvent(screen.getByTestId('my-jobs-list'), 'contentSizeChange', 300, 2000);
  expect(scrollTo).toHaveBeenCalledWith({ y: 400, animated: false });
});

it('shows loading and errors, and retries', async () => {
  (api.myJobs as jest.Mock).mockRejectedValueOnce(new Error('Unable to load jobs'));
  render(<MyJobs onNavigate={jest.fn()} />);
  expect(screen.getByLabelText('Loading content')).toBeTruthy();

  await screen.findByText('Unable to load jobs');
  fireEvent.press(screen.getByText('Try again'));

  await screen.findByText('Cleaning: Window cleaning');
  expect(screen.queryByText('Unable to load jobs')).toBeNull();
});

it('renders the headerRight switch in the title row and forwards its presses', async () => {
  const onChange = jest.fn();
  render(
    <MyJobs
      onNavigate={jest.fn()}
      headerRight={
        <ViewSwitch
          options={[{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }] as const}
          value="list"
          onChange={onChange}
        />
      }
    />,
  );
  await screen.findByText('Cleaning: Window cleaning');
  expect(screen.getByText('My Jobs')).toBeTruthy();
  expect(screen.getByText('New')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));
  expect(onChange).toHaveBeenCalledWith('calendar');
});

it('every control has an accessible name: the filters, the title row switch and the job rows', async () => {
  render(<MyJobs onNavigate={jest.fn()} />);
  await screen.findByText('Cleaning: Window cleaning');

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});
