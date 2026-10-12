import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import VerifyAppBar from '../VerifyAppBar';

describe('VerifyAppBar', () => {
  it('shows the title', () => {
    render(<VerifyAppBar title="Get verified" onBack={jest.fn()} backLabel="Leave verification" />);
    expect(screen.getByText('Get verified')).toBeTruthy();
  });

  it('calls onBack from a button with the given label', () => {
    const onBack = jest.fn();
    render(<VerifyAppBar title="Get verified" onBack={onBack} backLabel="Back to the previous step" />);
    fireEvent.press(screen.getByLabelText('Back to the previous step'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
