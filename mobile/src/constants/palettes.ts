import { Colors, V6Colors } from './theme';

type SemanticColors = {
  onPrimary: string; link: string; dangerSolid: string; dangerText: string;
  dangerSurface: string; dangerBorder: string; successText: string; successSurface: string;
  successBorder: string; successSolid: string; warningText: string; warningSurface: string; warningBorder: string;
  infoText: string; infoSurface: string; purpleText: string; purpleSurface: string;
  purpleBorder: string; hero: string; overlay: string;
};
const lightSemantic: SemanticColors = {
  onPrimary: '#ffffff', link: '#0e7490', dangerSolid: '#b91c1c', dangerText: '#b91c1c',
  dangerSurface: '#fef2f2', dangerBorder: '#fecaca', successText: '#15803d', successSurface: '#f0fdf4',
  successBorder: '#bbf7d0', successSolid: '#15803d', warningText: '#92400e', warningSurface: '#fffbeb', warningBorder: '#fde68a',
  infoText: '#0c4a6e', infoSurface: '#ecfeff', purpleText: '#7e22ce', purpleSurface: '#faf5ff',
  purpleBorder: '#e9d5ff', hero: '#063e4d', overlay: 'rgba(0, 0, 0, 0.65)',
};
const darkSemantic: SemanticColors = {
  ...lightSemantic, link: '#67e8f9', dangerText: '#fca5a5', dangerSurface: '#3a1d29', dangerBorder: '#763448',
  successText: '#86efac', successSurface: '#123529', successBorder: '#276749',
  warningText: '#fcd34d', warningSurface: '#392d16', warningBorder: '#735927',
  infoText: '#7dd3fc', infoSurface: '#103342', purpleText: '#d8b4fe', purpleSurface: '#302047', purpleBorder: '#654587',
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
export const darkPalette: Palette = {
  appearance: 'dark',
  Colors: {
    ...lightPalette.Colors, ...darkSemantic,
    background: '#0b1220', backgroundAlt: '#111c2e', cardBg: '#162338', surface: '#162338',
    muted: '#a6b5c9', slate: '#b5c3d5', slateLight: '#a6b5c9', googleText: '#b5c3d5',
    divider: '#34465e', mutedLight: '#26354b', skipText: '#b5c3d5', statusBar: '#f1f5f9',
    gestureBar: '#b5c3d5', link: '#67e8f9',
  },
  V6Colors: {
    ...lightPalette.V6Colors, ...darkSemantic,
    canvas: '#0b1220', surface: '#162338', wellBg: '#111c2e',
    ink25: '#111c2e', ink50: '#17263b', ink100: '#26354b', ink200: '#34465e',
    ink300: '#9eafc5', ink400: '#a6b5c9', ink500: '#b5c3d5',
    ink700: '#d7e1ef', ink800: '#e3ebf5', ink900: '#f1f5f9',
    line: '#34465e', hairline: '#26354b', fieldBorder: '#455a75',
    cyan50: '#103342', cyan100: '#154352', cyan200: '#266073',
    purple600: '#c4b5fd',
    link: '#67e8f9',
  },
};
