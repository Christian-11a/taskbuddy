import React from 'react';
import { render, screen } from '@testing-library/react-native';
import BottomNavBar from '../src/components/BottomNavBar';
import { HOMEOWNER_TABS, PROVIDER_TABS } from '../App';

// App.tsx starts the splash screen when it is imported. The tests only read the
// tab configuration, so the splash calls are stubbed out.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

it('gives the homeowner four tabs, with Profile last', () => {
  expect(HOMEOWNER_TABS.map((tab) => tab.key)).toEqual(['Home', 'My Jobs', 'Wallet', 'Profile']);
});

it('gives the provider four tabs, with Profile last', () => {
  expect(PROVIDER_TABS.map((tab) => tab.label)).toEqual(['Feed', 'My Work', 'Wallet', 'Profile']);
});

it('renders the homeowner bar as four tabs with no floating action', () => {
  render(<BottomNavBar activeTab="Home" tabs={HOMEOWNER_TABS} onTabPress={jest.fn()} />);

  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.queryByText('Post a job')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('renders the provider bar as four tabs with no floating action', () => {
  render(<BottomNavBar activeTab="Dashboard" tabs={PROVIDER_TABS} onTabPress={jest.fn()} />);

  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.queryByRole('button')).toBeNull();
});

// The welcome tour points at these tabs as tab.jobs (client) and tab.work (provider); the rest use their key.
it('names the Jobs tab and the My Work tab for the welcome tour', () => {
  expect(HOMEOWNER_TABS.find((tab) => tab.key === 'My Jobs')?.tourId).toBe('jobs');
  expect(PROVIDER_TABS.find((tab) => tab.key === 'My Jobs')?.tourId).toBe('work');
});
