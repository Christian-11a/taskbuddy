import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PhotoCard from '../PhotoCard';

describe('PhotoCard', () => {
  it('shows the photo under its name', () => {
    render(
      <PhotoCard title="Front" uri="file:///id.jpg" retakeLabel="Retake front photo" onRetake={jest.fn()} />,
    );
    expect(screen.getByText('Front')).toBeTruthy();
    expect(screen.getByLabelText('Front photo')).toBeTruthy();
  });

  it('calls onRetake from its own Retake button', () => {
    const onRetake = jest.fn();
    render(<PhotoCard title="Selfie" uri="file:///selfie.jpg" retakeLabel="Retake selfie" onRetake={onRetake} />);
    fireEvent.press(screen.getByLabelText('Retake selfie'));
    expect(onRetake).toHaveBeenCalledTimes(1);
  });
});
