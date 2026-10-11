import { findUnnamedControls } from '../../../../src/testing/a11yAudit';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import SPCalendarScreen from '../SPCalendarScreen';
import { api, type Booking } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';
import { dayHeading, monthTitle, shiftMonth } from '../../../../src/lib/jobCalendar';
import { dateKey } from '../../../../src/lib/localDate';
import { lightPalette } from '../../../../src/constants/palettes';

jest.mock('../../../../src/lib/api', () => ({
  api: { bookings: jest.fn() },
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

function makeBooking(
  fields: Pick<Booking, 'id' | 'job_id' | 'scheduled_at' | 'status'> & Partial<Booking>,
): Booking {
  return {
    provider_id: 'me',
    client_id: 'client',
    duration_minutes: 60,
    notes: null,
    jobs: { title: 'Plumbing: Check water heater', category_id: 1 },
    client: { full_name: 'Maria Santos' },
    ...fields,
  };
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

const bookings = [
  makeBooking({
    id: 'booked',
    job_id: 'job-booked',
    scheduled_at: laterDay.toISOString(),
    status: 'scheduled',
  }),
  makeBooking({
    id: 'later',
    job_id: 'job-later',
    scheduled_at: dayAt(30, 15).toISOString(),
    status: 'scheduled',
    jobs: { title: 'Painting: Living room', category_id: 1 },
    client: { full_name: 'Juan dela Cruz' },
  }),
  makeBooking({
    id: 'cancelled',
    job_id: 'job-cancelled',
    scheduled_at: dayAt(-2).toISOString(),
    status: 'cancelled',
    jobs: { title: 'Electrical: Outlet check', category_id: 1 },
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  mockCalendar.renderDays = false;
  (api.bookings as jest.Mock).mockResolvedValue([]);
});

it('titles itself Calendar when no title is passed', async () => {
  render(<SPCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText('Nothing scheduled')).toBeTruthy();
  expect(within(screen.getByTestId('empty-card')).getByText('Nothing scheduled')).toBeTruthy();
  expect(screen.getByText('Calendar')).toBeTruthy();
});

it('shows the title and headerRight passed by My Work, and keeps them up while loading', () => {
  (api.bookings as jest.Mock).mockReturnValue(new Promise(() => {}));
  render(
    <SPCalendarScreen
      onNavigate={jest.fn()}
      title="My Work"
      headerRight={<Text>List or Calendar</Text>}
    />,
  );

  expect(screen.getByText('My Work')).toBeTruthy();
  expect(screen.getByText('List or Calendar')).toBeTruthy();
});

it('selects today, with its heading and job count', async () => {
  render(<SPCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText(dayHeading(todayKey))).toBeTruthy();
  expect(screen.getByText('0 jobs')).toBeTruthy();
});

it('lists the bookings of the picked day as job rows, which open the job', async () => {
  (api.bookings as jest.Mock).mockResolvedValue(bookings);
  const navigate = jest.fn();
  render(<SPCalendarScreen onNavigate={navigate} />);
  await screen.findByText(dayHeading(todayKey));

  pickDay(laterDay);

  expect(screen.getByText(dayHeading(laterKey))).toBeTruthy();
  expect(screen.getByText('2 jobs')).toBeTruthy();
  expect(screen.getByText('Booked · Maria Santos')).toBeTruthy();
  fireEvent.press(screen.getByText('Plumbing: Check water heater'));
  expect(navigate).toHaveBeenCalledWith('Job Detail', 'job-booked');
});

it('a cancelled booking still shows on its day, with its status', async () => {
  (api.bookings as jest.Mock).mockResolvedValue(bookings);
  render(<SPCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  pickDay(dayAt(-2));

  expect(screen.getByText('Electrical: Outlet check')).toBeTruthy();
  expect(screen.getByText('Cancelled · Maria Santos')).toBeTruthy();
});

it('marks the days with bookings, the picked day and today', async () => {
  (api.bookings as jest.Mock).mockResolvedValue(bookings);
  render(<SPCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  expect(mockCalendar.props?.markedDates[laterKey]).toEqual({ marked: true });
  expect(mockCalendar.props?.markedDates[todayKey]).toEqual({ selected: true, today: true });

  pickDay(laterDay);

  expect(mockCalendar.props?.markedDates[laterKey]).toEqual({ marked: true, selected: true });
  expect(mockCalendar.props?.markedDates[todayKey]).toEqual({ today: true });
});

it('an empty day says nothing is scheduled', async () => {
  (api.bookings as jest.Mock).mockResolvedValue(bookings);
  render(<SPCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  pickDay(dayAt(45));

  expect(screen.getByText('Nothing scheduled')).toBeTruthy();
  expect(screen.getByText('Jobs appear here after a client hires you.')).toBeTruthy();
});

it('Go to today returns to today and its month', async () => {
  render(<SPCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  pickDay(laterDay);
  fireEvent.press(screen.getByRole('button', { name: 'Go to today' }));

  expect(screen.getByText(dayHeading(todayKey))).toBeTruthy();
  expect(mockCalendar.props?.current).toBe(todayKey);
});

it('the chevrons move the month that is shown, and fetch its bookings', async () => {
  render(<SPCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByText(monthTitle(shiftMonth(todayKey, 1)))).toBeTruthy();
  expect(mockCalendar.props?.current).toBe(shiftMonth(todayKey, 1));
  await waitFor(() => expect(api.bookings).toHaveBeenLastCalledWith(
    expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
  ));

  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText(monthTitle(shiftMonth(todayKey, -1)))).toBeTruthy();
  expect(mockCalendar.props?.current).toBe(shiftMonth(todayKey, -1));
  // Let the last month's fetch settle inside act, so no update lands after the test.
  await act(async () => {});
});

it('a failed load shows the error, and Retry loads again', async () => {
  (api.bookings as jest.Mock).mockRejectedValueOnce(new Error('Unable to load bookings'));
  render(<SPCalendarScreen onNavigate={jest.fn()} />);

  expect(await screen.findByText("Couldn't load your schedule")).toBeTruthy();
  expect(screen.getByText('Unable to load bookings')).toBeTruthy();
  fireEvent.press(screen.getByText('Retry'));

  await waitFor(() => expect(api.bookings).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText("Couldn't load your schedule")).toBeNull());
});

it('draws the seven weekday names above the grid, Sunday first', async () => {
  render(<SPCalendarScreen onNavigate={jest.fn()} />);

  const row = await screen.findByTestId('calendar-weekdays');
  const letters = within(row).getAllByText(/^[A-Z]$/).map((node) => node.props.children);
  expect(letters).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  expect(within(row).getByLabelText('Sunday')).toBeTruthy();
  expect(within(row).getByLabelText('Saturday')).toBeTruthy();
});

it('today keeps its ring when another day is picked, and the picked day is filled', async () => {
  mockCalendar.renderDays = true;
  (api.bookings as jest.Mock).mockResolvedValue(bookings);
  render(<SPCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  pickDay(laterDay);

  const todayCircle = StyleSheet.flatten(screen.getByTestId(`calendar-day-circle-${todayKey}`).props.style);
  expect(todayCircle.borderColor).toBe(lightPalette.Colors.link);
  expect(todayCircle.backgroundColor).toBeUndefined();
  const pickedCircle = StyleSheet.flatten(screen.getByTestId(`calendar-day-circle-${laterKey}`).props.style);
  expect(pickedCircle.backgroundColor).toBe(lightPalette.Colors.primary);
});

it('every control has an accessible name: the month chevrons, the day cells and the List/Calendar switch', async () => {
  render(<SPCalendarScreen onNavigate={jest.fn()} />);
  await screen.findByText(dayHeading(todayKey));

  expect(findUnnamedControls(screen.UNSAFE_root)).toEqual([]);
});
