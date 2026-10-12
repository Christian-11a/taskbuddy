import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import AcceptBookingModal from '../AcceptBookingModal';

describe('AcceptBookingModal — starts empty, no address prefill (P12)', () => {
  it('opens with an empty address field', () => {
    render(
      <AcceptBookingModal
        visible
        jobTitle="Fix the sink"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByTestId('accept-location-input').props.value).toBe('');
  });

  it('stops the where-are-you address at 300 characters, the most the accept call takes', () => {
    render(
      <AcceptBookingModal
        visible
        jobTitle="Fix the sink"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByTestId('accept-location-input').props.maxLength).toBe(300);
  });

  it('shows a validation message and does not confirm when submitted empty', () => {
    const onConfirm = jest.fn();

    render(
      <AcceptBookingModal
        visible
        jobTitle="Fix the sink"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('accept-location-confirm'));

    expect(
      screen.getByText('Enter where you are, or use your current location.'),
    ).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
