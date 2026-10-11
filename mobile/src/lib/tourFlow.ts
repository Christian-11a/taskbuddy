/**
 * tourFlow.ts: the welcome flow's decisions, kept free of React and storage so
 * the transitions can be tested as a table. The App does the side effects
 * (navigation, saving the flags, starting the tour); this only answers which
 * phase the flow is in.
 *
 * Phases: idle; waiting (the intro cards are done, the tour starts once Home is
 * on screen); touring (the spotlight tour is up); finishing (the finish card is
 * up). A first run and a replay take the same path. `firstRun` only decides
 * whether the finish card celebrates.
 */

/** How long after Home appears the tour starts, so its controls have laid out. */
export const TOUR_START_DELAY_MS = 400;

export type TourPhase = 'idle' | 'waiting' | 'touring' | 'finishing';

export type TourFlow = { phase: TourPhase; firstRun: boolean };

export type TourFlowEvent =
  /** The intro cards are done ("Show me around"). `firstRun` is false for a replay. */
  | { type: 'introDone'; firstRun: boolean }
  /** Home is on screen and the start delay has passed. */
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
 * Whether the "take a quick tour" card is offered: the account finished onboarding
 * before this session (so it is an existing account), has neither finished nor
 * skipped the tour, and has not dismissed the card.
 */
export function shouldOfferTour(flags: { onboardingDone: boolean; tourDone: boolean; offerDismissed: boolean }): boolean {
  return flags.onboardingDone && !flags.tourDone && !flags.offerDismissed;
}
