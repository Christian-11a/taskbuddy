import React from 'react';
import { Modal, View } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TourProvider, useTour, useTourAnchor, type TourControls } from '../TourProvider';
import type { TourRect, TourStep } from '../types';

type MeasuredView = { props: { testID?: string } };

// Every test anchor is a View with testID `anchor-<id>`. `rects` says where each one sits; an id without a rect measures 0x0.
let rects: Record<string, TourRect> = {};
const measureSpy = (View.prototype as unknown as { measureInWindow: jest.Mock }).measureInWindow;

const RECT_A: TourRect = { x: 40, y: 120, width: 120, height: 48 };
const RECT_B: TourRect = { x: 200, y: 600, width: 96, height: 56 };

let controls: TourControls;
function Probe() {
  controls = useTour();
  return null;
}

function Anchor({ id }: { id: string }) {
  const anchor = useTourAnchor(id);
  return <View testID={`anchor-${id}`} ref={anchor.ref} onLayout={anchor.onLayout} />;
}

function renderTour(anchorIds: string[]) {
  return render(
    <TourProvider>
      <Probe />
      {anchorIds.map((id) => <Anchor key={id} id={id} />)}
    </TourProvider>,
  );
}

const step = (anchorId: string, title: string): TourStep => ({ anchorId, title, body: `${title} body` });

/** Measurement calls made for one anchor, counted from the recorded `this` of each call. */
const measuresOf = (id: string) => measureSpy.mock.contexts.filter((view: MeasuredView) => view.props.testID === `anchor-${id}`).length;

beforeEach(() => {
  rects = {};
  measureSpy.mockReset();
  measureSpy.mockImplementation(function (this: MeasuredView, callback: (...args: number[]) => void) {
    const rect = rects[(this.props.testID ?? '').replace('anchor-', '')];
    if (rect) callback(rect.x, rect.y, rect.width, rect.height);
    else callback(0, 0, 0, 0);
  });
});

describe('TourProvider', () => {
  it('shows nothing until a tour starts', () => {
    rects = { a: RECT_A };
    renderTour(['a']);

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(controls.isTourActive).toBe(false);
  });

  it('walks the steps with Next, finishes on Done, and calls onFinish once', async () => {
    rects = { a: RECT_A, b: RECT_B };
    renderTour(['a', 'b']);
    const onFinish = jest.fn();
    const onSkip = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First'), step('b', 'Second')], onFinish, onSkip }));
    expect(await screen.findByText('First')).toBeTruthy();
    expect(controls.isTourActive).toBe(true);

    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Second')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Second')).toBeNull();
    expect(controls.isTourActive).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('Skip tour ends the tour and calls onSkip only', async () => {
    rects = { a: RECT_A };
    renderTour(['a']);
    const onFinish = jest.fn();
    const onSkip = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish, onSkip }));
    fireEvent.press(await screen.findByRole('button', { name: 'Skip tour' }));

    expect(screen.queryByText('First')).toBeNull();
    expect(controls.isTourActive).toBe(false);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('a tap on the dimmed area moves to the next step', async () => {
    rects = { a: RECT_A, b: RECT_B };
    renderTour(['a', 'b']);
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First'), step('b', 'Second')], onFinish, onSkip: jest.fn() }));
    fireEvent.press(await screen.findByTestId('tour-dim'));

    expect(await screen.findByText('Second')).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('Android Back skips the tour', async () => {
    rects = { a: RECT_A };
    renderTour(['a']);
    const onSkip = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish: jest.fn(), onSkip }));
    expect(await screen.findByText('First')).toBeTruthy();
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(controls.isTourActive).toBe(false);
  });

  it('passes over a step whose anchor is not on screen, after the retries', async () => {
    rects = { a: RECT_A, c: RECT_B };
    renderTour(['a', 'c']);
    const onFinish = jest.fn();

    act(() => controls.startTour({
      steps: [step('a', 'First'), step('ghost', 'Hidden'), step('c', 'Third')], onFinish, onSkip: jest.fn(),
    }));
    fireEvent.press(await screen.findByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Third')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('finishes at once, with no card, when no step can be shown', async () => {
    renderTour([]);
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('ghost1', 'One'), step('ghost2', 'Two')], onFinish, onSkip: jest.fn() }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('One')).toBeNull();
    expect(controls.isTourActive).toBe(false);
  });

  it('retries a zero-size anchor five times, 6 measurements in all, and then passes it over', async () => {
    rects = { c: RECT_B };
    renderTour(['z', 'c']);

    act(() => controls.startTour({ steps: [step('z', 'Empty'), step('c', 'Shown')], onFinish: jest.fn(), onSkip: jest.fn() }));

    expect(await screen.findByText('Shown')).toBeTruthy();
    expect(measuresOf('z')).toBe(6);
    expect(screen.queryByText('Empty')).toBeNull();
  });

  it('measures the anchor again when its layout changes', async () => {
    rects = { a: RECT_A };
    renderTour(['a']);

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish: jest.fn(), onSkip: jest.fn() }));
    expect(await screen.findByText('First')).toBeTruthy();
    const before = measuresOf('a');

    await act(async () => {
      fireEvent(screen.getByTestId('anchor-a'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 1, height: 1 } } });
    });

    expect(measuresOf('a')).toBe(before + 1);
  });

  it('stopTour ends the tour without calling onFinish or onSkip', async () => {
    rects = { a: RECT_A };
    renderTour(['a']);
    const onFinish = jest.fn();
    const onSkip = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish, onSkip }));
    expect(await screen.findByText('First')).toBeTruthy();
    act(() => controls.stopTour());

    expect(screen.queryByText('First')).toBeNull();
    expect(controls.isTourActive).toBe(false);
    expect(onFinish).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('starting a tour while one runs replaces it without calling the old callbacks', async () => {
    rects = { a: RECT_A, b: RECT_B };
    renderTour(['a', 'b']);
    const oldFinish = jest.fn();
    const oldSkip = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'Old')], onFinish: oldFinish, onSkip: oldSkip }));
    expect(await screen.findByText('Old')).toBeTruthy();
    act(() => controls.startTour({ steps: [step('b', 'New')], onFinish: jest.fn(), onSkip: jest.fn() }));

    expect(await screen.findByText('New')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull();
    expect(oldFinish).not.toHaveBeenCalled();
    expect(oldSkip).not.toHaveBeenCalled();
  });

  it('an anchor that has unmounted is passed over', async () => {
    rects = { a: RECT_A, b: RECT_B };
    const { rerender } = renderTour(['a', 'b']);
    rerender(
      <TourProvider>
        <Probe />
        <Anchor id="b" />
      </TourProvider>,
    );
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'Gone'), step('b', 'Here')], onFinish, onSkip: jest.fn() }));

    expect(await screen.findByText('Here')).toBeTruthy();
    expect(screen.queryByText('Gone')).toBeNull();
  });

  it('a tour with no steps finishes at once', () => {
    renderTour([]);
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [], onFinish, onSkip: jest.fn() }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(controls.isTourActive).toBe(false);
  });
});

describe('useTour without a TourProvider', () => {
  it('startTour finishes at once, because there is no tour to show', () => {
    render(<Probe />);
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish, onSkip: jest.fn() }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(controls.isTourActive).toBe(false);
  });
});
