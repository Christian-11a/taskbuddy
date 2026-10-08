import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import StatusCard from '../StatusCard';
import Tap from '../Tap';

it('shows the overline, title and body', () => {
  render(<StatusCard tone="attention" overline="Waiting" title="Provider has not confirmed" body="We will tell you when they reply." />);
  expect(screen.getByText('Waiting')).toBeTruthy();
  expect(screen.getByText('Provider has not confirmed')).toBeTruthy();
  expect(screen.getByText('We will tell you when they reply.')).toBeTruthy();
});

it('reads as one group labelled overline, title and body', () => {
  render(<StatusCard tone="booked" overline="Booked" title="Plumbing on 9 Oct" body="Arrive at 9 AM." />);
  const card = screen.getByLabelText('Booked. Plumbing on 9 Oct. Arrive at 9 AM.');
  expect(card.props.accessible).toBe(true);
});

it('leaves the body out of the label when there is none', () => {
  render(<StatusCard tone="closed" overline="Closed" title="Job cancelled" />);
  expect(screen.getByLabelText('Closed. Job cancelled')).toBeTruthy();
});

it('is not grouped when it holds a button, so the button stays tappable', () => {
  const onPress = jest.fn();
  render(
    <StatusCard tone="action" overline="Action needed" title="Review 2 proposals" body="Pick a provider.">
      <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel="Review proposals">
        <Text>Open</Text>
      </Tap>
    </StatusCard>,
  );
  expect(screen.queryByLabelText('Action needed. Review 2 proposals. Pick a provider.')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Review proposals' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it.each(['attention', 'booked', 'action', 'done', 'closed'] as const)('renders the %s tone', tone => {
  render(<StatusCard tone={tone} overline="Status" title="Title" />);
  expect(screen.getByText('Status')).toBeTruthy();
  expect(screen.getByText('Title')).toBeTruthy();
});
