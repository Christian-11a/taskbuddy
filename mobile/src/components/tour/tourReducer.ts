/**
 * The tour's step state machine, kept free of React and native code so the
 * transitions can be tested as a table. The provider does the side effects
 * (measuring, callbacks); this only answers "which step, or is it over".
 */

export type TourState = {
  status: 'idle' | 'running';
  /** Index into the running tour's steps. */
  stepIndex: number;
  /** Number of steps in the running tour; 0 while idle. */
  total: number;
};

export type TourAction =
  | { type: 'start'; total: number }
  /** The user moved on (Next, or a tap on the dimmed area). */
  | { type: 'next' }
  /** The user skipped (Skip tour, Android Back). */
  | { type: 'skip' }
  /** The current step's anchor could not be measured, so it is passed over. */
  | { type: 'anchorMissing' }
  /** The current step's anchor is gone and the step is removed from the list, so the count stays true: the next step takes its place. */
  | { type: 'drop' };

export const initialTourState: TourState = { status: 'idle', stepIndex: 0, total: 0 };

const IDLE = initialTourState;

/**
 * Returns the same object when an action changes nothing (for example `next`
 * while idle), so callers can tell a real transition from a no-op.
 */
export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'start':
      return action.total > 0 ? { status: 'running', stepIndex: 0, total: action.total } : IDLE;
    case 'next':
    case 'anchorMissing': {
      if (state.status !== 'running') return state;
      const stepIndex = state.stepIndex + 1;
      return stepIndex < state.total ? { ...state, stepIndex } : IDLE;
    }
    case 'drop': {
      if (state.status !== 'running') return state;
      const total = state.total - 1;
      return state.stepIndex < total ? { ...state, total } : IDLE;
    }
    case 'skip':
      return state.status === 'running' ? IDLE : state;
    default:
      return state;
  }
}
