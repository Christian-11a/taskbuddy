import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import RadioRow from '../RadioRow';

describe('RadioRow', () => {
  it('calls onSelect when pressed', () => {
    const onSelect = jest.fn();
    render(<RadioRow label="Pay at handover" selected={false} onSelect={onSelect} />);

    fireEvent.press(screen.getByRole('radio', { name: 'Pay at handover' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reports whether it is the selected option', () => {
    const { rerender } = render(<RadioRow label="Pay at handover" selected={false} onSelect={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Pay at handover', selected: false })).toBeTruthy();

    rerender(<RadioRow label="Pay at handover" selected onSelect={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Pay at handover', selected: true })).toBeTruthy();
  });

  it('cannot be selected while disabled', () => {
    const onSelect = jest.fn();
    render(<RadioRow label="Pay at handover" selected={false} disabled onSelect={onSelect} />);

    fireEvent.press(screen.getByRole('radio', { name: 'Pay at handover', disabled: true }));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
