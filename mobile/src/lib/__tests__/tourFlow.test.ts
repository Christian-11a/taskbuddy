import { idleTourFlow, nextTourFlow, shouldOfferTour, tourIsOnScreen, type TourFlow, type TourFlowEvent } from '../tourFlow';

const idle: TourFlow = { phase: 'idle', firstRun: false };
const waiting = (firstRun: boolean): TourFlow => ({ phase: 'waiting', firstRun });
const touring = (firstRun: boolean): TourFlow => ({ phase: 'touring', firstRun });
const finishing = (firstRun: boolean): TourFlow => ({ phase: 'finishing', firstRun });

describe('nextTourFlow — the happy path', () => {
  it('a finished intro waits for Home, remembering whether this is a first run', () => {
    expect(nextTourFlow(idle, { type: 'introDone', firstRun: true })).toEqual(waiting(true));
    expect(nextTourFlow(idle, { type: 'introDone', firstRun: false })).toEqual(waiting(false));
  });

  it('a waiting flow starts touring once Home is ready, keeping the first-run flag', () => {
    expect(nextTourFlow(waiting(true), { type: 'homeReady' })).toEqual(touring(true));
    expect(nextTourFlow(waiting(false), { type: 'homeReady' })).toEqual(touring(false));
  });

  it('a finished tour shows the finish card, keeping the first-run flag', () => {
    expect(nextTourFlow(touring(true), { type: 'tourFinished' })).toEqual(finishing(true));
    expect(nextTourFlow(touring(false), { type: 'tourFinished' })).toEqual(finishing(false));
  });

  it('closing the finish card returns the flow to idle', () => {
    expect(nextTourFlow(finishing(true), { type: 'finishClosed' })).toEqual(idleTourFlow);
    expect(nextTourFlow(finishing(false), { type: 'finishClosed' })).toEqual(idleTourFlow);
  });
});

describe('nextTourFlow — leaving early', () => {
  it.each([
    ['waiting', waiting(true)],
    ['touring', touring(true)],
    ['finishing', finishing(false)],
  ] as const)('ending the flow while %s returns to idle, with no finish card', (_name, state) => {
    expect(nextTourFlow(state, { type: 'ended' })).toEqual(idleTourFlow);
  });
});

describe('nextTourFlow — events that do not apply are no-ops', () => {
  const cases: Array<[string, TourFlow, TourFlowEvent]> = [
    ['homeReady while idle', idle, { type: 'homeReady' }],
    ['homeReady while touring', touring(true), { type: 'homeReady' }],
    ['tourFinished while idle', idle, { type: 'tourFinished' }],
    ['tourFinished while waiting', waiting(true), { type: 'tourFinished' }],
    ['finishClosed while idle', idle, { type: 'finishClosed' }],
    ['finishClosed while touring', touring(true), { type: 'finishClosed' }],
    ['ended while idle', idle, { type: 'ended' }],
    ['introDone while touring', touring(false), { type: 'introDone', firstRun: true }],
    ['introDone while finishing', finishing(false), { type: 'introDone', firstRun: true }],
  ];

  it.each(cases)('%s leaves the state as it was', (_name, state, event) => {
    expect(nextTourFlow(state, event)).toBe(state);
  });
});

describe('nextTourFlow — a replay after a stale wait', () => {
  it('a replay intro starts a fresh run even when an earlier run was still waiting for Home', () => {
    expect(nextTourFlow(waiting(true), { type: 'introDone', firstRun: false })).toEqual(waiting(false));
  });
});

describe('tourIsOnScreen', () => {
  it.each([
    ['idle', idleTourFlow, false],
    ['waiting', waiting(true), false],
    ['touring', touring(true), true],
    ['finishing', finishing(false), true],
  ] as const)('is true only while the tour or its finish card is up (%s)', (_name, state, expected) => {
    expect(tourIsOnScreen(state)).toBe(expected);
  });
});

describe('shouldOfferTour', () => {
  it.each([
    // onboarding done, tour not done, card not dismissed: an existing account gets the card once.
    [true, false, false, true],
    // A brand-new account has not finished onboarding yet, so the first run handles it instead.
    [false, false, false, false],
    // Already finished the tour: never offered again.
    [true, true, false, false],
    // Dismissed the card: never offered again.
    [true, false, true, false],
    [true, true, true, false],
  ])('onboarding done %s, tour done %s, card dismissed %s → offered %s', (onboardingDone, tourDone, offerDismissed, expected) => {
    expect(shouldOfferTour({ onboardingDone, tourDone, offerDismissed })).toBe(expected);
  });
});
