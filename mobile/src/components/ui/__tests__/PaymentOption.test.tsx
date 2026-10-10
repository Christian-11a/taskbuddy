import React from 'react';
import { Wallet } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PaymentOption from '../PaymentOption';

describe('PaymentOption', () => {
  it('is a radio labelled with its title and detail', () => {
    render(
      <PaymentOption title="GCash" meta="0917 *** 4821" icon={Wallet} selected={false} onSelect={jest.fn()} />,
    );

    expect(screen.getByRole('radio', { name: 'GCash, 0917 *** 4821' })).toBeTruthy();
  });

  it('uses the title alone as the label when there is no detail', () => {
    render(<PaymentOption title="Cash on handover" icon={Wallet} selected={false} onSelect={jest.fn()} />);

    expect(screen.getByRole('radio', { name: 'Cash on handover' })).toBeTruthy();
  });

  it('calls onSelect when pressed', () => {
    const onSelect = jest.fn();
    render(<PaymentOption title="GCash" meta="0917 *** 4821" icon={Wallet} selected={false} onSelect={onSelect} />);

    fireEvent.press(screen.getByRole('radio', { name: 'GCash, 0917 *** 4821' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reports whether it is the selected method', () => {
    const { rerender } = render(
      <PaymentOption title="GCash" meta="0917 *** 4821" icon={Wallet} selected={false} onSelect={jest.fn()} />,
    );
    expect(screen.getByRole('radio', { name: 'GCash, 0917 *** 4821', selected: false })).toBeTruthy();

    rerender(<PaymentOption title="GCash" meta="0917 *** 4821" icon={Wallet} selected onSelect={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'GCash, 0917 *** 4821', selected: true })).toBeTruthy();
  });

  it('shrinks a detail that carries an amount instead of cutting it off', () => {
    render(<PaymentOption title="Wallet" meta="₱1,248,397.00 available" icon={Wallet} selected={false} onSelect={jest.fn()} />);

    expect(screen.getByText('₱1,248,397.00 available').props).toEqual(
      expect.objectContaining({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 }),
    );
  });

  it('cannot be selected while disabled', () => {
    const onSelect = jest.fn();
    render(
      <PaymentOption title="GCash" meta="0917 *** 4821" icon={Wallet} selected={false} disabled onSelect={onSelect} />,
    );

    fireEvent.press(screen.getByRole('radio', { name: 'GCash, 0917 *** 4821', disabled: true }));

    expect(onSelect).not.toHaveBeenCalled();
  });
});
