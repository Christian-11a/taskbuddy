import React from 'react';
import { ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PostFooter from '../PostFooter';

// The footer reads the bottom inset from the safe area; the inset tests set it per case.
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => mockInsets };
});

afterEach(() => {
  mockInsets.bottom = 0;
  jest.restoreAllMocks();
});

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

describe('PostFooter — clears the navigation bar', () => {
  const paddingOf = () => StyleSheet.flatten(screen.getByTestId('post-footer').props.style).paddingBottom;

  it.each([
    [0, 16],
    [24, 40],
    [48, 64],
  ])('on Android, under a %i dp navigation bar, pads the footer by %i dp', (bottom, padding) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockInsets.bottom = bottom;
    render(<PostFooter nextLabel="Next" onNext={jest.fn()} />);

    expect(paddingOf()).toBe(padding);
  });

  it.each([
    [0, 16],
    [34, 34],
  ])('on iOS, with a %i dp inset, pads the footer by %i dp', (bottom, padding) => {
    mockInsets.bottom = bottom;
    render(<PostFooter nextLabel="Next" onNext={jest.fn()} />);

    expect(paddingOf()).toBe(padding);
  });
});
