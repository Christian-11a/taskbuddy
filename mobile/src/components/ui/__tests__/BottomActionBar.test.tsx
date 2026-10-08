import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BottomActionBar from '../BottomActionBar';

it('calls onPrimary when the primary button is pressed', () => {
  const onPrimary = jest.fn();
  render(<BottomActionBar primaryLabel="Post job" onPrimary={onPrimary} />);
  fireEvent.press(screen.getByRole('button', { name: 'Post job' }));
  expect(onPrimary).toHaveBeenCalledTimes(1);
});

it('adds a secondary text button that calls onSecondary', () => {
  const onSecondary = jest.fn();
  render(<BottomActionBar primaryLabel="Post job" onPrimary={jest.fn()} secondaryLabel="Save draft" onSecondary={onSecondary} />);
  fireEvent.press(screen.getByRole('button', { name: 'Save draft' }));
  expect(onSecondary).toHaveBeenCalledTimes(1);
});

it('has only the primary button when there is no secondary label', () => {
  render(<BottomActionBar primaryLabel="Post job" onPrimary={jest.fn()} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

it('does not run the primary action while it is disabled', () => {
  const onPrimary = jest.fn();
  render(<BottomActionBar primaryLabel="Post job" onPrimary={onPrimary} primaryDisabled />);
  const button = screen.getByRole('button', { name: 'Post job' });
  expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  fireEvent.press(button);
  expect(onPrimary).not.toHaveBeenCalled();
});

it('shows a spinner instead of the label while busy, keeps the name, and blocks presses', () => {
  const onPrimary = jest.fn();
  render(<BottomActionBar primaryLabel="Post job" onPrimary={onPrimary} busy />);
  expect(screen.queryByText('Post job')).toBeNull();
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  const button = screen.getByRole('button', { name: 'Post job' });
  expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  fireEvent.press(button);
  expect(onPrimary).not.toHaveBeenCalled();
});

it('renders the danger tone with the same behaviour', () => {
  const onPrimary = jest.fn();
  render(<BottomActionBar primaryLabel="Cancel job" onPrimary={onPrimary} tone="danger" />);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel job' }));
  expect(onPrimary).toHaveBeenCalledTimes(1);
});
