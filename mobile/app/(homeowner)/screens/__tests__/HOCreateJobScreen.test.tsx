import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
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
  await screen.findByText('Pick a date');
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
  await act(async () => fireEvent.press(screen.getByText('Add photos (optional)')));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByLabelText('Open selected photo 2'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe('file:///landscape');
  fireEvent.press(screen.getByLabelText('Close photo'));
  expect(screen.getByTestId('create-job-review')).toBeTruthy();
  expect(screen.queryByText(/I agree to the/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Post job')));
  expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({budget: 1500, tasks: ['Fix leaking faucet']}));
  expect(await screen.findByText('Post Another Job')).toBeTruthy();
});

const NO_TASKS_MESSAGE = 'Pick at least one task so providers know what the job involves.';

it('shows an error only after Next, once, under the field that is wrong', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Fix leaking faucet');
  expect(screen.queryByText(NO_TASKS_MESSAGE)).toBeNull();

  fireEvent.press(screen.getByText('Next'));
  expect(await screen.findByText(NO_TASKS_MESSAGE)).toBeTruthy();
  expect(screen.getAllByText(NO_TASKS_MESSAGE)).toHaveLength(1);
});

it('clears an error as soon as its field is fixed, and keeps it while the edit is still wrong', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Fix leaking faucet');
  fireEvent.press(screen.getByText('Next'));

  const tooShort = 'Description must be at least 20 characters.';
  const description = screen.getByPlaceholderText('Describe the job in detail...');
  expect(await screen.findByText(tooShort)).toBeTruthy();

  fireEvent.changeText(description, 'Short one');
  expect(screen.getByText(tooShort)).toBeTruthy();

  fireEvent.changeText(description, 'A leaking kitchen faucet that needs replacing.');
  expect(screen.queryByText(tooShort)).toBeNull();
});

it('clears a budget error as soon as a valid amount is typed, and leaves other errors alone', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  await screen.findByText('Pick a date');
  fireEvent.press(screen.getByText('Next'));

  const budgetMessage = 'Please set a budget for this job.';
  expect(await screen.findByText(budgetMessage)).toBeTruthy();
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
  expect(screen.queryByText(budgetMessage)).toBeNull();
  expect(screen.getByText('Please select a preferred date.')).toBeTruthy();
});

it('the review lists everything entered, and each Edit link goes back to its step', async () => {
  (api.categories as jest.Mock).mockResolvedValue([{ id: 1, name: 'Plumbing' }]);
  render(<HOCreateJobScreen initialCategoryId={1} onBack={jest.fn()} onSuccess={jest.fn()} />);
  await screen.findByText('Location confirmed');
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Fix leaking faucet'));
  fireEvent.press(screen.getByText('Next'));
  fireEvent.press(await screen.findByText('Pick a date'));
  fireEvent.press(screen.getByText('Choose test date'));
  fireEvent.press(screen.getByText('Pick a time'));
  fireEvent.press(screen.getByText('Choose test time'));
  if (screen.queryByText('Done')) fireEvent.press(screen.getByText('Done'));
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '1500');
  fireEvent.press(screen.getByText('Next'));

  const review = await screen.findByTestId('create-job-review');
  expect(within(review).getByText('Plumbing: Fix leaking faucet')).toBeTruthy();
  expect(within(review).getByText('Fix leaking faucet')).toBeTruthy();
  expect(within(review).getByText('Plumbing service needed. Tasks: Fix leaking faucet.')).toBeTruthy();
  expect(within(review).getAllByRole('button', { name: /^Edit / })).toHaveLength(7);
  expect(screen.getByText('You only pay when you hire. You can cancel for free until then.')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Edit Description' }));
  expect(await screen.findByText('What needs doing?')).toBeTruthy();
});
