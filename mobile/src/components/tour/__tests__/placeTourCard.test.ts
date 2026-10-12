import { placeTourCard, type TourRect } from '../placeTourCard';

const SCREEN = { width: 360, height: 780 };
const CARD = { width: 300, height: 180 };
const hole = (x: number, y: number, width = 80, height = 48): TourRect => ({ x, y, width, height });

describe('placeTourCard', () => {
  it.each<[string, TourRect, { width: number; height: number }, number | undefined, object]>([
    ['sits below a hole near the top, centred on it', hole(140, 100), CARD, undefined,
      { top: 160, left: 30, placement: 'below' }],
    ['moves above a hole near the bottom when there is no room below', hole(140, 620), CARD, undefined,
      { top: 428, left: 30, placement: 'above' }],
    ['prefers below when both sides have room', hole(140, 300), CARD, undefined,
      { top: 360, left: 30, placement: 'below' }],
    ['uses the last pixel of room below', hole(140, 524), CARD, undefined,
      { top: 584, left: 30, placement: 'below' }],
    ['moves above when the card would end one pixel too low', hole(140, 525), CARD, undefined,
      { top: 333, left: 30, placement: 'above' }],
    ['pins to the left edge, 16 px in, when the centred card would leave the screen', hole(0, 300, 40, 40), CARD, undefined,
      { top: 352, left: 16, placement: 'below' }],
    ['pins to the right edge, 16 px in', hole(320, 300, 40, 40), CARD, undefined,
      { top: 352, left: 44, placement: 'below' }],
    ['puts a card below a hole at the very top of the screen', hole(140, 0), CARD, undefined,
      { top: 60, left: 30, placement: 'below' }],
    ['takes the side with more room when neither side fits, and keeps the card on screen', hole(140, 200, 80, 400), CARD, undefined,
      { top: 16, left: 30, placement: 'above' }],
    ['takes below when that side has more room and neither side fits', hole(140, 100, 80, 560), CARD, undefined,
      { top: 584, left: 30, placement: 'below' }],
    ['honours a custom margin between the hole and the card', hole(140, 300), CARD, 20,
      { top: 368, left: 30, placement: 'below' }],
    ['never returns a negative left for a card wider than the screen', hole(140, 100), { width: 400, height: 180 }, undefined,
      { top: 160, left: 0, placement: 'below' }],
  ])('%s', (_name, anchor, card, margin, expected) => {
    const placed = margin === undefined
      ? placeTourCard(anchor, SCREEN, card)
      : placeTourCard(anchor, SCREEN, card, margin);
    expect(placed).toEqual(expected);
  });

  it('keeps a card that fits the screen fully on screen, for holes everywhere on it', () => {
    for (let y = 0; y <= SCREEN.height; y += 40) {
      for (const height of [20, 48, 200, 500]) {
        for (let x = 0; x <= SCREEN.width; x += 40) {
          for (const width of [20, 80, 300]) {
            const { top, left } = placeTourCard(hole(x, y, width, height), SCREEN, CARD);
            const where = `hole ${x},${y} ${width}x${height}`;
            expect([where, top >= 0 && top + CARD.height <= SCREEN.height]).toEqual([where, true]);
            expect([where, left >= 0 && left + CARD.width <= SCREEN.width]).toEqual([where, true]);
          }
        }
      }
    }
  });
});
