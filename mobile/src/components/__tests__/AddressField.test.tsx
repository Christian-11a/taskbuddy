import React, { useState } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AddressField from '../AddressField';
import { api, type GeocodedAddress } from '../../lib/api';
import { requestAppPermission } from '../../lib/permissions';
import * as Location from 'expo-location';
jest.mock('../../lib/api', () => ({
  api: { addressSuggestions: jest.fn(), reverseGeocode: jest.fn() },
}));
jest.mock('../../lib/permissions', () => ({ requestAppPermission: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
}));
const point = {
  latitude: 13.9417,
  longitude: 121.1631,
  formatted_address: 'HSSi Building, Lipa',
  city: 'Lipa',
  location_reference: 'server-proof',
};
function Harness() {
  const [value, setValue] = useState('');
  const [resolved, setResolved] = useState<GeocodedAddress | null>(null);
  return (
    <>
      <AddressField
        testID="address"
        value={value}
        onChangeText={setValue}
        onResolve={setResolved}
      />
      <Text testID="reference">{resolved?.location_reference ?? ''}</Text>
    </>
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (api.addressSuggestions as jest.Mock).mockResolvedValue([]);
  (api.reverseGeocode as jest.Mock).mockResolvedValue(point);
  (requestAppPermission as jest.Mock).mockResolvedValue(true);
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { latitude: point.latitude, longitude: point.longitude },
  });
});
afterEach(() => {
  jest.useRealTimers();
});
it('preserves a resolved GPS point and invalidates its reference on manual editing', async () => {
  render(<Harness />);
  await act(async () =>
    fireEvent.press(screen.getByText('Use my current location')),
  );
  expect(screen.getByTestId('address').props.value).toBe(
    point.formatted_address,
  );
  expect(screen.getByTestId('reference').props.children).toBe('server-proof');
  fireEvent.changeText(screen.getByTestId('address'), 'Manually edited street');
  expect(screen.getByTestId('reference').props.children).toBe('');
});
it('shows permission denial without attempting geocoding or blocking typed input', async () => {
  (requestAppPermission as jest.Mock).mockResolvedValue(false);
  render(<Harness />);
  await act(async () =>
    fireEvent.press(screen.getByText('Use my current location')),
  );
  expect(
    screen.getByText('Location access is off — type the address instead.'),
  ).toBeTruthy();
  expect(api.reverseGeocode).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId('address'), 'My typed address');
  expect(screen.getByTestId('address').props.value).toBe('My typed address');
});
it('a delayed reverse lookup cannot overwrite an address typed meanwhile', async () => {
  let finish: (value: GeocodedAddress) => void = () => {};
  (api.reverseGeocode as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Harness />);
  await act(async () =>
    fireEvent.press(screen.getByText('Use my current location')),
  );
  fireEvent.changeText(screen.getByTestId('address'), 'New typed address');
  await act(async () => finish(point));
  expect(screen.getByTestId('address').props.value).toBe('New typed address');
  expect(screen.getByTestId('reference').props.children).toBe('');
});
it('precise autocomplete selections keep their reference; coarse rows never confirm a point', async () => {
  (api.addressSuggestions as jest.Mock).mockResolvedValue([
    { ...point, precise: true },
    {
      ...point,
      formatted_address: 'Lipa',
      precise: false,
      location_reference: undefined,
    },
  ]);
  render(<Harness />);
  fireEvent(screen.getByTestId('address'), 'focus');
  fireEvent.changeText(screen.getByTestId('address'), 'HSSi');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
  fireEvent.press(screen.getByText(point.formatted_address));
  expect(screen.getByTestId('reference').props.children).toBe('server-proof');
  fireEvent.changeText(screen.getByTestId('address'), 'Lipa search');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
  fireEvent.press(screen.getByText('Lipa'));
  expect(screen.getByTestId('reference').props.children).toBe('');
  expect(
    screen.getByText('Add the house number and street to this address.'),
  ).toBeTruthy();
});

it('clears lookup progress and ignores a late suggestion after the address is erased', async () => {
  let finish!: (value: unknown[]) => void;
  (api.addressSuggestions as jest.Mock).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Harness />);
  fireEvent.changeText(screen.getByTestId('address'), 'HSSi');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
  expect(screen.getByText('Looking up addresses…')).toBeTruthy();
  fireEvent.changeText(screen.getByTestId('address'), '');
  expect(screen.queryByText('Looking up addresses…')).toBeNull();
  await act(async () => finish([{ ...point, precise: true }]));
  expect(screen.queryByTestId('address-suggestions')).toBeNull();
});
