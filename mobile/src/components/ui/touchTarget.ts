/** The smallest touch target Android accepts, in dp (QA_CHECKS §4). */
export const MIN_TOUCH_DP = 48;

/** A hitSlop as React Native takes it: one number for every side, or a value per side. */
export type HitSlop = number | { top?: number; bottom?: number; left?: number; right?: number };

/**
 * The touch area a control gets along one axis: the size it is drawn at, plus the hitSlop on both
 * sides of that axis. The hitSlop only widens the touch area; the drawn size never changes.
 */
export function touchArea(drawn: number, hitSlop: HitSlop | undefined, axis: 'vertical' | 'horizontal'): number {
  const slop = typeof hitSlop === 'number'
    ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }
    : (hitSlop ?? {});
  return axis === 'vertical'
    ? drawn + (slop.top ?? 0) + (slop.bottom ?? 0)
    : drawn + (slop.left ?? 0) + (slop.right ?? 0);
}
