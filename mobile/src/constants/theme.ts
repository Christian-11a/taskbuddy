/**
 * theme.ts
 *
 * Shared design tokens and palette for the TaskBuddy mobile app.
 * This is the single source of truth for colors, typography, spacing,
 * radii, shadows, and sizing values used throughout the screens.
 */

import { Platform, StatusBar } from 'react-native';

// ─── Color palette ───────────────────────────────────────────────────────────

export const Colors = {
  // Brand
  brandDark: '#063D4D',
  brandTeal: '#096E8B',
  brandCyan: '#0AA2CB',
  brandCyanLight: '#99DEF1',
  brandRed: '#E03434',

  // Neutrals
  white: '#FFFFFF',
  background: '#F1F5F9',
  backgroundAlt: '#F8FAFC',
  cardBg: '#FFFFFF',
  muted: '#9099B8',
  mutedLight: 'rgba(144, 153, 184, 0.25)',
  divider: 'rgba(144, 153, 184, 0.4)',
  slate: '#64748B',
  slateLight: '#94A3B8',

  // Semantic
  error: '#E03434',
  errorBorder: '#E03434',
  success: '#22C55E',
  warning: '#F59E0B',
  pending: '#F59E0B',
  active: '#22C55E',
  done: '#71C7FF',

  // Specific UI
  googleText: '#757575',
  gestureBar: 'rgba(17, 27, 32, 0.25)',
  statusBar: '#1D1B20',
  skipText: '#657B8B',

  // Hero gradient approx
  heroStart: '#063D4D',
  heroEnd: '#096E8B',

  // Logo background colors
  logoBg: '#0AA2CB',
  logoAccent: '#096F8B',
  logoSkin: '#FFEECF',
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

export const Typography = {
  logo: {
    fontFamily: 'League Spartan',
    fontSize: 34.5,
    fontWeight: '700' as const,
    letterSpacing: 0.32,
    color: Colors.brandDark,
  },
  tagline: {
    fontFamily: 'Inter',
    fontSize: 19.5,
    fontWeight: '800' as const,
    color: Colors.brandDark,
  },
  heading: {
    fontFamily: 'Inter',
    fontSize: 21.5,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
    color: Colors.brandDark,
  },
  headingLg: {
    fontFamily: 'Inter',
    fontSize: 26,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  subheading: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0.14,
    color: Colors.muted,
  },
  label: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.brandDark,
  },
  labelSm: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.brandDark,
  },
  inputValue: {
    fontFamily: 'Inter',
    fontSize: 17.5,
    fontWeight: '400' as const,
    color: Colors.brandDark,
  },
  error: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.error,
  },
  buttonPrimary: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.3,
    color: Colors.white,
  },
  divider: {
    fontFamily: 'Roboto',
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.muted,
  },
  googleButton: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    color: Colors.googleText,
  },
  linkBold: {
    fontFamily: 'Roboto',
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.brandTeal,
  },
  promptText: {
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0.14,
    color: Colors.muted,
  },
  statusTime: {
    fontFamily: 'Roboto',
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0.14,
  },
  navLabel: {
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: '500' as const,
  },
  cardTitle: {
    fontFamily: 'Inter',
    fontSize: 17.5,
    fontWeight: '700' as const,
    color: Colors.brandDark,
  },
  cardBody: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.slate,
  },
  amount: {
    fontFamily: 'Inter',
    fontSize: 30,
    fontWeight: '700' as const,
    color: Colors.white,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const Spacing = {
  screenH: 20,
  screenHLg: 30,
  inputH: 16,
  inputV: 12,
  fieldGap: 18,
  sectionGap: 24,
  cardPad: 20,
  headerPad: 20,
} as const;

// ─── Border radii ─────────────────────────────────────────────────────────────

export const Radii = {
  input: 8,
  button: 24,
  buttonSm: 16,
  card: 24,
  cardLg: 30,
  chip: 999,
  gestureBar: 12,
  avatar: 12,
  navBar: 0,
  header: 24,
  logo: 10,
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const Shadows = {
  card: {
    shadowColor: '#063D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  input: {
    shadowColor: '#063D4D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryButton: {
    shadowColor: '#096E8B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  navBar: {
    shadowColor: '#063D4D',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

// ─── Component sizes ──────────────────────────────────────────────────────────

/**
 * `52` is the value verified on-device throughout this app's UI passes (a
 * typical Android status bar + header breathing room). Some Android devices
 * report a taller system status bar (camera cutouts, some edge-to-edge
 * configurations) than that fixed number assumes, which pushes header
 * content under the status bar there. `StatusBar.currentHeight` (Android
 * only, no new dependency) gives the real value — `Math.max` means devices
 * with a normal-or-smaller status bar keep the already-verified spacing
 * exactly, and only genuinely taller ones get extra headroom.
 */
const statusBarHeight =
  Platform.OS === 'android' ? Math.max(52, (StatusBar.currentHeight ?? 0) + 28) : 52;

export const Sizes = {
  frameWidth: 360,
  frameHeight: 800,
  inputHeight: 40,
  primaryButtonHeight: 48,
  googleButtonHeight: 44,
  statusBarHeight,
  navBarHeight: 77,
  heroHeight: 264,
  gestureBarWidth: 108,
  gestureBarHeight: 4,
  avatarSm: 36,
  avatarMd: 48,
  avatarLg: 64,
  iconSm: 20,
  iconMd: 24,
  iconLg: 32,
} as const;

// ─── Backward-compatible alias export for older color consumers ─────────────

export const colors = {
  ...Colors,
};

// ─────────────────────────────────────────────────────────────────────────────
// v6 design system — the "Scope Complete Marketplace" mockup
// (taskbuddy_UI_update.html, outside the repo root).
//
// This is a SEPARATE token set, not a replacement of Colors/Radii/Shadows
// above. Those stay exactly as-is so every screen that hasn't been migrated
// yet keeps rendering unchanged. New screens and src/components/ui/* consume
// only what's below. Once every screen is migrated, the old tokens can be
// deleted — not before.
//
// Values are the *cascaded-final* ones from the mockup's CSS: the file layers
// several iterations (v2 → v6) via plain CSS overrides, so where a later
// block redefines something from an earlier one, the later value is what's
// actually rendered and what's captured here.
// ─────────────────────────────────────────────────────────────────────────────

export const V6Colors = {
  cyan50: '#ecfeff',
  cyan100: '#cffafe',
  cyan200: '#a5f3fc',
  cyan500: '#06b6d4',
  cyan600: '#0891b2',
  cyan700: '#0e7490',
  cyan800: '#096f8b',
  cyan900: '#063e4d',

  ink25: '#f8fafc',
  ink50: '#f1f5f9',
  ink100: '#e2e8f0',
  ink200: '#cbd5e1',
  ink300: '#94a3b8',
  ink400: '#90a1b9',
  ink500: '#64748b',
  ink700: '#314158',
  ink800: '#1e293b',
  ink900: '#0f172a',

  green500: '#22c55e',
  green600: '#16a34a',
  amber500: '#f59e0b',
  amber700: '#92400e',
  red500: '#ef4444',
  red700: '#b91c1c',
  purple600: '#7c3aed',

  white: '#ffffff',
  canvas: '#f7f9fb',
  surface: '#ffffff',
  line: '#e8edf2',
  // Extra neutral tokens: same shape as `line`, just the specific shades
  // that recur across screens (topbar bottom borders, form field borders,
  // icon-well fills).
  hairline: '#edf1f4',
  fieldBorder: '#dce3e9',
  wellBg: '#f5f8fa',

  // Semantic status-dot colors used on job/booking status pills.
  statusInProgress: '#f59e0b',
  statusPendingReview: '#7c3aed',
  statusCompleted: '#22c55e',
  statusOpen: '#3b82f6',
  statusAccepted: '#3b82f6',
  statusCancelled: '#94a3b8',
} as const;

export const V6Radii = {
  card: 17,
  cardSm: 16, // .clean-job-card / .clean-feed-card / feed-list-surface
  btn: 13,
  pill: 9999,
  input: 12,
  icon: 12, // .icon-well, .detail-row .detail-icon-ish small icon wells
  hero: 26, // .hero-clean / .profile-hero bottom corners
} as const;

export const V6Shadows = {
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  primaryButton: {
    shadowColor: '#0891b2',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 4,
  },
} as const;

export const V6Typography = {
  fontFamily: 'Inter',
} as const;
