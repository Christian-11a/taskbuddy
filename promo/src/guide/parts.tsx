import React from 'react';
import { Img, staticFile } from 'remotion';
import { INTER } from '../theme';
import { expoOut, tw } from '../motion';

// Sky palette (light) used by the guide videos.
export const G = {
  primary: '#0369a1',
  primaryDeep: '#0c4a6e',
  primaryTonal: '#e0f2fe',
  tint: '#f0f9ff',
  dark: '#13283c',
  ink: '#0f172a',
  muted: '#64748b',
  rule: '#e2e8f0',
  paper: '#f8fafc',
  white: '#ffffff',
};

export type GuideStep = {
  headline: string;
  body: string;
  narration: string;
  tapWord?: string;
  /** Path under promo/public/ (e.g. "guide/post-a-job/01.png"), or "placeholder:<label>". */
  screenshot: string;
  /** Tap point as fractions (0-1) of the screenshot: x from left, y from top. */
  tap?: { x: number; y: number };
};

export type GuideLessonData = {
  id: string;
  title: string;
  track?: 'clients' | 'providers';
  number?: number;
  summary?: string;
  next?: string;
  steps: GuideStep[];
};

export type GuideTiming = {
  fps: number;
  durationFrames: number;
  steps: { startFrame: number; endFrame: number; tapFrame?: number }[];
  words: { text: string; startFrame: number; endFrame: number }[];
};

export const SCREEN_W = 400;
export const SCREEN_H = 889; // 9:20 aspect, like a 1080x2400 emulator capture
export const BEZEL = 14;
export const PHONE_FRAME_W = SCREEN_W + BEZEL * 2;
export const PHONE_FRAME_H = SCREEN_H + BEZEL * 2;

/** Android-style frame: dark thin bezel, punch-hole camera, no status bar or notch. Children fill the 9:20 screen. */
export const AndroidPhone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      width: PHONE_FRAME_W, height: PHONE_FRAME_H, boxSizing: 'border-box', padding: BEZEL, borderRadius: 52,
      background: '#0b1220', boxShadow: '0 40px 80px rgba(12,74,110,0.25), 0 8px 20px rgba(12,74,110,0.18)', position: 'relative',
    }}
  >
    <div style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H, borderRadius: 38, overflow: 'hidden', background: G.white }}>
      {children}
      <div style={{ position: 'absolute', left: SCREEN_W / 2 - 8, top: 14, width: 16, height: 16, borderRadius: 8, background: '#05080f', zIndex: 30 }} />
    </div>
  </div>
);

/** Screenshot (or generated placeholder) filling the phone screen. */
export const ScreenShot: React.FC<{ src: string }> = ({ src }) => {
  if (src.startsWith('placeholder:')) {
    const label = src.slice('placeholder:'.length);
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#e5e9ee', fontFamily: INTER }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 40, background: '#d3d9e0' }}>
          <div style={{ position: 'absolute', left: 22, top: 13, width: 40, height: 12, borderRadius: 6, background: '#b9c1cc' }} />
          <div style={{ position: 'absolute', right: 22, top: 13, width: 56, height: 12, borderRadius: 6, background: '#b9c1cc' }} />
        </div>
        <div style={{ position: 'absolute', top: 68, left: 22, right: 22, height: 18, borderRadius: 9, background: '#d3d9e0' }} />
        <div style={{ position: 'absolute', top: 104, left: 22, width: 150, height: 14, borderRadius: 7, background: '#d3d9e0' }} />
        <div style={{ position: 'absolute', top: 162, left: 22, right: 22, height: 160, borderRadius: 18, background: '#d9dee5' }} />
        <div style={{ position: 'absolute', top: 342, left: 22, right: 22, height: 76, borderRadius: 16, background: '#d9dee5' }} />
        <div style={{ position: 'absolute', top: 436, left: 22, right: 22, height: 76, borderRadius: 16, background: '#d9dee5' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, background: '#dde2e8' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'grid', placeItems: 'center', padding: 36, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#8793a3' }}>SCREENSHOT PLACEHOLDER</div>
            <div style={{ marginTop: 10, fontSize: 30, fontWeight: 800, color: '#556274', lineHeight: 1.15 }}>{label}</div>
          </div>
        </div>
      </div>
    );
  }
  return <Img src={staticFile(src)} style={{ position: 'absolute', inset: 0, width: SCREEN_W, height: SCREEN_H, objectFit: 'cover', objectPosition: 'top' }} />;
};

/** Soft tap marker in screen-pixel space: glides in, gentle press, slow ripple. No bounce. */
export const TapMarker: React.FC<{ t: number; at: number; x: number; y: number }> = ({ t, at, x, y }) => {
  if (t < at - 16 || t > at + 44) return null;
  const inO = tw(t, at - 16, at - 4, 0, 1);
  const outO = tw(t, at + 30, at + 44, 1, 0);
  const o = Math.min(inO, outO);
  const press = tw(t, at, at + 8, 0, 1, expoOut) * (1 - tw(t, at + 12, at + 26, 0, 1));
  const drift = tw(t, at - 16, at, 1, 0, expoOut) * 22; // eases in from slightly below
  const ring = (delay: number) => {
    const p = tw(t, at + delay, at + delay + 28, 0, 1, expoOut);
    return { p, o: t < at + delay ? 0 : (1 - p) * 0.7 };
  };
  const rings = [ring(2), ring(12)];
  const S = 54;
  return (
    <div style={{ position: 'absolute', left: x, top: y + drift, opacity: o, pointerEvents: 'none', zIndex: 20 }}>
      {rings.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: -S / 2, top: -S / 2, width: S, height: S, borderRadius: S,
            border: `3px solid ${G.primary}`, opacity: r.o, transform: `scale(${1 + r.p * 1.6})`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute', left: -S / 2, top: -S / 2, width: S, height: S, borderRadius: S,
          background: 'rgba(3,105,161,0.22)', border: '3px solid rgba(255,255,255,0.95)',
          boxShadow: '0 4px 14px rgba(12,74,110,0.35)', transform: `scale(${1 - press * 0.14})`,
        }}
      />
    </div>
  );
};

