import React from 'react';
import { Wrench } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ServiceTile from '../ServiceTile';

it('is one choice that reports its name and whether it is picked', () => {
  const { rerender } = render(
    <ServiceTile name="Plumbing" icon={Wrench} selected={false} onSelect={jest.fn()} />,
  );
  expect(screen.getByRole('radio', { name: 'Plumbing', checked: false })).toBeTruthy();

  rerender(<ServiceTile name="Plumbing" icon={Wrench} selected onSelect={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Plumbing', checked: true })).toBeTruthy();
});

it('calls onSelect when the tile is pressed', () => {
  const onSelect = jest.fn();
  render(<ServiceTile name="Plumbing" icon={Wrench} selected={false} onSelect={onSelect} />);
  fireEvent.press(screen.getByRole('radio', { name: 'Plumbing' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it('shows the short line under the name when the category has one', () => {
  render(
    <ServiceTile name="Plumbing" detail="Pipes, fixtures & repairs" icon={Wrench} selected={false} onSelect={jest.fn()} />,
  );
  expect(screen.getByText('Pipes, fixtures & repairs')).toBeTruthy();
});

it('shows only the name when there is no short line', () => {
  render(<ServiceTile name="Plumbing" icon={Wrench} selected={false} onSelect={jest.fn()} />);
  expect(screen.getByText('Plumbing')).toBeTruthy();
  expect(screen.queryByText(/Pipes/)).toBeNull();
});
