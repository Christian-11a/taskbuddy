import type { TourRect } from './types';

export type { TourRect } from './types';

/** The card keeps this much space from the left, right, top and bottom of the screen. */
const SCREEN_EDGE = 16;

export type TourCardPlacement = { top: number; left: number; placement: 'above' | 'below' };

const clampBetween = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/**
 * Where the tour card goes beside the spotlight. Below the hole when there is
 * room for the whole card, else above it; when neither side fits, the side
 * with more room, pulled back on screen. Horizontally the card is centred on
 * the hole and kept 16 px in from both edges. Pure, so the layout rules can
 * be tested without rendering anything.
 */
export function placeTourCard(
  hole: TourRect,
  screen: { width: number; height: number },
  card: { width: number; height: number },
  margin = 12,
): TourCardPlacement {
  const holeBottom = hole.y + hole.height;
  const lowestTop = screen.height - SCREEN_EDGE - card.height;
  const belowTop = holeBottom + margin;
  const aboveTop = hole.y - margin - card.height;
  const fitsBelow = belowTop <= lowestTop;
  const fitsAbove = aboveTop >= SCREEN_EDGE;
  const roomBelow = screen.height - holeBottom;
  const roomAbove = hole.y;
  const placement: TourCardPlacement['placement'] = fitsBelow
    ? 'below'
    : fitsAbove
      ? 'above'
      : roomBelow >= roomAbove ? 'below' : 'above';

  const wantedTop = placement === 'below' ? belowTop : aboveTop;
  const top = Math.max(0, Math.min(clampBetween(wantedTop, SCREEN_EDGE, lowestTop), screen.height - card.height));

  const centredLeft = hole.x + hole.width / 2 - card.width / 2;
  const left = Math.max(0, Math.min(
    clampBetween(centredLeft, SCREEN_EDGE, screen.width - SCREEN_EDGE - card.width),
    screen.width - card.width,
  ));

  return { top, left, placement };
}
