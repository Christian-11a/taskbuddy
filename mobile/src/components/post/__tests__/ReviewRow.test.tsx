import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ReviewRow from '../ReviewRow';

it('shows its label and its value', () => {
  render(<ReviewRow label="Where" value="Arturo Tanco Drive, Lipa" onEdit={jest.fn()} />);
  expect(screen.getByText('Where')).toBeTruthy();
  expect(screen.getByText('Arturo Tanco Drive, Lipa')).toBeTruthy();
});

it('offers an Edit link that names the row it edits', () => {
  const onEdit = jest.fn();
  render(<ReviewRow label="Where" value="Lipa" onEdit={onEdit} />);
  fireEvent.press(screen.getByRole('button', { name: 'Edit Where' }));
  expect(onEdit).toHaveBeenCalledTimes(1);
});

it('has no Edit link when it cannot be changed', () => {
  render(<ReviewRow label="Where" value="Lipa" />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('shows its children in place of a value, such as the photo strip', () => {
  render(
    <ReviewRow label="Photos (2)" onEdit={jest.fn()}>
      <Text>Photo strip</Text>
    </ReviewRow>,
  );
  expect(screen.getByText('Photos (2)')).toBeTruthy();
  expect(screen.getByText('Photo strip')).toBeTruthy();
});
