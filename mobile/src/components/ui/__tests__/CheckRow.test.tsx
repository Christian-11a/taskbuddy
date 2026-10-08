import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CheckRow from '../CheckRow';

describe('CheckRow', () => {
  it('calls onToggle when pressed', () => {
    const onToggle = jest.fn();
    render(<CheckRow label="Send me job alerts" checked={false} onToggle={onToggle} />);

    fireEvent.press(screen.getByRole('checkbox', { name: 'Send me job alerts' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reports whether it is checked', () => {
    const { rerender } = render(<CheckRow label="Send me job alerts" checked={false} onToggle={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Send me job alerts', checked: false })).toBeTruthy();

    rerender(<CheckRow label="Send me job alerts" checked onToggle={jest.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Send me job alerts', checked: true })).toBeTruthy();
  });

  it('cannot be toggled while disabled', () => {
    const onToggle = jest.fn();
    render(<CheckRow label="Send me job alerts" checked={false} disabled onToggle={onToggle} />);

    const row = screen.getByRole('checkbox', { name: 'Send me job alerts', disabled: true });
    fireEvent.press(row);

    expect(onToggle).not.toHaveBeenCalled();
  });
});
