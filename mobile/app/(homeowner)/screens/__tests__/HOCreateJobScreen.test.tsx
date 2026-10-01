import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HOCreateJobScreen from '../HOCreateJobScreen';
import { api } from '../../../../src/lib/api';

jest.mock('../../../../src/lib/api', () => ({ api: {
  categories: jest.fn(), staticMapSource: jest.fn(() => ({ uri: 'https://example.test/map.png' })),
} }));
jest.mock('../../../../src/context/AuthContext', () => ({ useAuth: () => ({ profile: {
  address: 'Quezon City', latitude: 14.6, longitude: 121,
} }) }));
jest.mock('../../../../src/lib/permissions', () => ({ requestAppPermission: jest.fn().mockResolvedValue(true) }));
jest.mock('react-native-calendars', () => ({ Calendar: () => null }));
jest.mock('@react-native-community/datetimepicker', () => () => null);

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
