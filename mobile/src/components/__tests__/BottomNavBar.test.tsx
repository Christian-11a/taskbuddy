import React from 'react';
import { ClipboardList, Home, User, Wallet } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BottomNavBar, { BottomNavItem } from '../BottomNavBar';

type Key = 'Home' | 'My Jobs' | 'Wallet' | 'Profile';

const TABS: readonly BottomNavItem<Key>[] = [
  { key: 'Home', label: 'Home', icon: Home },
  { key: 'My Jobs', label: 'My Jobs', icon: ClipboardList },
  { key: 'Wallet', label: 'Wallet', icon: Wallet },
  { key: 'Profile', label: 'Profile', icon: User },
];

it('renders one tab per item, in order, and marks only the active one selected', () => {
  render(<BottomNavBar activeTab="My Jobs" tabs={TABS} onTabPress={jest.fn()} />);

  expect(screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel)).toEqual([
    'Home',
    'My Jobs',
    'Wallet',
    'Profile',
  ]);
  expect(screen.getByRole('tab', { name: 'My Jobs' }).props.accessibilityState)
    .toEqual(expect.objectContaining({ selected: true }));
  expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState)
    .toEqual(expect.objectContaining({ selected: false }));
});

it('reports the key of the tab that was pressed', () => {
  const onTabPress = jest.fn();
  render(<BottomNavBar activeTab="Home" tabs={TABS} onTabPress={onTabPress} />);

  fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));

  expect(onTabPress).toHaveBeenCalledTimes(1);
  expect(onTabPress).toHaveBeenCalledWith('Profile');
});

it('has no floating action: only the tabs render, and no extra button sits above the bar', () => {
  render(<BottomNavBar activeTab="Home" tabs={TABS} onTabPress={jest.fn()} />);

  expect(screen.getAllByTestId(/^nav-tab-/)).toHaveLength(TABS.length);
  expect(screen.queryByRole('button')).toBeNull();
});
