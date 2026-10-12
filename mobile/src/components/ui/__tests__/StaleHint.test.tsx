import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import StaleHint from '../StaleHint';

const reanimated = require('react-native-reanimated') as { useReducedMotion: () => boolean };

describe('StaleHint', () => {
  it('shows nothing while the data on screen is fresh', () => {
    render(<StaleHint stale={false} refreshing={false} error={null} />);

    expect(screen.queryByTestId('stale-hint')).toBeNull();
  });

  it('says Updating… with a spinner while a fetch replaces the saved copy', () => {
    render(<StaleHint stale refreshing error={null} />);

    expect(screen.getByText('Updating…')).toBeTruthy();
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('uses the words it is given for the updating line', () => {
    render(<StaleHint stale refreshing error={null} updatingLabel="Updating balance…" />);

    expect(screen.getByText('Updating balance…')).toBeTruthy();
    expect(screen.queryByText('Updating…')).toBeNull();
  });

  it('keeps the words and drops the spinner when reduced motion is on', () => {
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      render(<StaleHint stale refreshing error={null} />);

      expect(screen.getByText('Updating…')).toBeTruthy();
      expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('says the saved data could not be refreshed, with Try again that runs the retry', () => {
    const onRetry = jest.fn();
    render(<StaleHint stale refreshing={false} error="Network request failed" onRetry={onRetry} />);

    expect(screen.getByText("Showing saved data. Couldn't refresh.")).toBeTruthy();
    expect(screen.queryByText('Network request failed')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the failure without a button when there is no retry to offer', () => {
    render(<StaleHint stale refreshing={false} error="Network request failed" />);

    expect(screen.getByText("Showing saved data. Couldn't refresh.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says Updating while a refresh runs, even when another part of the screen failed', () => {
    render(<StaleHint stale refreshing error="Network request failed" onRetry={jest.fn()} />);

    expect(screen.getByText('Updating…')).toBeTruthy();
    expect(screen.queryByText("Showing saved data. Couldn't refresh.")).toBeNull();
  });

  it('shows nothing for stale data that is neither refreshing nor failed', () => {
    render(<StaleHint stale refreshing={false} error={null} />);

    expect(screen.queryByTestId('stale-hint')).toBeNull();
  });
});
