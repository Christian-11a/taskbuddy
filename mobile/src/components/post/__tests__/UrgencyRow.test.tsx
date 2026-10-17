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
