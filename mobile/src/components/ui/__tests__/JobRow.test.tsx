import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import JobRow from '../JobRow';

const LONG = 'Plumbing: Replace kitchen sink and fix the leaking pipe under the counter';

it('shows title, meta and amount and is pressable', () => {
  const onPress = jest.fn();
  render(<JobRow title={LONG} meta="Confirmed" amount="₱125,000.00" date="2026-10-09" tone="booked" onPress={onPress} testID="row" />);
  expect(screen.getByText(LONG).props.numberOfLines).toBe(2);
  expect(screen.getByText('Confirmed')).toBeTruthy();
  expect(screen.getByText('₱125,000.00')).toBeTruthy();
  fireEvent.press(screen.getByTestId('row'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('puts status and amount on the same line so long titles keep the width', () => {
  render(<JobRow title={LONG} meta="Confirmed" amount="₱1.00" tone="booked" />);
  const metaRow = screen.getByTestId('job-row-meta');
  expect(StyleSheet.flatten(metaRow.props.style).flexDirection).toBe('row');
  expect(within(metaRow).getByText('₱1.00')).toBeTruthy();
  expect(within(metaRow).getByText('Confirmed')).toBeTruthy();
});

it('renders the needs-you tone without crashing', () => {
  render(<JobRow title="Cleaning" meta="2 proposals to review" amount="₱1.00" tone="needsYou" />);
  expect(screen.getByText('2 proposals to review')).toBeTruthy();
});

it('is drawn again when its tone changes, so an open job that gets applied to repaints', () => {
  const { rerender } = render(<JobRow title={LONG} meta="Open" amount="₱1.00" tone="open" testID="feed-row" />);
  const before = screen.getByTestId('feed-row');

  rerender(<JobRow title={LONG} meta="Applied · waiting" amount="₱1.00" tone="applied" testID="feed-row" />);

  expect(screen.getByTestId('feed-row')).not.toBe(before);
  expect(screen.getByText('Applied · waiting')).toBeTruthy();
});

it('shrinks a big amount to fit on one line instead of cutting it off', () => {
  render(<JobRow title={LONG} meta="Confirmed" amount="₱1,248,397.00" tone="booked" />);
  expect(screen.getByText('₱1,248,397.00').props).toEqual(
    expect.objectContaining({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 }),
  );
});
