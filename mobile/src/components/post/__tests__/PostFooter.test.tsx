import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PostFooter from '../PostFooter';

it('runs Next when it is pressed', () => {
  const onNext = jest.fn();
  render(<PostFooter nextLabel="Next" onNext={onNext} />);
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it('shows Back only when there is a previous step to go to', () => {
  const { rerender } = render(<PostFooter nextLabel="Next" onNext={jest.fn()} />);
  expect(screen.queryByText('Back')).toBeNull();

  const onBack = jest.fn();
  rerender(<PostFooter nextLabel="Next" onNext={jest.fn()} onBack={onBack} />);
  fireEvent.press(screen.getByRole('button', { name: 'Back to the previous step' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('does not run Next while it is disabled', () => {
  const onNext = jest.fn();
  render(<PostFooter nextLabel="Next" onNext={onNext} nextDisabled />);
  const next = screen.getByRole('button', { name: 'Next' });
  expect(next.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  fireEvent.press(next);
  expect(onNext).not.toHaveBeenCalled();
});

it('keeps its label and shows a spinner while busy, and blocks Next', () => {
  const onNext = jest.fn();
  render(<PostFooter nextLabel="Next" onNext={onNext} busy />);
  expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  expect(screen.getByText('Next')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(onNext).not.toHaveBeenCalled();
});
