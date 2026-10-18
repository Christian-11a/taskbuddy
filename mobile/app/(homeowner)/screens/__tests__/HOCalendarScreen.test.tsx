import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import HOCalendarScreen from '../HOCalendarScreen';
import { api, type Job } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { expectSavedCopyIgnored } from '../../../../src/testing/savedCopy';
import { dayHeading, monthTitle, shiftMonth } from '../../../../src/lib/jobCalendar';
import { dateKey } from '../../../../src/lib/localDate';
import { lightPalette } from '../../../../src/constants/palettes';

jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn(), jobApplications: jest.fn() },
}));

// The library draws the month grid natively. The mock keeps the props it is
// given, so a test can pick a day or read the marks the way a tap on the grid
// would. With renderDays on, it also draws a cell for each marked day through
// the screen's own dayComponent, so those cells can be checked.
const mockCalendar: { props: Record<string, any> | null; renderDays: boolean } = {
  props: null,
  renderDays: false,
};
jest.mock('react-native-calendars', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Calendar: (props: Record<string, any>) => {
      mockCalendar.props = props;
      if (!mockCalendar.renderDays) return null;
      return React.createElement(
        View,
        null,
        Object.keys(props.markedDates ?? {}).map((dateString) => {
          const [year, month, day] = dateString.split('-').map(Number);
          return React.createElement(props.dayComponent, {
            key: dateString,
            date: { dateString, day, month, year, timestamp: new Date(year, month - 1, day).getTime() },
            marking: props.markedDates[dateString],
            onPress: props.onDayPress,
            state: '',
          });
        }),
      );
    },
  };
});

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
  mockCalendar.renderDays = false;
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
  expect(screen.getByText('Open · waiting for proposals')).toBeTruthy();
  expect(screen.getByText('Handyman: Fix cabinet door')).toBeTruthy();
  expect(screen.queryByText('Plumbing: Leaking faucet')).toBeNull();
});

it('an empty day says so', async () => {
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText('Not scheduled yet');

  pickDay(dayAt(45));

  expect(screen.getByText('No jobs on this day')).toBeTruthy();
  expect(within(screen.getByTestId('empty-card')).getByText('No jobs on this day')).toBeTruthy();
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

it('a failed load shows the error in a card, and Try again loads again', async () => {
  (api.myJobs as jest.Mock).mockRejectedValueOnce(new Error('Unable to load jobs'));
  render(<HOCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText('Unable to load jobs')).toBeTruthy();
  expect(within(screen.getByTestId('error-card')).getByText("Couldn't load your schedule")).toBeTruthy();
  fireEvent.press(screen.getByText('Try again'));

  await waitFor(() => expect(api.myJobs).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Unable to load jobs')).toBeNull());
});

it('draws the seven weekday names above the grid, Sunday first', async () => {
  render(<HOCalendarScreen onNavigate={jest.fn()} />);

  const row = await screen.findByTestId('calendar-weekdays');
  const letters = within(row).getAllByText(/^[A-Z]$/).map((node) => node.props.children);
  expect(letters).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  expect(within(row).getByLabelText('Sunday')).toBeTruthy();
  expect(within(row).getByLabelText('Saturday')).toBeTruthy();
});

it('today keeps its ring when another day is picked, and the picked day is filled', async () => {
  mockCalendar.renderDays = true;
  (api.myJobs as jest.Mock).mockResolvedValue(jobs);
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText('Not scheduled yet');

  pickDay(laterDay);

  const todayCircle = StyleSheet.flatten(screen.getByTestId(`calendar-day-circle-${todayKey}`).props.style);
  expect(todayCircle.borderColor).toBe(lightPalette.Colors.link);
  expect(todayCircle.backgroundColor).toBeUndefined();
  const pickedCircle = StyleSheet.flatten(screen.getByTestId(`calendar-day-circle-${laterKey}`).props.style);
  expect(pickedCircle.backgroundColor).toBe(lightPalette.Colors.primary);
});

it('every control has an accessible name: the month chevrons, the day cells and the List/Calendar switch', async () => {
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});

it('a saved job list of the wrong shape is ignored, and the screen loads as it does with nothing saved', async () => {
  (api.myJobs as jest.Mock).mockReturnValue(new Promise(() => {}));

  await expectSavedCopyIgnored('ho-jobs', {}, () => render(<HOCalendarScreen onNavigate={jest.fn()} />));
});

it('pulling the schedule down reloads it', async () => {
  render(<HOCalendarScreen onNavigate={jest.fn()} />);
  await waitFor(() => expect(api.myJobs as jest.Mock).toHaveBeenCalledTimes(1));
  await screen.findByTestId('calendar-scroll');

  act(() => {
    screen.getByTestId('calendar-scroll').props.refreshControl.props.onRefresh();
  });

  await waitFor(() => expect(api.myJobs as jest.Mock).toHaveBeenCalledTimes(2));
});
