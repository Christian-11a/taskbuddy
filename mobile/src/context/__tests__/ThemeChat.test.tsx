import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme, lightPalette, darkPalette } from '../ThemeContext';
import HOChatScreen from '../../../app/(homeowner)/screens/HOChatScreen';
import SPChatScreen from '../../../app/(provider)/screens/SPChatScreen';
import { api } from '../../lib/api';
jest.mock('../AuthContext', () => ({useAuth: () => ({profile: {id: 'self'}})}));
jest.mock('../../lib/api', () => ({api: {
  settings: jest.fn().mockResolvedValue({dark_mode: false}),
  openConversation: jest.fn().mockResolvedValue({id: 'conversation', counterpart_name: 'Other User'}),
  messages: jest.fn().mockResolvedValue([
    {id: 'received', sender_id: 'other', body: 'Incoming message', created_at: '2026-10-04T10:00:00Z'},
    {id: 'sent', sender_id: 'self', body: 'Outgoing message', created_at: '2026-10-04T10:01:00Z'},
  ]),
  streamMessages: jest.fn(() => jest.fn()), markConversationRead: jest.fn().mockResolvedValue({}),
}}));
function Switch() {
  const {dark, setDark} = useTheme();
  return <TouchableOpacity onPress={() => setDark(!dark)}><Text>Switch theme</Text></TouchableOpacity>;
}
beforeEach(async () => {jest.useFakeTimers(); jest.clearAllMocks(); await AsyncStorage.clear();});
afterEach(async () => {
  await act(async () => {jest.runOnlyPendingTimers();});
  jest.useRealTimers();
});
it.each([HOChatScreen, SPChatScreen])('repaints received/sent messages and keyboard while preserving the draft and stream', async Chat => {
  render(<ThemeProvider><Switch /><Chat jobId="job" onBack={jest.fn()} onViewJob={jest.fn()} /></ThemeProvider>);
  await screen.findByText('Incoming message');
  const receivedColor = () => StyleSheet.flatten(screen.getByText('Incoming message').props.style).color;
  expect(receivedColor()).toBe(lightPalette.V6Colors.ink900);
  fireEvent.changeText(screen.getByPlaceholderText('Message…'), 'Unsent draft');
  fireEvent.press(screen.getByText('Switch theme'));
  expect(receivedColor()).toBe(darkPalette.V6Colors.ink900);
  expect(StyleSheet.flatten(screen.getByText('Outgoing message').props.style).color).toBe(darkPalette.V6Colors.onPrimary);
  expect(screen.getByPlaceholderText('Message…').props.keyboardAppearance).toBe('dark');
  expect(screen.getByPlaceholderText('Message…').props.value).toBe('Unsent draft');
  expect(api.streamMessages).toHaveBeenCalledTimes(1);
});


it.each([HOChatScreen, SPChatScreen])('scrolls after asynchronous message layout without resetting later reading position', async Chat => {
  const scroll = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {});
  const view = render(<ThemeProvider><Chat jobId="job" onBack={jest.fn()} onViewJob={jest.fn()} /></ThemeProvider>);
  const list = () => view.UNSAFE_getByType(FlatList);
  fireEvent(list(), 'contentSizeChange', 375, 0);
  expect(scroll).not.toHaveBeenCalled();
  await screen.findByText('Incoming message');
  fireEvent(list(), 'contentSizeChange', 375, 1800);
  expect(scroll).toHaveBeenCalledWith({ animated: false });
  scroll.mockClear();
  fireEvent(list(), 'contentSizeChange', 375, 2100);
  expect(scroll).not.toHaveBeenCalled();
  scroll.mockRestore();
});
