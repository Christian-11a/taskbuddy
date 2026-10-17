import { Easing, interpolate, spring, SpringConfig } from 'remotion';

// Music grid (scripts/music.mjs): 120 BPM @ 30fps.
export const FPS = 30;
export const BEAT = 15;
export const BAR = 60;
export const TOTAL = 900;
export const bar = (b: number, beat = 0) => Math.round(b * BAR + beat * BEAT);

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const expoIn = Easing.bezier(0.7, 0, 0.84, 0);
export const inOut = Easing.bezier(0.83, 0, 0.17, 1);
export const backOut = Easing.bezier(0.34, 1.56, 0.64, 1);

export const SNAPPY: Partial<SpringConfig> = { damping: 15, stiffness: 260, mass: 0.6 };
export const BOUNCY: Partial<SpringConfig> = { damping: 9, stiffness: 210, mass: 0.6 };
export const SOFT: Partial<SpringConfig> = { damping: 20, stiffness: 120, mass: 0.9 };

/** Spring that starts at `start` (in the caller's local frame). */
export const sp = (f: number, start = 0, config: Partial<SpringConfig> = SNAPPY) =>
  spring({ frame: f - start, fps: FPS, config });

/** Per-frame velocity of a spring — drives squash & stretch. */
export const spVel = (f: number, start = 0, config: Partial<SpringConfig> = SNAPPY) =>
  sp(f, start, config) - sp(f - 1, start, config);

/** Eased tween between two frames. */
export const tw = (
  f: number,
  a: number,
  b: number,
  from = 0,
  to = 1,
  easing: (t: number) => number = expoOut,
) => interpolate(f, [a, b], [from, to], { ...CLAMP, easing });

/** Exponential decay pulse that fires at `at` — for beat bumps / flashes. */
export const hit = (f: number, at: number, decay = 5) => (f < at ? 0 : Math.exp(-(f - at) / decay));
export const hits = (f: number, ats: number[], decay = 5) => Math.max(0, ...ats.map((a) => hit(f, a, decay)));

/** Deterministic pseudo-noise in [-1, 1]. */
export const noise = (x: number) => {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

/** Camera shake: decays after `at`. */
export const shake = (f: number, at: number, amp = 30, decay = 6) => {
  const k = hit(f, at, decay) * amp;
  return { x: noise(f * 1.7 + at) * k, y: noise(f * 2.3 + at + 9) * k, r: noise(f * 3.1 + at) * k * 0.05 };
};

/** Squash & stretch from a velocity value (positive = moving). */
export const squash = (v: number, k = 2.2) => {
  const s = Math.min(0.45, Math.abs(v) * k);
  return { sx: 1 - s * 0.5, sy: 1 + s };
};

export const seq = (n: number) => Array.from({ length: n }, (_, i) => i);
