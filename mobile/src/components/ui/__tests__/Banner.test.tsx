import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Banner from '../Banner';

// The banner container is not one focus stop (its action must stay tappable), so role and live region are read
// from its host view props. Host only: the composite View wrapper repeats the same props.
const hostWith = (props: Record<string, unknown>) =>
  screen.UNSAFE_queryAllByProps(props).filter(node => typeof node.type === 'string');
const alerts = () => hostWith({ accessibilityRole: 'alert' });
const politeRegions = () => hostWith({ accessibilityLiveRegion: 'polite' });

it('shows the message', () => {
  render(<Banner tone="info" message="Changes saved on this device." />);
  expect(screen.getByText('Changes saved on this device.')).toBeTruthy();
});

it('calls onAction from the action button', () => {
  const onAction = jest.fn();
  render(<Banner tone="warning" message="Your ID is still being checked." actionLabel="Details" onAction={onAction} />);
  fireEvent.press(screen.getByRole('button', { name: 'Details' }));
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('has no action button without an action label', () => {
  render(<Banner tone="info" message="Changes saved on this device." />);
  expect(screen.queryByRole('button')).toBeNull();
});

it.each(['warning', 'error', 'offline'] as const)('announces the %s tone as an alert', tone => {
  render(<Banner tone={tone} message="Something needs attention." />);
  expect(alerts()).toHaveLength(1);
});

it('does not announce the info tone as an alert', () => {
  render(<Banner tone="info" message="Changes saved on this device." />);
  expect(alerts()).toHaveLength(0);
});

it.each(['info', 'warning', 'error', 'offline'] as const)('is a polite live region for the %s tone', tone => {
  render(<Banner tone={tone} message="Something needs attention." />);
  expect(politeRegions()).toHaveLength(1);
});
