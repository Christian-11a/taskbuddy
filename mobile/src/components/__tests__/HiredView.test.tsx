import React from 'react';
import * as Haptics from 'expo-haptics';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HiredView from '../HiredView';

const baseProps = {
  providerName: 'Alex Reyes',
  budget: 1000,
  scheduledAt: null,
  onMessage: jest.fn(),
  onViewJob: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HiredView', () => {
  it('says who was hired and that the budget is held for the job', () => {
    render(<HiredView {...baseProps} />);

    expect(screen.getByRole('header', { name: 'Alex Reyes is hired!' })).toBeTruthy();
    expect(screen.getByText('₱1,000.00 is held safely until the job is done.')).toBeTruthy();
  });

  it('says nothing is held for a job without a budget', () => {
    render(<HiredView {...baseProps} budget={null} />);

    expect(screen.getByText('Nothing is held for this job.')).toBeTruthy();
    expect(screen.queryByText(/is held safely/)).toBeNull();
  });

  it('says they can be chatted with, and when they come if the job has a time', () => {
    render(<HiredView {...baseProps} scheduledAt={new Date(2026, 9, 10, 19, 10).toISOString()} />);

    expect(screen.getByText('You can now chat with them')).toBeTruthy();
    expect(screen.getByText(/^They come \w{3}, Oct 10 · 7:10\s?PM$/)).toBeTruthy();
  });

  it('leaves out the visit line when the job has no time set', () => {
    render(<HiredView {...baseProps} />);

    expect(screen.queryByText(/They come/)).toBeNull();
  });

  it('Message opens the chat for this job, and View job opens the job', () => {
    render(<HiredView {...baseProps} />);

    fireEvent.press(screen.getByRole('button', { name: 'Message Alex Reyes' }));
    expect(baseProps.onMessage).toHaveBeenCalledTimes(1);
    expect(baseProps.onViewJob).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'View job' }));
    expect(baseProps.onViewJob).toHaveBeenCalledTimes(1);
  });

  it('plays the success mark with one success haptic', () => {
    render(<HiredView {...baseProps} />);

    expect(screen.getByLabelText('Success')).toBeTruthy();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  });
});
