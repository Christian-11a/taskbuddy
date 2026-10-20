import { bottomBarPadding } from '../bottomBarPadding';

describe('bottomBarPadding', () => {
  // Android draws edge-to-edge: the inset IS the navigation bar, so the bar needs 16 dp of its own above it.
  it.each([
    [0, 16],
    [24, 40],
    [44, 60],
    [48, 64],
  ])('on Android, a %i dp inset gives %i dp', (inset, expected) => {
    expect(bottomBarPadding(inset, 'android')).toBe(expected);
  });

  // iOS keeps the old rule, so the button does not climb 16 dp above the home indicator.
  it.each([
    [34, 34],
    [0, 16],
    [8, 16],
  ])('on iOS, a %i dp inset gives %i dp', (inset, expected) => {
    expect(bottomBarPadding(inset, 'ios')).toBe(expected);
  });

  it.each([
    ['android', -10],
    ['android', Number.NaN],
    ['android', Number.POSITIVE_INFINITY],
    ['ios', -10],
    ['ios', Number.NaN],
  ])('on %s, a bad inset (%p) falls back to 16 dp', (os, inset) => {
    expect(bottomBarPadding(inset as number, os as string)).toBe(16);
  });

  it('treats any other platform like iOS', () => {
    expect(bottomBarPadding(30, 'web')).toBe(30);
    expect(bottomBarPadding(0, 'web')).toBe(16);
  });
});
