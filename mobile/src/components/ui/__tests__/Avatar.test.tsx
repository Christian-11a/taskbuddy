import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Avatar from '../Avatar';

jest.mock('expo-image', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { Image: (p: any) => R.createElement(View, p) };
});

describe('Avatar — another person\'s photo in an avatar circle', () => {
  it('shows the photo when there is a url', () => {
    render(<Avatar uri="https://x/a.jpg" name="Ana" />);
    expect(screen.getByLabelText("Ana's photo")).toBeTruthy();
  });
  it('shows the silhouette when there is no url', () => {
    render(<Avatar uri={null} name="Ana" />);
    expect(screen.getByLabelText("Ana's avatar")).toBeTruthy();
    expect(screen.queryByLabelText("Ana's photo")).toBeNull();
  });
  it('falls back to the silhouette when the photo fails to load', () => {
    render(<Avatar uri="https://x/a.jpg" name="Ana" />);
    fireEvent(screen.getByLabelText("Ana's photo"), 'error');
    expect(screen.queryByLabelText("Ana's photo")).toBeNull();
    expect(screen.getByLabelText("Ana's avatar")).toBeTruthy();
  });
  it('tries again when the url changes after a failure', () => {
    const { rerender } = render(<Avatar uri="https://x/a.jpg" name="Ana" />);
    fireEvent(screen.getByLabelText("Ana's photo"), 'error');
    rerender(<Avatar uri="https://x/b.jpg" name="Ana" />);
    expect(screen.getByLabelText("Ana's photo")).toBeTruthy();
  });
  it('uses a custom fallback when given one', () => {
    render(<Avatar uri={undefined} name="Ana" fallback={<Text>AN</Text>} />);
    expect(screen.getByText('AN')).toBeTruthy();
  });
});