/** Segmented progress bar along the bottom: one segment per step. */
export const ProgressBar: React.FC<{ t: number; starts: number[]; end: number; width: number }> = ({ t, starts, end, width }) => {
  const gap = 10;
  const n = starts.length;
  const seg = (width - gap * (n - 1)) / n;
  return (
    <div style={{ display: 'flex', gap, width }}>
      {starts.map((s, i) => {
        const e = i + 1 < n ? starts[i + 1] : end;
        const p = tw(t, s, e, 0, 1, (x) => x);
        return (
          <div key={i} style={{ width: seg, height: 8, borderRadius: 4, background: G.rule, overflow: 'hidden' }}>
            <div style={{ width: `${p * 100}%`, height: '100%', background: G.primary, borderRadius: 4 }} />
          </div>
        );
      })}
    </div>
  );
};

type Word = GuideTiming['words'][number];

/** Splits words into caption pages of at most two lines (about 92 characters). */
export const captionPages = (words: Word[], maxChars = 92): Word[][] => {
  const pages: Word[][] = [];
  let cur: Word[] = [];
  let len = 0;
  for (const w of words) {
    if (cur.length && len + 1 + w.text.length > maxChars) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += (len ? 1 : 0) + w.text.length;
    if (/[.!?]$/.test(w.text) && len > maxChars * 0.5) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
  }
  if (cur.length) pages.push(cur);
  return pages;
};

/** Burned-in captions: current page of words, current word highlighted. */
export const Captions: React.FC<{ t: number; pages: Word[][]; width: number }> = ({ t, pages, width }) => {
  let page: Word[] | undefined;
  for (const p of pages) {
    if (t >= p[0].startFrame - 4 && t <= p[p.length - 1].endFrame + 14) page = p;
  }
  if (!page) return null;
  const first = page[0].startFrame - 4;
  const last = page[page.length - 1].endFrame + 14;
  const o = Math.min(tw(t, first, first + 6, 0, 1), tw(t, last - 6, last, 1, 0));
  return (
    <div
      style={{
        width, minHeight: 112, boxSizing: 'border-box', padding: '16px 26px', borderRadius: 20, opacity: o,
        background: G.white, border: `2px solid ${G.rule}`, boxShadow: '0 10px 30px rgba(12,74,110,0.08)',
        fontFamily: INTER, fontSize: 34, lineHeight: 1.4, fontWeight: 600, color: G.dark,
      }}
    >
      {page.map((w, i) => {
        const on = t >= w.startFrame && t < w.endFrame + 1;
        const done = t >= w.endFrame + 1;
        return (
          <React.Fragment key={i}>
            <span
              style={{
                borderRadius: 8, padding: '0 5px', margin: '0 -5px',
                background: on ? G.primaryTonal : 'transparent',
                color: on ? G.primaryDeep : done ? G.dark : G.muted,
              }}
            >
              {w.text}
            </span>{' '}
          </React.Fragment>
        );
      })}
    </div>
  );
};
