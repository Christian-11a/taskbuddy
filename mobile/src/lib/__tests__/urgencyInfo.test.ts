import { MATCH_WINDOW_MIN, URGENT_PERKS, urgencyTiming } from '../urgencyInfo';

describe('urgencyInfo', () => {
  it('matches the backend matching windows (urgent 5 / normal 10 / flexible 15 min)', () => {
    expect(MATCH_WINDOW_MIN).toEqual({ urgent: 5, normal: 10, flexible: 15 });
  });
  it('says when matched providers get invited, and the rate tier', () => {
    expect(urgencyTiming('urgent')).toBe('Not hired in 5 min? We invite top-matched providers · Premium rate');
    expect(urgencyTiming('normal')).toBe('Not hired in 10 min? We invite top-matched providers · Standard rate');
    expect(urgencyTiming('flexible')).toBe('Not hired in 15 min? We invite top-matched providers · Basic rate');
  });
  it('lists what Urgent adds', () => {
    expect(URGENT_PERKS).toEqual([
      'Top-matched providers invited fastest',
      "Shown first in providers' job feed",
      'Premium rate attracts top-rated providers',
    ]);
  });
});
