import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import TourOfferCard from '../TourOfferCard';

describe('TourOfferCard', () => {
  it('says there is a new quick tour, and how long it takes', () => {
    render(<TourOfferCard onStart={jest.fn()} onDismiss={jest.fn()} />);

    expect(screen.getByText('New: take a quick tour')).toBeTruthy();
    expect(screen.getByText('See where things are in about a minute.')).toBeTruthy();
  });

  it('"Take the tour" starts it and leaves the card to the App', () => {
    const onStart = jest.fn();
    const onDismiss = jest.fn();
    render(<TourOfferCard onStart={onStart} onDismiss={onDismiss} />);

    fireEvent.press(screen.getByRole('button', { name: 'Take the tour' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('the close button dismisses it, and only that', () => {
    const onStart = jest.fn();
    const onDismiss = jest.fn();
    render(<TourOfferCard onStart={onStart} onDismiss={onDismiss} />);

    fireEvent.press(screen.getByRole('button', { name: 'Dismiss the tour offer' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });
});
