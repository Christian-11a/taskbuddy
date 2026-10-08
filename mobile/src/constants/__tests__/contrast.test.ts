import { contrastRatio } from '../contrast';
import { lightPalette, darkPalette } from '../palettes';

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('rejects colors it cannot measure', () => {
    expect(() => contrastRatio('rgba(0,0,0,0.5)', '#ffffff')).toThrow('#rrggbb');
  });
});

describe('palette text contrast (WCAG AA 4.5:1)', () => {
  const cases: [string, string, string][] = [
    ['light muted on canvas', lightPalette.V6Colors.ink500, lightPalette.V6Colors.canvas],
    ['light muted on card', lightPalette.Colors.muted, lightPalette.Colors.cardBg],
    ['light ink400 on canvas', lightPalette.V6Colors.ink400, lightPalette.V6Colors.canvas],
    ['light link on surface', lightPalette.V6Colors.link, lightPalette.V6Colors.surface],
    ['white on danger (light)', lightPalette.Colors.onPrimary, lightPalette.Colors.dangerSolid],
    ['white on danger (dark)', darkPalette.Colors.onPrimary, darkPalette.Colors.dangerSolid],
    ['dark muted on canvas', darkPalette.V6Colors.ink500, darkPalette.V6Colors.canvas],
    ['dark link on surface', darkPalette.V6Colors.link, darkPalette.V6Colors.surface],
  ];
  it.each(cases)('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
