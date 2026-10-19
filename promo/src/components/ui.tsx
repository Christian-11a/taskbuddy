import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { C, INTER } from '../theme';
import { CLAMP, expoOut, noise, sp, SNAPPY, tw } from '../motion';

// ── Headline: words rise out of masks, staggered ────────────────────────────
export const Headline: React.FC<{
  f: number;
  at: number;
  words: { t: string; c?: string }[][]; // lines → words
  size?: number;
  stagger?: number;
  out?: number; // frame to exit
  align?: 'center' | 'left';
  style?: React.CSSProperties;
}> = ({ f, at, words, size = 120, stagger = 3, out, align = 'center', style }) => {
  let k = 0;
  return (
    <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: size, lineHeight: 0.98, letterSpacing: '-0.045em', textAlign: align, ...style }}>
      {words.map((line, li) => (
        <div key={li} style={{ display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: size * 0.24 }}>
          {line.map((w) => {
            const i = k++;
            const p = sp(f, at + i * stagger, { damping: 16, stiffness: 190, mass: 0.7 });
            const o = out != null ? tw(f, out + i * 1.5, out + 8 + i * 1.5, 0, 1, (t) => t * t) : 0;
            return (
              <div key={w.t + i} style={{ overflow: 'hidden', paddingBottom: size * 0.08, marginBottom: -size * 0.08 }}>
                <div
                  style={{
                    color: w.c,
                    transform: `translateY(${(1 - p) * 110 - o * 110}%) rotate(${(1 - p) * 8}deg)`,
                    transformOrigin: 'left bottom',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {w.t}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ── Phone shell ──────────────────────────────────────────────────────────────
export const Phone: React.FC<{ w?: number; h?: number; children: React.ReactNode; style?: React.CSSProperties; bg?: string }> = ({
  w = 600, h = 1220, children, style, bg = C.canvas,
}) => (
  <div
    style={{
      width: w, height: h, borderRadius: 86, background: '#0b1418', padding: 16,
      boxShadow: '0 60px 120px rgba(3,30,40,0.45), 0 0 0 3px rgba(255,255,255,0.08) inset',
      ...style,
    }}
  >
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 72, overflow: 'hidden', background: bg }}>
      {children}
      <div style={{ position: 'absolute', top: 18, left: '50%', width: 150, height: 38, marginLeft: -75, borderRadius: 20, background: '#0b1418' }} />
    </div>
  </div>
);

// ── Pill (mirrors JobCard pill) ─────────────────────────────────────────────
export const Pill: React.FC<{ label: string; color: string; bg: string; dot?: boolean; size?: number; style?: React.CSSProperties }> = ({
  label, color, bg, dot, size = 22, style,
}) => (
  <div
    style={{
      display: 'inline-flex', alignItems: 'center', gap: size * 0.4, padding: `${size * 0.4}px ${size * 0.75}px`,
      borderRadius: 999, background: bg, color, fontFamily: INTER, fontWeight: 800, fontSize: size, ...style,
    }}
  >
    {dot && <div style={{ width: size * 0.6, height: size * 0.6, borderRadius: 99, background: color }} />}
    {label}
  </div>
);

// ── Particle burst ───────────────────────────────────────────────────────────
export const Burst: React.FC<{
  f: number; at: number; x: number; y: number; n?: number; radius?: number; colors?: string[]; size?: number; seed?: number; gravity?: number; life?: number;
}> = ({ f, at, x, y, n = 18, radius = 320, colors = [C.brandCyan, C.brandCyanLight, C.white], size = 16, seed = 1, gravity = 0, life = 26 }) => {
  const t = f - at;
  if (t < 0 || t > life) return null;
  const p = tw(f, at, at + life * 0.7, 0, 1, expoOut);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + noise(i + seed) * 0.4;
        const d = radius * (0.6 + 0.4 * Math.abs(noise(i * 3 + seed)));
        const px = x + Math.cos(a) * d * p;
        const py = y + Math.sin(a) * d * p + gravity * t * t * 0.5;
        const s = size * (1 - t / life) * (0.6 + 0.4 * Math.abs(noise(i * 7 + seed)));
        const isBar = i % 3 === 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: px - s / 2, top: py - s / 2,
              width: isBar ? s * 2.4 : s, height: s, borderRadius: 99,
              background: colors[i % colors.length],
              transform: `rotate(${(a * 180) / Math.PI}deg)`,
            }}
          />
        );
      })}
    </>
  );
};

// ── Expanding ring(s) ────────────────────────────────────────────────────────
export const Rings: React.FC<{ f: number; at: number; x: number; y: number; color?: string; max?: number; count?: number; width?: number; gap?: number }> = ({
  f, at, x, y, color = C.brandCyan, max = 700, count = 3, width = 10, gap = 4,
}) => (
  <>
    {Array.from({ length: count }, (_, i) => {
      const s = at + i * gap;
      if (f < s || f > s + 30) return null;
      const p = tw(f, s, s + 26, 0, 1, expoOut);
      const r = p * max;
      return (
        <div
          key={i}
          style={{
            position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%',
            border: `${width * (1 - p) + 1}px solid ${color}`, opacity: 1 - p,
          }}
        />
      );
    })}
  </>
);

// ── Film grain + vignette for finish ────────────────────────────────────────
export const Finish: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 50%, rgba(0,0,0,0) 70%, rgba(2,26,33,0.12) 100%)' }} />
    <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.07, mixBlendMode: 'overlay' }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={f % 12} stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

// ── Count-up number ─────────────────────────────────────────────────────────
export const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const countUp = (f: number, a: number, b: number, to: number) =>
  Math.round(interpolate(f, [a, b], [0, to], { ...CLAMP, easing: expoOut }) / 10) * 10;

export { SNAPPY };
