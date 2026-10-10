import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HelpSupportScreen from '../HelpSupportScreen';

describe('HelpSupportScreen — tutorial replay entry point', () => {
  it('shows a "View tutorial" row and calls onViewTutorial when pressed', () => {
    const onViewTutorial = jest.fn();
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} onViewTutorial={onViewTutorial} />);

    fireEvent.press(screen.getByText('View tutorial'));

    expect(onViewTutorial).toHaveBeenCalledTimes(1);
  });

  it('does not show the row when onViewTutorial is not provided', () => {
    render(<HelpSupportScreen role="provider" onBack={jest.fn()} />);

    expect(screen.queryByText('View tutorial')).toBeNull();
  });
});

describe('HelpSupportScreen — report a problem wording', () => {
  it('tells the homeowner to open the job, tap ⋮, then Report a problem', () => {
    render(<HelpSupportScreen role="homeowner" onBack={jest.fn()} />);

    expect(screen.getByText(/Open the job from My Jobs, tap ⋮, then Report a problem/)).toBeTruthy();
    expect(screen.queryByText(/File a Complaint/)).toBeNull();
  });
});
