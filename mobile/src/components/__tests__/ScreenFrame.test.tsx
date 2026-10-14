import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import ScreenFrame from '../ScreenFrame';

// The frame reads the bottom inset from the safe area, so each case sets it.
const mockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return { ...actual, useSafeAreaInsets: () => mockInsets };
});

afterEach(() => {
  mockInsets.bottom = 0;
});

describe('ScreenFrame — the bottom inset', () => {
  it.each([[0], [24], [48]])('under a %i dp navigation bar, leaves a strip of that height under the content', (bottom) => {
    mockInsets.bottom = bottom;
    render(<ScreenFrame><Text>Content</Text></ScreenFrame>);

    const strip = screen.queryByTestId('screen-frame-inset');
    expect(strip ? strip.props.style.height : 0).toBe(bottom);
  });
});
