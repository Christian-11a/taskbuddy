import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BottomActionBar from '../BottomActionBar';
import ScreenFrame from '../../ScreenFrame';

// The bar reads the bottom inset from the safe area; the inset tests set it per case.
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => mockInsets };
});

afterEach(() => {
  mockInsets.bottom = 0;
});

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

it('locks the secondary action while busy so it cannot be backed out of mid-request', () => {
  const onSecondary = jest.fn();
  render(<BottomActionBar primaryLabel="Post job" onPrimary={jest.fn()} busy secondaryLabel="Save draft" onSecondary={onSecondary} />);
  const secondary = screen.getByRole('button', { name: 'Save draft' });
  expect(secondary.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  fireEvent.press(secondary);
  expect(onSecondary).not.toHaveBeenCalled();
});

it('renders the danger tone with the same behaviour', () => {
  const onPrimary = jest.fn();
  render(<BottomActionBar primaryLabel="Cancel job" onPrimary={onPrimary} tone="danger" />);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel job' }));
  expect(onPrimary).toHaveBeenCalledTimes(1);
});

describe('BottomActionBar — the bottom inset is owned once', () => {
  const paddingOf = () => StyleSheet.flatten(screen.getByTestId('bottom-action-bar').props.style).paddingBottom;

  // Outside a ScreenFrame nothing else clears the navigation bar, so the bar does, with at least 16 dp.
  it.each([
    [0, 16],
    [24, 24],
    [48, 48],
  ])('outside a frame, under a %i dp navigation bar, pads the bar by %i dp', (bottom, padding) => {
    mockInsets.bottom = bottom;
    render(<BottomActionBar primaryLabel="Save" onPrimary={jest.fn()} />);

    expect(paddingOf()).toBe(padding);
  });

  // Inside a ScreenFrame the frame's strip takes the inset, so the bar adds only its own 16 dp: the total is not doubled.
  it.each([
    [0, 16],
    [24, 40],
    [48, 64],
  ])('inside a frame, under a %i dp navigation bar, leaves %i dp under the button in all', (bottom, total) => {
    mockInsets.bottom = bottom;
    render(<ScreenFrame><BottomActionBar primaryLabel="Save" onPrimary={jest.fn()} /></ScreenFrame>);

    const strip = screen.queryByTestId('screen-frame-inset');
    expect(paddingOf() + (strip ? strip.props.style.height : 0)).toBe(total);
  });
});
