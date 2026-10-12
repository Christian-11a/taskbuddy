import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import Confetti, { createSeededRandom, makeConfettiPieces } from '../Confetti';

const reanimated = require('react-native-reanimated') as {
  useReducedMotion: () => boolean;
  withTiming: (...args: unknown[]) => unknown;
};
const worklets = require('react-native-worklets') as {
  scheduleOnRN: (fun: (...args: unknown[]) => void, ...args: unknown[]) => void;
};

const COLORS = ['#111111', '#222222', '#333333'];
const AREA = { width: 390, height: 844 };

afterEach(() => {
  jest.restoreAllMocks();
});

describe('makeConfettiPieces', () => {
  it('makes 30 pieces by default', () => {
    expect(makeConfettiPieces({ ...AREA, colors: COLORS, random: createSeededRandom(1) })).toHaveLength(30);
  });

  it('is repeatable for a given seed, and differs between seeds', () => {
    const first = makeConfettiPieces({ ...AREA, colors: COLORS, random: createSeededRandom(7) });
    const again = makeConfettiPieces({ ...AREA, colors: COLORS, random: createSeededRandom(7) });
    const other = makeConfettiPieces({ ...AREA, colors: COLORS, random: createSeededRandom(8) });

    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('keeps every piece inside the burst area: starts in the top fifth, falls through the screen, spins, and drifts a little', () => {
    const pieces = makeConfettiPieces({ ...AREA, colors: COLORS, random: createSeededRandom(3) });

    for (const piece of pieces) {
      expect(piece.x).toBeGreaterThanOrEqual(0);
      expect(piece.x).toBeLessThanOrEqual(AREA.width);
      expect(piece.y).toBeGreaterThanOrEqual(0);
      expect(piece.y).toBeLessThanOrEqual(AREA.height * 0.2);
      expect(piece.fall).toBeGreaterThanOrEqual(AREA.height * 0.4);
      expect(piece.fall).toBeLessThanOrEqual(AREA.height * 0.75);
      expect(Math.abs(piece.drift)).toBeLessThanOrEqual(AREA.width * 0.12);
      expect(Math.abs(piece.spin)).toBeLessThanOrEqual(540);
      expect(piece.size).toBeGreaterThanOrEqual(6);
      expect(piece.size).toBeLessThanOrEqual(10);
      expect(piece.delay).toBeGreaterThanOrEqual(0);
      expect(piece.delay).toBeLessThanOrEqual(0.2);
    }
  });

  it('uses only the colours it was given', () => {
    const pieces = makeConfettiPieces({ ...AREA, colors: COLORS, random: createSeededRandom(5) });

    expect(new Set(pieces.map((piece) => piece.color))).toEqual(new Set(COLORS));
  });

  it('mixes round and square pieces', () => {
    const pieces = makeConfettiPieces({ ...AREA, colors: COLORS, random: createSeededRandom(9) });

    expect(pieces.some((piece) => piece.round)).toBe(true);
    expect(pieces.some((piece) => !piece.round)).toBe(true);
  });
});

describe('Confetti', () => {
  it('draws nothing while it is not active', () => {
    render(<Confetti active={false} />);

    expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
  });

  it('draws 30 pieces over the whole screen, ignoring touches', () => {
    render(<Confetti active />);

    expect(screen.getAllByTestId('confetti-piece')).toHaveLength(30);
    const layer = screen.getByTestId('confetti-layer');
    expect(layer.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(layer.props.style)).toMatchObject({ position: 'absolute', top: 0, left: 0 });
  });

  it('runs the burst for about 1.4 seconds, then reports it is done', async () => {
    const withTiming = jest.spyOn(reanimated, 'withTiming');
    const onDone = jest.fn();

    render(<Confetti active onDone={onDone} />);

    expect(withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 1400 }), expect.any(Function));
    // The Worklets mock hands the callback back to JS on a microtask, so wait for it.
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('hands scheduleOnRN the same RN-side onDone on every completion, not a new closure each time', () => {
    // The Worklets mock would run the scheduled function at once, so stub it and run it by hand.
    const scheduleOnRN = jest.spyOn(worklets, 'scheduleOnRN').mockImplementation(() => undefined);
    // This stub skips the timing callback, so the test runs each burst's completion, as the UI thread would.
    const withTiming = jest.spyOn(reanimated, 'withTiming').mockImplementation((toValue) => toValue);
    const onDone = jest.fn();

    const { rerender } = render(<Confetti active onDone={onDone} />);
    (withTiming.mock.calls[0][2] as (finished: boolean) => void)(true);
    rerender(<Confetti active={false} onDone={onDone} />);
    rerender(<Confetti active onDone={onDone} />);
    (withTiming.mock.calls[1][2] as (finished: boolean) => void)(true);

    expect(scheduleOnRN).toHaveBeenCalledTimes(2);
    const [first] = scheduleOnRN.mock.calls[0];
    const [second] = scheduleOnRN.mock.calls[1];
    expect(second).toBe(first);

    expect(onDone).not.toHaveBeenCalled();
    first();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('under reduced motion draws nothing and reports done at once', () => {
    jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    const onDone = jest.fn();

    render(<Confetti active onDone={onDone} />);

    expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
