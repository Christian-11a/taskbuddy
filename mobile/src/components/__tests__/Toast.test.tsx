import React from 'react';
import * as Haptics from 'expo-haptics';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ToastHost, showToast } from '../Toast';

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Toast', () => {
  it('shows the message', () => {
    render(<ToastHost />);

    act(() => { showToast('Proposal sent', 'success'); });

    expect(screen.getByText('Proposal sent')).toBeTruthy();
  });

  it('calls the action and hides the toast at once', () => {
    const onPress = jest.fn();
    render(<ToastHost />);
    act(() => { showToast('Job deleted', 'info', { label: 'Undo', onPress }); });

    fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Job deleted')).toBeNull();
  });

  it('shows no action button when none is given', () => {
    render(<ToastHost />);

    act(() => { showToast('Saved'); });

    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps a toast with an action up for 5 seconds, and a plain one for 2.6 seconds', () => {
    render(<ToastHost />);

    act(() => { showToast('Plain message'); });
    act(() => { jest.advanceTimersByTime(2600); });
    expect(screen.queryByText('Plain message')).toBeNull();

    act(() => { showToast('Undoable', 'info', { label: 'Undo', onPress: jest.fn() }); });
    act(() => { jest.advanceTimersByTime(2600); });
    expect(screen.getByText('Undoable')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(2400); });
    expect(screen.queryByText('Undoable')).toBeNull();
  });

  it('still gives an error toast its error haptic', () => {
    render(<ToastHost />);

    act(() => { showToast('Could not save', 'error'); });

    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });
});
