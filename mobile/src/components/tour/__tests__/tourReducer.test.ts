import { initialTourState, tourReducer, type TourAction, type TourState } from '../tourReducer';

const idle: TourState = { status: 'idle', stepIndex: 0, total: 0 };
const running = (stepIndex: number, total: number): TourState => ({ status: 'running', stepIndex, total });

describe('tourReducer', () => {
  it('starts idle with no steps', () => {
    expect(initialTourState).toEqual(idle);
  });

  it.each<[string, TourState, TourAction, TourState]>([
    ['start runs the tour from its first step', idle, { type: 'start', total: 3 }, running(0, 3)],
    ['start with no steps leaves the tour idle', idle, { type: 'start', total: 0 }, idle],
    ['next moves to the following step', running(0, 3), { type: 'next' }, running(1, 3)],
    ['next on the last step ends the tour', running(2, 3), { type: 'next' }, idle],
    ['next on a one-step tour ends it at once', running(0, 1), { type: 'next' }, idle],
    ['anchorMissing moves past the step that could not be shown', running(0, 3), { type: 'anchorMissing' }, running(1, 3)],
    ['anchorMissing on the last step ends the tour', running(2, 3), { type: 'anchorMissing' }, idle],
    ['skip ends the tour from any step', running(1, 3), { type: 'skip' }, idle],
    ['start while running restarts from the first step', running(2, 3), { type: 'start', total: 2 }, running(0, 2)],
    ['next while idle changes nothing', idle, { type: 'next' }, idle],
    ['anchorMissing while idle changes nothing', idle, { type: 'anchorMissing' }, idle],
    ['skip while idle changes nothing', idle, { type: 'skip' }, idle],
  ])('%s', (_name, from, action, expected) => {
    expect(tourReducer(from, action)).toEqual(expected);
  });

  it('returns the same object when nothing changes, so callers can tell a no-op', () => {
    expect(tourReducer(idle, { type: 'next' })).toBe(idle);
    expect(tourReducer(idle, { type: 'skip' })).toBe(idle);
  });

  it('walks a four-step tour whose second step cannot be shown', () => {
    let state = tourReducer(idle, { type: 'start', total: 4 });
    expect(state).toEqual(running(0, 4));

    state = tourReducer(state, { type: 'next' });
    expect(state).toEqual(running(1, 4));

    state = tourReducer(state, { type: 'anchorMissing' });
    expect(state).toEqual(running(2, 4));

    state = tourReducer(state, { type: 'next' });
    expect(state).toEqual(running(3, 4));

    state = tourReducer(state, { type: 'next' });
    expect(state).toEqual(idle);
  });
});
