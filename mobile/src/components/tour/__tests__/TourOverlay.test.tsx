import React from 'react';
import { Dimensions, Modal, StyleSheet } from 'react-native';
import { Path } from 'react-native-svg';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as ThemeContext from '../../../context/ThemeContext';
import { darkPalette } from '../../../constants/palettes';
import TourOverlay, { dimPath } from '../TourOverlay';

const reanimated = require('react-native-reanimated') as { useReducedMotion: () => boolean };

const STEP = { anchorId: 'home.post', title: 'Start here', body: 'Pick a service and describe the job.' };
const HOLE = { x: 100, y: 200, width: 200, height: 48 };

function renderOverlay(props: Partial<React.ComponentProps<typeof TourOverlay>> = {}) {
  const onNext = jest.fn();
  const onSkip = jest.fn();
  render(<TourOverlay step={STEP} index={1} total={4} hole={HOLE} onNext={onNext} onSkip={onSkip} {...props} />);
  return { onNext, onSkip };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TourOverlay card', () => {
  it('shows the step title and body, and one dot per step with the current one wider', () => {
    renderOverlay();

    expect(screen.getByText('Start here')).toBeTruthy();
    expect(screen.getByText('Pick a service and describe the job.')).toBeTruthy();
    const dots = screen.getAllByTestId('tour-dot');
    expect(dots).toHaveLength(4);
    expect(dots.map((dot) => StyleSheet.flatten(dot.props.style).width)).toEqual([8, 24, 8, 8]);
  });

  it('labels the card for screen readers with the step number, title and body', () => {
    renderOverlay();

    expect(screen.getByLabelText('Step 2 of 4. Start here. Pick a service and describe the job.')).toBeTruthy();
  });

  it('offers Next and Skip tour, and the Skip target reaches 48 dp', () => {
    renderOverlay();

    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip tour' }).props.hitSlop).toEqual({ top: 15, bottom: 15, left: 8, right: 8 });
  });

  it('says Done instead of Next on the last step', () => {
    renderOverlay({ index: 3, total: 4 });

    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('lets text grow to 1.3 times its size and no further', () => {
    renderOverlay();

    expect(screen.getByText('Start here').props.maxFontSizeMultiplier).toBe(1.3);
    expect(screen.getByText('Pick a service and describe the job.').props.maxFontSizeMultiplier).toBe(1.3);
  });

  it('shows the hint under the card', () => {
    renderOverlay();

    // The hint has pointerEvents="none" (taps pass through it to the dim layer), which RNTL's queries skip by default.
    expect(screen.getByText('Tap anywhere to continue', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps the card hidden until its height is known, then shows it', () => {
    renderOverlay();
    const card = screen.getByTestId('tour-card');
    expect(StyleSheet.flatten(card.props.style).opacity).toBe(0);

    fireEvent(card, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 180 } } });

    expect(StyleSheet.flatten(screen.getByTestId('tour-card').props.style).opacity).toBe(1);
  });
});

describe('TourOverlay input', () => {
  it('moves on when the dimmed area is tapped, and when Next is pressed', () => {
    const { onNext } = renderOverlay();

    fireEvent.press(screen.getByTestId('tour-dim'));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));

    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it('calls onSkip for Skip tour, and never onNext', () => {
    const { onNext, onSkip } = renderOverlay();

    fireEvent.press(screen.getByRole('button', { name: 'Skip tour' }));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('treats Android Back as Skip tour', () => {
    const { onNext, onSkip } = renderOverlay();

    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('TourOverlay spotlight', () => {
  it('cuts a rounded hole 8 px larger than the anchor, using the even-odd rule', () => {
    renderOverlay();
    const { width, height } = Dimensions.get('window');

    const path = screen.UNSAFE_getByType(Path);
    expect(path.props.fillRule).toBe('evenodd');
    expect(path.props.animatedProps.d).toBe(dimPath(92, 192, 216, 64, width, height, 14));
  });

  it('dims with the light scrim in light mode', () => {
    renderOverlay();
    expect(screen.UNSAFE_getByType(Path).props.fill).toBe('rgba(15,23,42,0.72)');
  });

  it('uses the dark scrim in dark mode', () => {
    jest.spyOn(ThemeContext, 'useTheme').mockReturnValue({
      palette: darkPalette, dark: true, error: null, setDark: jest.fn(),
    });
    renderOverlay();

    expect(screen.UNSAFE_getByType(Path).props.fill).toBe('rgba(0,0,0,0.8)');
  });

  it('pulses a ring around the spotlight', () => {
    renderOverlay();

    expect(screen.getByTestId('tour-ring')).toBeTruthy();
  });

  it('drops the ring under reduced motion', () => {
    jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    renderOverlay();

    expect(screen.queryByTestId('tour-ring')).toBeNull();
  });

  it('fades in as a Modal that covers the status bar and navigation bar', () => {
    renderOverlay();

    const modal = screen.UNSAFE_getByType(Modal);
    expect(modal.props).toEqual(expect.objectContaining({
      transparent: true, statusBarTranslucent: true, navigationBarTranslucent: true, animationType: 'none',
    }));
  });
});

describe('dimPath', () => {
  it('draws the window and a rounded rectangle, which the even-odd rule leaves unfilled', () => {
    expect(dimPath(10, 20, 100, 40, 375, 812, 14)).toBe(
      'M0 0H375V812H0Z'
      + 'M24 20H96A14 14 0 0 1 110 34V46A14 14 0 0 1 96 60H24A14 14 0 0 1 10 46V34A14 14 0 0 1 24 20Z',
    );
  });

  it('shrinks the corner radius when the hole is too small for it', () => {
    expect(dimPath(0, 0, 10, 10, 100, 100, 14)).toContain('M5 0H5A5 5 0 0 1 10 5V5A5 5 0 0 1 5 10H5A5 5 0 0 1 0 5V5A5 5 0 0 1 5 0Z');
  });
});
