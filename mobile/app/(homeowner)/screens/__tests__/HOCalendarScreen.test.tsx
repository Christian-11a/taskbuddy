import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import HOCalendarScreen from '../HOCalendarScreen';
import { api } from '../../../../src/lib/api';
import { clearAsyncDataCache } from '../../../../src/hooks/useAsyncData';

jest.mock('../../../../src/lib/api', () => ({
  api: { myJobs: jest.fn() },
}));

jest.mock('react-native-calendars', () => ({
  Calendar: () => null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  clearAsyncDataCache();
  (api.myJobs as jest.Mock).mockResolvedValue([]);
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
