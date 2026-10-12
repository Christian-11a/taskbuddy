import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ProtectSheet from '../ProtectSheet';

describe('ProtectSheet', () => {
  it('explains the ID photos in plain words when open', () => {
    render(<ProtectSheet visible onClose={jest.fn()} />);
    expect(screen.getByText('How we protect your ID')).toBeTruthy();
    expect(screen.getByText(/private storage bucket that only TaskBuddy admins can open/)).toBeTruthy();
    expect(screen.getByText(/Stripe Identity/)).toBeTruthy();
    expect(screen.getByText(/We use these photos only to verify you/)).toBeTruthy();
  });

  it('closes with the Got it button', () => {
    const onClose = jest.fn();
    render(<ProtectSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByLabelText('Got it'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows nothing while closed', () => {
    render(<ProtectSheet visible={false} onClose={jest.fn()} />);
    expect(screen.queryByText('How we protect your ID')).toBeNull();
  });
});
