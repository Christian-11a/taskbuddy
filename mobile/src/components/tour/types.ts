/** One spotlight step: the control it points at and the card text beside it. */
export type TourStep = { anchorId: string; title: string; body: string };

/** What a caller hands over to start a tour. `onFinish` runs when the last step is done (or no step could be shown), `onSkip` when the user skips. */
export type TourOptions = { steps: TourStep[]; onFinish: () => void; onSkip: () => void };

/** A rectangle in window coordinates, as `measureInWindow` reports it. */
export type TourRect = { x: number; y: number; width: number; height: number };

/**
 * How a step's control stands: `absent` when no screen registers it (a provider's controls before
 * verification), `pending` when a screen registers it but has not rendered it yet (Home behind its
 * skeleton), and `rendered` when it is on screen.
 */
export type AnchorState = 'absent' | 'pending' | 'rendered';
