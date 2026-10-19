import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadSpartan } from '@remotion/google-fonts/LeagueSpartan';

// Brand tokens copied from mobile/src/constants/theme.ts (Colors + V6Colors).
export const C = {
  brandDark: '#063D4D',
  brandTeal: '#096E8B',
  brandCyan: '#0AA2CB',
  brandCyanLight: '#99DEF1',
  brandRed: '#E03434',
  logoAccent: '#096F8B',
  logoSkin: '#FFEECF',
  cyan50: '#ecfeff',
  cyan100: '#cffafe',
  cyan500: '#06b6d4',
  cyan600: '#0891b2',
  cyan900: '#063e4d',
  ink50: '#f1f5f9',
  ink100: '#e2e8f0',
  ink300: '#94a3b8',
  ink400: '#90a1b9',
  ink500: '#64748b',
  ink900: '#0f172a',
  canvas: '#f7f9fb',
  line: '#e8edf2',
  white: '#ffffff',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#7c3aed',
};

export const INTER = loadInter('normal', {
  weights: ['500', '600', '700', '800', '900'],
  subsets: ['latin', 'latin-ext'],
}).fontFamily;

export const SPARTAN = loadSpartan('normal', {
  weights: ['700', '800', '900'],
  subsets: ['latin'],
}).fontFamily;

export const W = 1080;
export const H = 1920;
