import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import MapPreview from '../MapPreview';

const SOURCE = { uri: 'https://example.test/static-map?lat=14.6&lon=121' };
const MAP_LABEL = 'Map of the confirmed job location';

it('shows a placeholder while the map loads, then the map alone', () => {
  render(<MapPreview source={SOURCE} onError={jest.fn()} />);
  expect(screen.getByTestId('map-preview-loading')).toBeTruthy();

  fireEvent(screen.getByLabelText(MAP_LABEL), 'load');
  expect(screen.queryByTestId('map-preview-loading')).toBeNull();
  expect(screen.getByLabelText(MAP_LABEL)).toBeTruthy();
});

it('reports a failed image to its owner, which decides whether the card stays', () => {
  const onError = jest.fn();
  render(<MapPreview source={SOURCE} onError={onError} />);
  fireEvent(screen.getByLabelText(MAP_LABEL), 'error');
  expect(onError).toHaveBeenCalledTimes(1);
});
