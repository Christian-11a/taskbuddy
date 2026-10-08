import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PersonCard from '../PersonCard';

// Initials are decorative (the name is read aloud), so they are hidden from accessibility queries.
const HIDDEN = { includeHiddenElements: true };
const LONG_NAME = 'Maria Consolacion Fernandez-Villanueva de la Cruz Santos';
const LONG_SUBTITLE = 'Licensed plumber in Quezon City with twelve years of repair work';

it('shows the name, subtitle and initials when there is no photo', () => {
  render(<PersonCard name="Juan Dela Cruz" subtitle="4.0 · 2 jobs done" />);
  expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
  expect(screen.getByText('4.0 · 2 jobs done')).toBeTruthy();
  expect(screen.getByText('JD', HIDDEN)).toBeTruthy();
});

it('takes initials from the first two words only, in capitals', () => {
  render(<PersonCard name="  maria   santos reyes " />);
  expect(screen.getByText('MS', HIDDEN)).toBeTruthy();
});

it('uses one initial for a one-word name', () => {
  render(<PersonCard name="Ana" />);
  expect(screen.getByText('A', HIDDEN)).toBeTruthy();
});

it('shows the photo instead of initials when there is one', () => {
  render(<PersonCard name="Juan Dela Cruz" avatarUrl="https://cdn.example.com/juan.jpg" />);
  expect(screen.getByTestId('person-card-photo', HIDDEN)).toBeTruthy();
  expect(screen.queryByText('JD', HIDDEN)).toBeNull();
});

it('keeps the name and subtitle to one line each', () => {
  render(<PersonCard name={LONG_NAME} subtitle={LONG_SUBTITLE} />);
  expect(screen.getByText(LONG_NAME).props.numberOfLines).toBe(1);
  expect(screen.getByText(LONG_SUBTITLE).props.numberOfLines).toBe(1);
});

it('shows the star only when the card is rated', () => {
  const { unmount } = render(<PersonCard name="Juan Dela Cruz" subtitle="4.0 · 2 jobs done" rating />);
  expect(screen.getByTestId('person-card-rating')).toBeTruthy();
  unmount();
  render(<PersonCard name="Juan Dela Cruz" subtitle="New provider" />);
  expect(screen.queryByTestId('person-card-rating')).toBeNull();
});

it('is a button labelled with name and subtitle when it can be pressed', () => {
  const onPress = jest.fn();
  render(<PersonCard name="Juan Dela Cruz" subtitle="4.0 · 2 jobs done" rating onPress={onPress} />);
  fireEvent.press(screen.getByRole('button', { name: 'Juan Dela Cruz, 4.0 · 2 jobs done' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('has a labelled message button that does not press the card', () => {
  const onPress = jest.fn();
  const onMessage = jest.fn();
  render(<PersonCard name="Juan Dela Cruz" subtitle="4.0 · 2 jobs done" onPress={onPress} onMessage={onMessage} />);
  fireEvent.press(screen.getByRole('button', { name: 'Message Juan Dela Cruz' }));
  expect(onMessage).toHaveBeenCalledTimes(1);
  expect(onPress).not.toHaveBeenCalled();
});

it('offers only the message button when there is no card press', () => {
  const onMessage = jest.fn();
  render(<PersonCard name="Juan Dela Cruz" onMessage={onMessage} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: 'Message Juan Dela Cruz' }));
  expect(onMessage).toHaveBeenCalledTimes(1);
});

it('has no buttons when it has no handlers', () => {
  render(<PersonCard name="Juan Dela Cruz" subtitle="4.0 · 2 jobs done" />);
  expect(screen.queryByRole('button')).toBeNull();
});
