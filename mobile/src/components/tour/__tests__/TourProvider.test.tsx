import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
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

function Anchor({ id, enabled }: { id: string; enabled?: boolean }) {
  const anchor = useTourAnchor(id, enabled);
  return <View testID={`anchor-${id}`} ref={anchor.ref} onLayout={anchor.onLayout} />;
}

/** A control a screen has registered but has not rendered yet, like a Home still behind its skeleton. */
function GatedAnchor({ id, shown }: { id: string; shown: boolean }) {
  const anchor = useTourAnchor(id);
  return shown ? <View testID={`anchor-${id}`} ref={anchor.ref} onLayout={anchor.onLayout} /> : null;
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

/** Runs the fake timers for `ms`, so the frames and retries that fall in that span happen. Promise callbacks run in the same act. */
async function pump(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  rects = {};
  measureSpy.mockReset();
  measureSpy.mockImplementation(function (this: MeasuredView, callback: (...args: number[]) => void) {
    const rect = rects[(this.props.testID ?? '').replace('anchor-', '')];
    if (rect) callback(rect.x, rect.y, rect.width, rect.height);
    else callback(0, 0, 0, 0);
  });
});

afterEach(() => {
  jest.useRealTimers();
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

  it('passes over a step whose control no screen has, at once, without the 3 s wait', async () => {
    jest.useFakeTimers();
    rects = { a: RECT_A, c: RECT_B };
    renderTour(['a', 'c']);
    const onFinish = jest.fn();

    act(() => controls.startTour({
      steps: [step('a', 'First'), step('ghost', 'Hidden'), step('c', 'Third')], onFinish, onSkip: jest.fn(),
    }));
    await pump(16);
    expect(screen.getByText('First')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    // The ghost is passed over on its frame and the third step is measured on the next one: 32 ms in all.
    await pump(16);
    await pump(16);

    expect(screen.getByText('Third')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('passes over a control that is switched off at once, because no screen registers it', async () => {
    jest.useFakeTimers();
    rects = { a: RECT_A, c: RECT_B };
    render(
      <TourProvider>
        <Probe />
        <Anchor id="a" />
        <Anchor id="off" enabled={false} />
        <Anchor id="c" />
      </TourProvider>,
    );

    act(() => controls.startTour({
      steps: [step('a', 'First'), step('off', 'Hidden'), step('c', 'Third')], onFinish: jest.fn(), onSkip: jest.fn(),
    }));
    await pump(16);
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await pump(16);
    await pump(16);

    expect(screen.getByText('Third')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(controls.anchorState('off')).toBe('absent');
  });

  it('keeps waiting for a control that is registered but not rendered yet, and shows it once it appears', async () => {
    jest.useFakeTimers();
    rects = { late: RECT_A };
    const { rerender } = render(
      <TourProvider>
        <Probe />
        <GatedAnchor id="late" shown={false} />
      </TourProvider>,
    );
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('late', 'Late')], onFinish, onSkip: jest.fn() }));
    await pump(1000);
    expect(screen.queryByText('Late')).toBeNull();
    expect(onFinish).not.toHaveBeenCalled();

    rerender(
      <TourProvider>
        <Probe />
        <GatedAnchor id="late" shown />
      </TourProvider>,
    );
    await pump(200);

    expect(screen.getByText('Late')).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('shows a control that lays out after 1.5 s of waiting, and not before', async () => {
    jest.useFakeTimers();
    rects = {};
    renderTour(['z']);

    act(() => controls.startTour({ steps: [step('z', 'Late layout')], onFinish: jest.fn(), onSkip: jest.fn() }));
    await pump(1500);
    expect(screen.queryByText('Late layout')).toBeNull();

    rects = { z: RECT_A };
    await pump(200);
    expect(screen.getByText('Late layout')).toBeTruthy();
  });

  it('measures the first control on the next frame, once the layout it points at has settled', async () => {
    jest.useFakeTimers();
    rects = { a: RECT_A };
    renderTour(['a']);

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish: jest.fn(), onSkip: jest.fn() }));
    expect(measuresOf('a')).toBe(0);

    await pump(16);
    expect(measuresOf('a')).toBe(1);
    expect(screen.getByText('First')).toBeTruthy();
  });

  it('tells a control no screen has (absent), one registered but not rendered (pending) and one rendered', () => {
    rects = { gated: RECT_A };
    const { rerender } = render(
      <TourProvider>
        <Probe />
        <GatedAnchor id="gated" shown={false} />
      </TourProvider>,
    );
    expect(controls.anchorState('gated')).toBe('pending');
    expect(controls.anchorState('nowhere')).toBe('absent');

    rerender(
      <TourProvider>
        <Probe />
        <GatedAnchor id="gated" shown />
      </TourProvider>,
    );
    expect(controls.anchorState('gated')).toBe('rendered');
  });

  it('finishes at once, with no card, when no step can be shown', async () => {
    renderTour([]);
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('ghost1', 'One'), step('ghost2', 'Two')], onFinish, onSkip: jest.fn() }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('One')).toBeNull();
    expect(controls.isTourActive).toBe(false);
  });

  it('retries a zero-size anchor for 3 s (31 measurements in all), then passes it over', async () => {
    jest.useFakeTimers();
    rects = { c: RECT_B };
    renderTour(['z', 'c']);

    act(() => controls.startTour({ steps: [step('z', 'Empty'), step('c', 'Shown')], onFinish: jest.fn(), onSkip: jest.fn() }));
    await pump(2900);
    expect(measuresOf('z')).toBe(30);
    expect(screen.queryByText('Shown')).toBeNull();

    // The 31st measurement lands at 3 s, finds it still 0x0, and the step is passed over.
    await pump(100);
    await pump(16);

    expect(measuresOf('z')).toBe(31);
    expect(screen.getByText('Shown')).toBeTruthy();
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

    // The new measurement waits for the next frame, so it is awaited rather than read straight away.
    await waitFor(() => expect(measuresOf('a')).toBe(before + 1));
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

  it('reports every control as rendered, because nothing is measured and so nothing is waited for', () => {
    render(<Probe />);

    expect(controls.anchorState('home.post')).toBe('rendered');
  });
});

