import { Colors, V6Colors } from './theme';

type SemanticColors = {
  onPrimary: string; link: string; dangerSolid: string; dangerText: string;
  dangerSurface: string; dangerBorder: string; successText: string; successSurface: string;
  successBorder: string; successSolid: string; warningText: string; warningSurface: string; warningBorder: string;
  infoText: string; infoSurface: string; purpleText: string; purpleSurface: string;
  purpleBorder: string; hero: string; overlay: string;
  /** Theme C "Sky" roles. Homeowner screens use `hero`; provider screens use
   * `providerHero` so the two roles never look alike. */
  primary: string; primaryTonal: string; primaryTonalStrong: string; primaryDeep: string;
  providerHero: string; onHeroMuted: string; heroCard: string; heroCardBorder: string;
  ripple: string; rippleOnHero: string; skeleton: string; scrim: string;
};
const lightSemantic: SemanticColors = {
  onPrimary: '#ffffff', link: '#0369a1', dangerSolid: '#b91c1c', dangerText: '#b91c1c',
  dangerSurface: '#fef2f2', dangerBorder: '#fecaca', successText: '#15803d', successSurface: '#f0fdf4',
  successBorder: '#bbf7d0', successSolid: '#15803d', warningText: '#92400e', warningSurface: '#fffbeb', warningBorder: '#fde68a',
  infoText: '#0c4a6e', infoSurface: '#e0f2fe', purpleText: '#7e22ce', purpleSurface: '#faf5ff',
  purpleBorder: '#e9d5ff', hero: '#0369a1', overlay: 'rgba(0, 0, 0, 0.55)',
  primary: '#0369a1', primaryTonal: '#e0f2fe', primaryTonalStrong: '#bae6fd', primaryDeep: '#0c4a6e',
  providerHero: '#13283c', onHeroMuted: 'rgba(255, 255, 255, 0.82)',
  heroCard: 'rgba(255, 255, 255, 0.12)', heroCardBorder: 'rgba(255, 255, 255, 0.22)',
  ripple: 'rgba(3, 105, 161, 0.12)', rippleOnHero: 'rgba(255, 255, 255, 0.2)',
  skeleton: '#e8edf2', scrim: 'rgba(15, 23, 42, 0.5)',
};
const darkSemantic: SemanticColors = {
  ...lightSemantic, link: '#38bdf8', dangerText: '#fca5a5', dangerSurface: '#2e1a1d', dangerBorder: '#6b2d34',
  successText: '#86efac', successSurface: '#132a1f', successBorder: '#24573c',
  warningText: '#fcd34d', warningSurface: '#2d2615', warningBorder: '#5f4b1f',
  infoText: '#7dd3fc', infoSurface: '#0e2a3b', purpleText: '#d8b4fe', purpleSurface: '#261c35', purpleBorder: '#4f3a6b',
  hero: '#0b3550', providerHero: '#0f2233',
  primary: '#0369a1', primaryTonal: '#0e2a3b', primaryTonalStrong: '#14405a', primaryDeep: '#7dd3fc',
  ripple: 'rgba(56, 189, 248, 0.16)', skeleton: '#232930', scrim: 'rgba(0, 0, 0, 0.6)',
  overlay: 'rgba(0, 0, 0, 0.7)',
};
export type Palette = {
  appearance: 'light' | 'dark';
  Colors: { [K in keyof typeof Colors]: string } & SemanticColors & { surface: string };
  V6Colors: { [K in keyof typeof V6Colors]: string } & SemanticColors;
};
export const lightPalette: Palette = {
  appearance: 'light',
  Colors: { ...Colors, ...lightSemantic, muted: '#64748b', slateLight: '#64748b', surface: Colors.cardBg, onPrimary: '#ffffff', link: Colors.brandTeal },
  V6Colors: { ...V6Colors, ...lightSemantic, ink300: '#64748b', ink400: '#64748b', onPrimary: '#ffffff', link: V6Colors.cyan700 },
};
// Neutral graphite surfaces (no blue cast) so the sky accent carries the
// brand; the primary fill stays #0369a1 so white button text keeps 5.9:1.
export const darkPalette: Palette = {
  appearance: 'dark',
  Colors: {
    ...lightPalette.Colors, ...darkSemantic,
    background: '#0e1113', backgroundAlt: '#13171a', cardBg: '#171b1f', surface: '#171b1f',
    muted: '#a1aab3', slate: '#b9c1c9', slateLight: '#a1aab3', googleText: '#b9c1c9',
    divider: '#2c3238', mutedLight: '#22282d', skipText: '#b9c1c9', statusBar: '#f3f5f7',
    gestureBar: '#b9c1c9', link: '#38bdf8',
    brandDark: '#e8ecef', brandTeal: '#38bdf8', brandCyan: '#38bdf8', brandCyanLight: '#14405a',
  },
  V6Colors: {
    ...lightPalette.V6Colors, ...darkSemantic,
    canvas: '#0e1113', surface: '#171b1f', wellBg: '#1d2227',
    ink25: '#13171a', ink50: '#1b2025', ink100: '#2c3238', ink200: '#3a4148',
    ink300: '#9aa3ad', ink400: '#a7b0b9', ink500: '#b9c1c9',
    ink700: '#dce1e6', ink800: '#e8ecef', ink900: '#f3f5f7',
    line: '#2c3238', hairline: '#22282d', fieldBorder: '#3a4148',
    cyan50: '#0b2231', cyan100: '#0e2a3b', cyan200: '#14405a', cyan500: '#38bdf8', cyan600: '#38bdf8',
    cyan900: '#7dd3fc',
    purple600: '#c4b5fd',
    link: '#38bdf8',
  },
};
