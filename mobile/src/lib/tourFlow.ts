/**
 * tourFlow.ts: the welcome flow's decisions, kept free of React and storage so
 * the transitions can be tested as a table. The App does the side effects
 * (navigation, saving the flags, starting the tour); this only answers which
 * phase the flow is in.
 *
 * Phases: idle; waiting (the intro cards are done, the tour starts once Home's
 * real content is up, or the wait runs out); touring (the spotlight tour is up);
 * finishing (the finish card is up). A first run and a replay take the same path.
 * `firstRun` only decides whether the finish card celebrates.
 */

import type { AnchorState } from '../components/tour/types';

/** From Home appearing, how long the tour waits for Home's real content before it starts regardless. */
export const TOUR_CONTENT_WAIT_MS = 4000;
/** How often the wait looks at Home's controls again while it waits. */
export const TOUR_CONTENT_POLL_MS = 200;

export type TourPhase = 'idle' | 'waiting' | 'touring' | 'finishing';

export type TourFlow = { phase: TourPhase; firstRun: boolean };

export type TourFlowEvent =
  /** The intro cards are done ("Show me around"). `firstRun` is false for a replay. */
  | { type: 'introDone'; firstRun: boolean }
  /** Home's real content is up, or the wait for it has run out. */
  | { type: 'homeReady' }
  /** The last spotlight step is done, or no step could be shown. */
  | { type: 'tourFinished' }
  /** The flow ended early (Skip, Android Back, sign-out): no finish card. */
  | { type: 'ended' }
  /** The finish card was closed by any of its actions. */
  | { type: 'finishClosed' };

export const idleTourFlow: TourFlow = { phase: 'idle', firstRun: false };

/** Returns the same object when the event does not apply, so callers can tell a real change from a no-op. */
export function nextTourFlow(state: TourFlow, event: TourFlowEvent): TourFlow {
  switch (event.type) {
    case 'introDone':
      // A tour already on screen is not restarted; any other state begins a fresh run.
      if (state.phase === 'touring' || state.phase === 'finishing') return state;
      return { phase: 'waiting', firstRun: event.firstRun };
    case 'homeReady':
      return state.phase === 'waiting' ? { ...state, phase: 'touring' } : state;
    case 'tourFinished':
      return state.phase === 'touring' ? { ...state, phase: 'finishing' } : state;
    case 'ended':
      return state.phase === 'idle' ? state : idleTourFlow;
    case 'finishClosed':
      return state.phase === 'finishing' ? idleTourFlow : state;
  }
}

/** True while the spotlight tour or its finish card is on screen. */
export function tourIsOnScreen(state: TourFlow): boolean {
  return state.phase === 'touring' || state.phase === 'finishing';
}

/**
 * Whether Home's real content is up, judged by the tour's steps in order: the first control that any
 * screen registers must be rendered. A Home still behind its loading skeleton holds its controls pending,
 * so the tour keeps waiting; controls no screen has are skipped, so an unverified provider is not held up.
 */
export function homeContentReady(states: readonly AnchorState[]): boolean {
  return states.find((state) => state !== 'absent') === 'rendered';
}

/** Whether the tour starts now: Home's content is up, or the wait has run its course. */
export function shouldStartTour(contentReady: boolean, waitedMs: number): boolean {
  return contentReady || waitedMs >= TOUR_CONTENT_WAIT_MS;
}

/**
 * Whether the "take a quick tour" card is offered: the account finished onboarding
 * before this session (so it is an existing account), has neither finished nor
 * skipped the tour, and has not dismissed the card.
 */
export function shouldOfferTour(flags: { onboardingDone: boolean; tourDone: boolean; offerDismissed: boolean }): boolean {
  return flags.onboardingDone && !flags.tourDone && !flags.offerDismissed;
}
