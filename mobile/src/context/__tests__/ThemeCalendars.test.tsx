import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme, darkPalette } from '../ThemeContext';
import HOCalendarScreen from '../../../app/(homeowner)/screens/HOCalendarScreen';
import SPCalendarScreen from '../../../app/(provider)/screens/SPCalendarScreen';
jest.mock('../AuthContext', () => ({useAuth: () => ({profile: null})}));
jest.mock('../../lib/api', () => ({api: {myJobs: jest.fn().mockResolvedValue([]), bookings: jest.fn().mockResolvedValue([])}}));
jest.mock('react-native-calendars', () => ({Calendar: ({theme, current, onMonthChange}: any) => {
  // The installed calendar caches styleConstructor(theme) in a ref. A palette
  // change must remount it, while the parent retains the month being viewed.
  const React = jest.requireActual('react');
  const {Text} = jest.requireActual('react-native');
  const frozenTheme = React.useRef(theme).current;
  return <Text testID="calendar" style={{backgroundColor: frozenTheme.calendarBackground}}
    onPress={() => onMonthChange({year: 2030, month: 12, dateString: '2030-12-01'})}>{current}</Text>;
}}));
function Switch() {
  const {dark, setDark} = useTheme();
  return <TouchableOpacity onPress={() => setDark(!dark)}><Text>Switch theme</Text></TouchableOpacity>;
}
beforeEach(async () => {await AsyncStorage.clear();});
it.each([HOCalendarScreen, SPCalendarScreen])('repaints the calendar and preserves its visible month when switching theme', async Calendar => {
  render(<ThemeProvider><Switch /><Calendar onNavigate={jest.fn()} /></ThemeProvider>);
  await screen.findByTestId('calendar');
  fireEvent.press(screen.getByTestId('calendar'));
  await waitFor(() => expect(screen.getByTestId('calendar').props.children).toBe('2030-12-01'));
  fireEvent.press(screen.getByText('Switch theme'));
  expect(screen.getByTestId('calendar').props.children).toBe('2030-12-01');
  expect(StyleSheet.flatten(screen.getByTestId('calendar').props.style).backgroundColor).toBe(darkPalette.V6Colors.surface);
});
