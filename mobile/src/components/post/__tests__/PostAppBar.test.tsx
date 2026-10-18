import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ArrowLeft, X } from 'lucide-react-native';
import PostAppBar from '../PostAppBar';

it('shows an arrow by default and an X when leading is close', () => {
  const { unmount } = render(<PostAppBar title="Post a job" onBack={jest.fn()} />);
  expect(screen.UNSAFE_queryByType(ArrowLeft)).toBeTruthy();
  expect(screen.UNSAFE_queryByType(X)).toBeNull();
  unmount();

  render(<PostAppBar title="Post a job" onBack={jest.fn()} leading="close" backLabel="Close" />);
  expect(screen.UNSAFE_queryByType(X)).toBeTruthy();
  expect(screen.UNSAFE_queryByType(ArrowLeft)).toBeNull();
});

it('shows the screen name as a heading', () => {
  render(<PostAppBar title="Post a job" onBack={jest.fn()} />);
  expect(screen.getByRole('header', { name: 'Post a job' })).toBeTruthy();
});

it('calls onBack from the round back button', () => {
  const onBack = jest.fn();
  render(<PostAppBar title="Post a job" onBack={onBack} />);
  fireEvent.press(screen.getByRole('button', { name: 'Exit job form' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('is announced with the given label when the arrow only steps back', () => {
  const onBack = jest.fn();
  render(<PostAppBar title="Post a job" onBack={onBack} backLabel="Previous step" />);
  fireEvent.press(screen.getByRole('button', { name: 'Previous step' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Exit job form' })).toBeNull();
});
