import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import OwnAvatar from '../OwnAvatar';

jest.mock('expo-image', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { Image: (p: any) => R.createElement(View, { testID: 'own-avatar-photo', ...p }) };
});

let mockProfile: { avatar_url: string | null } = { avatar_url: 'https://x/a.jpg' };
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

beforeEach(() => {
  mockProfile = { avatar_url: 'https://x/a.jpg' };
});

describe('OwnAvatar — the signed-in user\'s photo inside the avatar circle', () => {
  it('shows the photo while it loads fine', () => {
    render(<OwnAvatar name="Ana" />);

    expect(screen.getByTestId('own-avatar-photo')).toBeTruthy();
  });

  it('shows the person silhouette when the photo fails to load', () => {
    render(<OwnAvatar name="Ana" />);

    fireEvent(screen.getByTestId('own-avatar-photo'), 'error');

    expect(screen.queryByTestId('own-avatar-photo')).toBeNull();
    expect(screen.queryByLabelText("Ana's avatar")).toBeTruthy();
  });

  it('tries the photo again when the avatar url changes after a failure', () => {
    const { rerender } = render(<OwnAvatar name="Ana" />);
    fireEvent(screen.getByTestId('own-avatar-photo'), 'error');
    expect(screen.queryByTestId('own-avatar-photo')).toBeNull();

    mockProfile = { avatar_url: 'https://x/b.jpg' };
    rerender(<OwnAvatar name="Ana" />);

    expect(screen.getByTestId('own-avatar-photo')).toBeTruthy();
  });
});