describe('TourProvider — the tour blocks touches and Back from the moment it starts', () => {
  it('shows the Modal while the first control is measured, with no dim and no card yet', async () => {
    jest.useFakeTimers();
    rects = {};
    renderTour(['a']);

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish: jest.fn(), onSkip: jest.fn() }));
    await pump(16);

    expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(screen.getByTestId('tour-blocker')).toBeTruthy();
    expect(screen.queryByTestId('tour-dim')).toBeNull();
    expect(screen.queryByTestId('tour-card')).toBeNull();
    expect(screen.queryByText('First')).toBeNull();
  });

  it('covers the whole window with the blocker while measuring, and a tap on it moves nothing on', async () => {
    jest.useFakeTimers();
    rects = {};
    renderTour(['a']);
    const onFinish = jest.fn();
    const onSkip = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First'), step('b', 'Second')], onFinish, onSkip }));
    await pump(16);
    expect(StyleSheet.flatten(screen.getByTestId('tour-blocker').props.style)).toMatchObject({
      position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    });

    fireEvent.press(screen.getByTestId('tour-blocker'));
    await pump(50);

    expect(controls.isTourActive).toBe(true);
    expect(onFinish).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.queryByText('Second')).toBeNull();
  });

  it('then shows the dim and the card once the control is measured, and the blocker goes', async () => {
    jest.useFakeTimers();
    rects = {};
    renderTour(['a']);

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish: jest.fn(), onSkip: jest.fn() }));
    await pump(16);
    expect(screen.queryByText('First')).toBeNull();

    rects = { a: RECT_A };
    await pump(200);

    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByTestId('tour-dim')).toBeTruthy();
    expect(screen.queryByTestId('tour-blocker')).toBeNull();
  });

  it('Android Back skips a tour that is still measuring its first control', async () => {
    jest.useFakeTimers();
    rects = {};
    renderTour(['a']);
    const onSkip = jest.fn();
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('a', 'First')], onFinish, onSkip }));
    await pump(16);
    fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
    expect(controls.isTourActive).toBe(false);
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
  });

  it('a tour whose every step is skipped finishes at once, and its Modal goes with it', async () => {
    renderTour([]);
    const onFinish = jest.fn();

    act(() => controls.startTour({ steps: [step('ghost1', 'One'), step('ghost2', 'Two')], onFinish, onSkip: jest.fn() }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(controls.isTourActive).toBe(false);
    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
  });
});
