import React from 'react';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import HOEditProfileScreen from '../../../app/(homeowner)/screens/HOEditProfileScreen';
import SPEditProfileScreen from '../../../app/(provider)/screens/SPEditProfileScreen';
import { useAuth } from '../AuthContext';
import { api } from '../../lib/api';
jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/api', () => ({
  api: {
    categories: jest.fn(),
    updateProfile: jest.fn(),
    upsertProviderProfile: jest.fn(),
  },
}));
jest.mock('../../components/AddressField', () => {
  const React = require('react');
  const { Text, TextInput } = require('react-native');
  return ({
    onChangeText,
    onResolve,
    value,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    onResolve: (value: unknown) => void;
  }) => (
    <>
      <TextInput testID="address" value={value} onChangeText={onChangeText} />
      <Text
        onPress={() => {
          onChangeText('HSSi Building, Lipa');
          onResolve({
            latitude: 13.9417,
            longitude: 121.1631,
            formatted_address: 'HSSi Building, Lipa',
            city: 'Lipa',
            location_reference: 'signed-point',
          });
        }}
      >
        Select GPS address
      </Text>
    </>
  );
});
jest.mock('../../components/ConfirmationModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({
    visible,
    onConfirm,
  }: {
    visible: boolean;
    onConfirm: () => void;
  }) => (visible ? <Text onPress={onConfirm}>Confirm save</Text> : null);
});
beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    profile: {
      full_name: 'Alex',
      address: 'Old address',
      city: 'Quezon City',
      phone: '09171234567',
    },
    providerProfile: {
      category_id: 1,
      bio: 'Experienced provider offering dependable home services',
      years_experience: 5,
      service_radius_km: 25,
    },
    refreshProfile: jest.fn().mockResolvedValue(undefined),
  });
  (api.categories as jest.Mock).mockResolvedValue([]);
  (api.updateProfile as jest.Mock).mockResolvedValue({});
  (api.upsertProviderProfile as jest.Mock).mockResolvedValue({});
});
for (const Screen of [HOEditProfileScreen, SPEditProfileScreen]) {
  it(`${Screen.name} saves the server reference and matching city without client coordinates`, async () => {
    render(
      <Screen
        onBack={jest.fn()}
        onSave={jest.fn()}
        onManageServices={jest.fn()}
      />,
    );
    await act(async () => {});
    fireEvent.press(screen.getByText('Select GPS address'));
    fireEvent.press(screen.getByText('Save Changes'));
    await act(async () => fireEvent.press(screen.getByText('Confirm save')));
    expect(api.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'HSSi Building, Lipa',
        city: 'Lipa',
        location_reference: 'signed-point',
      }),
    );
    expect(
      (api.updateProfile as jest.Mock).mock.calls[0][0],
    ).not.toHaveProperty('latitude');
  });
  it(`${Screen.name} invalidates the reference after manual address edits`, async () => {
    render(
      <Screen
        onBack={jest.fn()}
        onSave={jest.fn()}
        onManageServices={jest.fn()}
      />,
    );
    await act(async () => {});
    fireEvent.press(screen.getByText('Select GPS address'));
    fireEvent.changeText(screen.getByTestId('address'), 'New street');
    fireEvent.press(screen.getByText('Save Changes'));
    await act(async () => fireEvent.press(screen.getByText('Confirm save')));
    expect(api.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'New street',
        location_reference: undefined,
      }),
    );
  });
  it(`${Screen.name} invalidates the reference after a manual city edit`, async () => {
    render(
      <Screen
        onBack={jest.fn()}
        onSave={jest.fn()}
        onManageServices={jest.fn()}
      />,
    );
    await act(async () => {});
    fireEvent.press(screen.getByText('Select GPS address'));
    fireEvent.changeText(
      screen.getByPlaceholderText('City / Municipality'),
      'Batangas',
    );
    fireEvent.press(screen.getByText('Save Changes'));
    await act(async () => fireEvent.press(screen.getByText('Confirm save')));
    expect(api.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        city: 'Batangas',
        location_reference: undefined,
      }),
    );
  });
}
it('shows an expired-reference error and leaves the form available for a new selection', async () => {
  (api.updateProfile as jest.Mock).mockRejectedValue(
    new Error('Location confirmation expired. Select the address again.'),
  );
  render(<HOEditProfileScreen onBack={jest.fn()} onSave={jest.fn()} />);
  fireEvent.press(screen.getByText('Select GPS address'));
  fireEvent.press(screen.getByText('Save Changes'));
  await act(async () => fireEvent.press(screen.getByText('Confirm save')));
  await waitFor(() =>
    expect(
      screen.getByText(
        'Location confirmation expired. Select the address again.',
      ),
    ).toBeTruthy(),
  );
});
