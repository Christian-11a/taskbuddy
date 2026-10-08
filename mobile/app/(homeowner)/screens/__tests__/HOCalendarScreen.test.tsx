import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOCalendarScreen from '../HOCalendarScreen';
import { api, type Job } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { dayHeading, monthTitle, shiftMonth } from '../../../../src/lib/jobCalendar';
import { dateKey } from '../../../../src/lib/localDate';

jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn(), jobApplications: jest.fn() },
}));

// The library draws the month grid natively. The mock keeps the props it is
// given, so a test can pick a day or read the marks the way a tap on the grid would.
const mockCalendar: { props: Record<string, any> | null } = { props: null };
jest.mock('react-native-calendars', () => ({
  Calendar: (props: Record<string, any>) => {
    mockCalendar.props = props;
    return null;
  },
}));

/** A local time `days` from today. */
function dayAt(days: number, hour = 9): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

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
    posted_at: dayAt(-3).toISOString(),
    assigned_provider_id: null,
    assigned_at: null,
    completed_at: null,
    budget: 500,
    scheduled_at: null,
    photo_urls: [],
    created_at: dayAt(-3).toISOString(),
    ...fields,
  } as Job;
}

/** Picks a day the way a tap on the month grid does. */
function pickDay(date: Date) {
  act(() => {
    mockCalendar.props?.onDayPress({
      dateString: dateKey(date),
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      timestamp: date.getTime(),
    });
  });
}

const todayKey = dateKey(new Date());
const laterDay = dayAt(30);
const laterKey = dateKey(laterDay);

const jobs = [
  makeJob({
    id: 'booked',
    title: 'Plumbing: Check water heater',
    status: 'confirmed',
    scheduled_at: laterDay.toISOString(),
  }),
  makeJob({ id: 'open', title: 'Cleaning: Window cleaning', status: 'open' }),
  makeJob({ id: 'working', title: 'Handyman: Fix cabinet door', status: 'in_progress' }),
  makeJob({ id: 'finished', title: 'Plumbing: Leaking faucet', status: 'completed' }),
];

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (api.myJobs as jest.Mock).mockResolvedValue([]);
  (api.jobApplications as jest.Mock).mockResolvedValue([]);
});

it('titles itself Calendar when no title is passed', async () => {
  render(<HOCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText('No jobs on this day')).toBeTruthy();
  expect(screen.getByText('Calendar')).toBeTruthy();
});

it('shows the title and headerRight passed by My Jobs once the jobs have loaded', async () => {
  render(
    <HOCalendarScreen
      onNavigate={jest.fn()}
      title="My Jobs"
      headerRight={<Text>List or Calendar</Text>}
    />,
  );

  expect(await screen.findByText('No jobs on this day')).toBeTruthy();
  expect(screen.getByText('My Jobs')).toBeTruthy();
  expect(screen.getByText('List or Calendar')).toBeTruthy();
});

it('keeps the title row and headerRight up while the jobs are still loading', () => {
  (api.myJobs as jest.Mock).mockReturnValue(new Promise(() => {}));
  render(
    <HOCalendarScreen
      onNavigate={jest.fn()}
      title="My Jobs"
      headerRight={<Text>List or Calendar</Text>}
    />,
  );

  expect(screen.getByLabelText('Loading content')).toBeTruthy();
  expect(screen.getByText('My Jobs')).toBeTruthy();
  expect(screen.getByText('List or Calendar')).toBeTruthy();
});

it('selects today, with its heading and job count', async () => {
  render(<HOCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText(dayHeading(todayKey))).toBeTruthy();
  expect(screen.getByText('0 jobs')).toBeTruthy();
});

it('lists the jobs of the day that is picked, as job rows', async () => {
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  const navigate = jest.fn();
  render(<HOCalendarScreen onNavigate={navigate} />);
  await screen.findByText('Not scheduled yet');

  pickDay(laterDay);

  expect(screen.getByText(dayHeading(laterKey))).toBeTruthy();
  expect(screen.getByText('1 job')).toBeTruthy();
  fireEvent.press(screen.getByText('Plumbing: Check water heater'));
  expect(navigate).toHaveBeenCalledWith('Job Detail', 'booked');
});

it('marks the days with jobs, the picked day and today', async () => {
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText('Not scheduled yet');

  expect(mockCalendar.props?.markedDates[laterKey]).toEqual({ marked: true });
  expect(mockCalendar.props?.markedDates[todayKey]).toEqual({ selected: true, today: true });

  pickDay(laterDay);

  expect(mockCalendar.props?.markedDates[laterKey]).toEqual({ marked: true, selected: true });
  expect(mockCalendar.props?.markedDates[todayKey]).toEqual({ today: true });
});

it('shows the jobs not scheduled yet with a count, and leaves out finished ones', async () => {
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  render(<HOCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText('Not scheduled yet')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('Cleaning: Window cleaning')).toBeTruthy();
  expect(screen.getByText('Open · waiting for offers')).toBeTruthy();
  expect(screen.getByText('Handyman: Fix cabinet door')).toBeTruthy();
  expect(screen.queryByText('Plumbing: Leaking faucet')).toBeNull();
});

it('an empty day says so', async () => {
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText('Not scheduled yet');

  pickDay(dayAt(45));

  expect(screen.getByText('No jobs on this day')).toBeTruthy();
});

it('Go to today returns to today and its month', async () => {
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  pickDay(laterDay);
  fireEvent.press(screen.getByRole('button', { name: 'Go to today' }));

  expect(screen.getByText(dayHeading(todayKey))).toBeTruthy();
  expect(mockCalendar.props?.current).toBe(todayKey);
});

it('the chevrons move the month that is shown', async () => {
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByText(monthTitle(shiftMonth(todayKey, 1)))).toBeTruthy();
  expect(mockCalendar.props?.current).toBe(shiftMonth(todayKey, 1));

  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText(monthTitle(shiftMonth(todayKey, -1)))).toBeTruthy();
  expect(mockCalendar.props?.current).toBe(shiftMonth(todayKey, -1));
});

it('a failed load shows the error, and Retry loads again', async () => {
  (api.myJobs as jest.Mock).mockRejectedValueOnce(new Error('Unable to load jobs'));
  render(<HOCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText('Unable to load jobs')).toBeTruthy();
  fireEvent.press(screen.getByText('Retry'));

  await waitFor(() => expect(api.myJobs).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Unable to load jobs')).toBeNull());
});
