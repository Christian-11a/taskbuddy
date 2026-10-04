import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import HOCreateJobScreen from '../HOCreateJobScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/lib/api', () => ({ api: {
  categories: jest.fn(), createJob: jest.fn(), uploadImage: jest.fn(), staticMapSource: jest.fn(() => ({ uri: 'https://example.test/map.png' })),
} }));
jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => ({ profile: {
  address: 'Quezon City', latitude: 14.6, longitude: 121,
} }) }));
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('react-native-calendars', () => ({ Calendar: ({ onDayPress }: any) => {
  const { Text } = jest.requireActual('react-native');
  return <Text onPress={() => onDayPress({ dateString: '2030-12-10' })}>Choose test date</Text>;
} }));
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: ({onChange}: any) => {
  const { Text } = jest.requireActual('react-native');
  return <Text onPress={() => onChange({type: 'set'}, new Date('2030-12-10T09:00:00'))}>Choose test time</Text>;
} }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

it('keeps the urgency step visible and reports missing required fields when Next is pressed', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Fix leaking faucet');
  fireEvent.press(screen.getByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Select a date');
  fireEvent.press(screen.getByText('Next'));
  await waitFor(() => expect(screen.getAllByText('Please select a preferred date.').length).toBeGreaterThan(0));
  expect(screen.getByText('Please set a budget for this job.')).toBeTruthy();
  expect(screen.queryByTestId('create-job-review')).toBeNull();
});

it('posts from review without another terms acceptance and retains form state after photo preview', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  (api.createJob as jest.Mock).mockResolvedValue({ id: 'new-job' });
  (api.uploadImage as jest.Mock).mockResolvedValue('client/photo.jpg');
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({canceled: false, assets: [{uri: 'file:///portrait'}, {uri: 'file:///landscape'}]});
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  await act(async () => fireEvent.press(screen.getByText('Add photos')));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Select a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Select a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByLabelText('Open selected photo 2'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe('file:///landscape');
  fireEvent.press(screen.getByLabelText('Close photo'));
  expect(screen.getByTestId('create-job-review')).toBeTruthy();
  expect(screen.queryByText(/I agree to the/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Post Job')));
  expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({budget: 1500, tasks: ['Fix leaking faucet']}));
  expect(await screen.findByText('Post Another Job')).toBeTruthy();
});
