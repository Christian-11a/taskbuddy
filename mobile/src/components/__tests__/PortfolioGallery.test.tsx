import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import PortfolioGallery from '../PortfolioGallery';
import type { PortfolioEntry } from '../../lib/api';
const entries = [
  {
    id: 'p1',
    caption: 'Sink repair',
    image_url: 'https://test/one',
    category_id: 1,
    position: 0,
    service_categories: { id: 1, name: 'Plumbing' },
  },
  {
    id: 'p2',
    caption: 'Paintwork',
    image_url: 'https://test/two',
    position: 1,
  },
] as PortfolioEntry[];
it('opens the selected image, changes images and handles failure/close without losing the gallery', () => {
  render(<PortfolioGallery entries={entries} />);
  fireEvent.press(screen.getByLabelText('View portfolio photo: Paintwork'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe(
    'https://test/two',
  );
  fireEvent.press(screen.getByText('Previous photo'));
  expect(screen.getByTestId('full-photo').props.source.uri).toBe(
    'https://test/one',
  );
  fireEvent(screen.getByTestId('full-photo'), 'error');
  expect(screen.getByText('Could not load this photo.')).toBeTruthy();
  fireEvent.press(screen.getByText('Retry photo'));
  expect(screen.getByTestId('full-photo')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Close photo'));
  expect(screen.queryByTestId('full-photo')).toBeNull();
  expect(screen.getByText('Sink repair')).toBeTruthy();
});
it('shows empty state and exposes editing/removal only when supplied by the owner screen', () => {
  const edit = jest.fn(),
    remove = jest.fn();
  const view = render(<PortfolioGallery entries={[]} />);
  expect(screen.getByText('No portfolio photos yet.')).toBeTruthy();
  view.rerender(<PortfolioGallery entries={entries} />);
  expect(screen.queryByText('Remove photo')).toBeNull();
  view.rerender(
    <PortfolioGallery entries={entries} onEdit={edit} onRemove={remove} />,
  );
  fireEvent.press(screen.getAllByText('Edit photo details')[0]);
  fireEvent.press(screen.getAllByText('Remove photo')[0]);
  expect(edit).toHaveBeenCalledWith(entries[0]);
  expect(remove).toHaveBeenCalledWith(entries[0]);
});

it('Android Back closes the image while preserving the gallery entries', () => {
  render(<PortfolioGallery entries={entries} />);
  fireEvent.press(screen.getByLabelText('View portfolio photo: Sink repair'));
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(screen.queryByTestId('full-photo')).toBeNull();
  expect(screen.getByText('Sink repair')).toBeTruthy();
});
