import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import LoadErrorCard from '../LoadErrorCard';

it('shows the title and the error in the error card, with Try again that runs the reload', () => {
  const onRetry = jest.fn();
  render(<LoadErrorCard title="Couldn't load your jobs" message="Network request failed" onRetry={onRetry} />);
  const card = screen.getByTestId('error-card');
  expect(within(card).getByText("Couldn't load your jobs")).toBeTruthy();
  expect(within(card).getByText('Network request failed')).toBeTruthy();
  fireEvent.press(within(card).getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('has no action when there is nothing to retry, such as a chat load', () => {
  render(<LoadErrorCard title="Couldn't load this chat" message="Could not load chat." />);
  expect(within(screen.getByTestId('error-card')).getByText('Could not load chat.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
});
