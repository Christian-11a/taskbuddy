/**
 * TourProvider.tsx: the guided tour's runtime. Anchors (the controls a step
 * points at) register themselves here; `startTour` measures each step's anchor
 * and shows it in the TourOverlay, passing over any step that cannot be shown.
 * Mount it above the screens, so a tour can cover any of them.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import TourOverlay from './TourOverlay';
import { initialTourState, tourReducer, type TourAction, type TourState } from './tourReducer';
import type { TourOptions, TourRect } from './types';

/** A step's anchor is measured up to 6 times (1 try + 5 retries, 60 ms apart) before it is passed over. */
const MEASURE_RETRIES = 5;
const MEASURE_RETRY_MS = 60;

type AnchorRef = RefObject<View | null>;

export type TourAnchor = { ref: AnchorRef; onLayout: () => void };

export type TourControls = {
  startTour: (options: TourOptions) => void;
  /** Ends the tour quietly: neither onFinish nor onSkip runs. */
  stopTour: () => void;
  isTourActive: boolean;
};

type AnchorRegistry = {
  register: (anchorId: string, ref: AnchorRef) => () => void;
  layout: (anchorId: string) => void;
};

// Without a provider there is no registry, so anchors register nothing and their refs stay empty.
const AnchorContext = createContext<AnchorRegistry | null>(null);

const TourContext = createContext<TourControls>({
  // No provider mounted, so there is no tour to show: it counts as finished at once.
  startTour: (options) => options.onFinish(),
  stopTour: () => {},
  isTourActive: false,
});

/**
 * Reads an anchor's rectangle. A view that is not laid out yet reports 0x0,
 * and a view that is not mounted yet is missing, so both are retried; after
 * the last retry the result is null and the step is passed over.
 */
function measureAnchor(getView: () => View | null): Promise<TourRect | null> {
  return new Promise((resolve) => {
    let retries = 0;
    const attempt = () => {
      const view = getView();
      if (!view) {
        retry();
        return;
      }
      view.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) resolve({ x, y, width, height });
        else retry();
      });
    };
    const retry = () => {
      if (retries >= MEASURE_RETRIES) {
        resolve(null);
        return;
      }
      retries += 1;
      setTimeout(attempt, MEASURE_RETRY_MS);
    };
    attempt();
  });
}

const sameRect = (a: TourRect | null, b: TourRect) => (
  !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [anchors] = useState(() => new Map<string, AnchorRef>());
  const [tour, setTour] = useState<TourState>(initialTourState);
  const [options, setOptions] = useState<TourOptions | null>(null);
  const [hole, setHole] = useState<TourRect | null>(null);

  // The measuring and the callbacks read these refs, so they always see the latest tour.
  const tourRef = useRef<TourState>(initialTourState);
  const optionsRef = useRef<TourOptions | null>(null);
  // Bumped whenever the shown step changes or the tour ends, which drops any measurement still in flight.
  const tokenRef = useRef(0);

  const apply = (action: TourAction): TourState => {
    const before = tourRef.current;
    const after = tourReducer(before, action);
    if (after !== before) {
      tourRef.current = after;
      setTour(after);
    }
    return after;
  };

  // Clears what is on screen. Only a finish or a skip reaches the caller; a stop is silent.
  const end = (reason: 'finished' | 'skipped' | 'stopped') => {
    const finished = optionsRef.current;
    optionsRef.current = null;
    tokenRef.current += 1;
    setOptions(null);
    setHole(null);
    if (reason === 'finished') finished?.onFinish();
    if (reason === 'skipped') finished?.onSkip();
  };

  const showStep = (index: number) => {
    const current = optionsRef.current;
    if (!current) return;
    const token = ++tokenRef.current;
    const anchorId = current.steps[index].anchorId;
    measureAnchor(() => anchors.get(anchorId)?.current ?? null).then((rect) => {
      if (token !== tokenRef.current) return;
      if (rect) setHole((previous) => (sameRect(previous, rect) ? previous : rect));
      else moveOn('anchorMissing');
    });
  };

  // Next, or a step passed over, moves to the following step, or finishes after the last one.
  const moveOn = (action: 'next' | 'anchorMissing') => {
    if (tourRef.current.status !== 'running') return;
    const after = apply({ type: action });
    if (after.status === 'running') showStep(after.stepIndex);
    else end('finished');
  };

  const skipTour = () => {
    if (tourRef.current.status !== 'running') return;
    apply({ type: 'skip' });
    end('skipped');
  };

  const stopTour = () => {
    if (tourRef.current.status !== 'running') return;
    apply({ type: 'skip' });
    end('stopped');
  };

  const startTour = (next: TourOptions) => {
    stopTour();
    if (next.steps.length === 0) {
      next.onFinish();
      return;
    }
    optionsRef.current = next;
    setOptions(next);
    apply({ type: 'start', total: next.steps.length });
    showStep(0);
  };

  // An anchor whose layout changed is measured again, if it is the step on screen.
  const layout = (anchorId: string) => {
    const current = tourRef.current;
    if (current.status !== 'running' || optionsRef.current?.steps[current.stepIndex]?.anchorId !== anchorId) return;
    showStep(current.stepIndex);
  };

  // Rotation or a keyboard change moves the anchors, so the shown step is measured again.
  // showStep reads only refs and state setters, so the render it came from is safe to keep.
  useEffect(() => {
    if (tourRef.current.status === 'running') showStep(tourRef.current.stepIndex);
  }, [width, height]);

  // Measurements still in flight must not land after unmount.
  useEffect(() => () => { tokenRef.current += 1; }, []);

  const [registry] = useState<AnchorRegistry>(() => ({
    register: (anchorId, ref) => {
      anchors.set(anchorId, ref);
      return () => {
        if (anchors.get(anchorId) === ref) anchors.delete(anchorId);
      };
    },
    layout: (anchorId) => layout(anchorId),
  }));

  const isTourActive = tour.status === 'running';
  const controls = useMemo<TourControls>(() => ({ startTour, stopTour, isTourActive }), [isTourActive]);

  const step = isTourActive ? options?.steps[tour.stepIndex] : undefined;
  return (
    <AnchorContext.Provider value={registry}>
      <TourContext.Provider value={controls}>
        {children}
        {step && hole ? (
          <TourOverlay
            step={step}
            index={tour.stepIndex}
            total={tour.total}
            hole={hole}
            onNext={() => moveOn('next')}
            onSkip={skipTour}
          />
        ) : null}
      </TourContext.Provider>
    </AnchorContext.Provider>
  );
}

/** Start, stop and watch the tour. Outside a TourProvider, starting a tour finishes it at once. */
export function useTour(): TourControls {
  return useContext(TourContext);
}

/**
 * Marks a control as a tour anchor. Spread the result on the control:
 * `<Tap {...anchor} />` or `<View ref={anchor.ref} onLayout={anchor.onLayout} />`.
 * Outside a TourProvider the ref is never registered and nothing changes.
 */
export function useTourAnchor(anchorId: string): TourAnchor {
  const registry = useContext(AnchorContext);
  const ref = useRef<View | null>(null);
  useEffect(() => (registry ? registry.register(anchorId, ref) : undefined), [registry, anchorId]);
  const onLayout = useCallback(() => registry?.layout(anchorId), [registry, anchorId]);
  return useMemo(() => ({ ref, onLayout }), [onLayout]);
}
