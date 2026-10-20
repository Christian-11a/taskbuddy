import React from 'react';
import { Zap } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import UrgencyRow from '../UrgencyRow';

it('is one choice that reports whether it is picked', () => {
  const { rerender } = render(
    <UrgencyRow label="Urgent" blurb="As soon as possible" icon={Zap} selected={false} onSelect={jest.fn()} />,
  );
  expect(screen.getByRole('radio', { name: 'Urgent', checked: false })).toBeTruthy();

  rerender(<UrgencyRow label="Urgent" blurb="As soon as possible" icon={Zap} selected onSelect={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Urgent', checked: true })).toBeTruthy();
});

it('says in plain words what the choice means', () => {
  render(<UrgencyRow label="Urgent" blurb="As soon as possible" icon={Zap} selected={false} onSelect={jest.fn()} />);
  expect(screen.getByText('As soon as possible')).toBeTruthy();
});

it('calls onSelect when the row is pressed', () => {
  const onSelect = jest.fn();
  render(<UrgencyRow label="Urgent" blurb="As soon as possible" icon={Zap} selected={false} onSelect={onSelect} />);
  fireEvent.press(screen.getByRole('radio', { name: 'Urgent' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
});

describe('timing, badge and perks', () => {
  const base = { label: 'Urgent', blurb: 'As soon as possible', icon: Zap, onSelect: jest.fn() };

  it('shows the timing line and the badge', () => {
    render(<UrgencyRow {...base} selected={false} timing="Not hired in 5 min? We invite top-matched providers · Premium rate" badge="Premium" />);
    expect(screen.getByText('Not hired in 5 min? We invite top-matched providers · Premium rate')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
  });
  it('shows the perks only while selected', () => {
    const perks = ["Shown first in providers' job feed"];
    const { rerender } = render(<UrgencyRow {...base} selected={false} perks={perks} />);
    expect(screen.queryByText("Shown first in providers' job feed")).toBeNull();
    rerender(<UrgencyRow {...base} selected perks={perks} />);
    expect(screen.getByText("Shown first in providers' job feed")).toBeTruthy();
  });
  it('works without the new extras, and selects on press', () => {
    const onSelect = jest.fn();
    render(<UrgencyRow {...base} selected={false} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Urgent' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
