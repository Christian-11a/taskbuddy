import React from 'react';
import { render, screen } from '@testing-library/react-native';
import RefreshBar from '../RefreshBar';

describe('RefreshBar', () => {
  it('is a thin, non-interactive line that says the screen is refreshing', () => {
    render(<RefreshBar />);

    const bar = screen.getByTestId('refresh-bar');
    expect(bar.props.accessibilityLabel).toBe('Refreshing');
    expect(bar.props.pointerEvents).toBe('none');
  });
});
