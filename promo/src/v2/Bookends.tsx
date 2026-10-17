import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { BadgeCheck, Banknote, Check, CircleCheck, MessageCircle, Send, Star, UserRound } from 'lucide-react';
import { INTER } from '../theme';
import { BOUNCY, expoIn, expoOut, hit, hits, inOut, noise, shake, sp, spVel, squash, tw } from '../motion';
import { BlueLogo, BPart } from './BlueLogo';
import { Burst, Rings } from '../components/ui';
import { A } from './kit';

const BOARD: BPart[] = ['board', 'shine', 'box0', 'line0', 'box1', 'line1', 'box2', 'line2', 'check'];
const BUDDY: BPart[] = ['body', 'face', 'cap', 'brim'];
// buddy centre vs logo centre, in logo units (512 grid)
const BUDDY_OFF = { x: 390 - 256, y: 360 - 256 };
const BOARD_OFF = { x: 228 - 256, y: 240 - 256 };

/** Two halves of the mark, placed independently. */
const Halves: React.FC<{
  size: number;
  board: { x: number; y: number; s: number; r?: number; o?: number };
  buddy: { x: number; y: number; s: number; r?: number; o?: number };
  part?: (p: BPart) => { x?: number; y?: number; r?: number; s?: number; sx?: number; sy?: number };
  check?: number;
  id: string;
}> = ({ size, board, buddy, part = () => ({}), check = 1, id }) => {
  const u = size / 512;
  return (
    <>
      <div style={{ position: 'absolute', left: board.x - size / 2 - BOARD_OFF.x * u, top: board.y - size / 2 - BOARD_OFF.y * u, width: size, height: size, transform: `scale(${board.s}) rotate(${board.r ?? 0}deg)`, transformOrigin: `${50 + (BOARD_OFF.x / 512) * 100}% ${50 + (BOARD_OFF.y / 512) * 100}%`, opacity: board.o ?? 1 }}>
        <BlueLogo id={`${id}a`} size={size} check={check} part={(p) => (BUDDY.includes(p) ? { o: 0 } : part(p))} buddy={{ o: 0 }} />
      </div>
      <div style={{ position: 'absolute', left: buddy.x - size / 2 - BUDDY_OFF.x * u, top: buddy.y - size / 2 - BUDDY_OFF.y * u, width: size, height: size, transform: `scale(${buddy.s}) rotate(${buddy.r ?? 0}deg)`, transformOrigin: `${50 + (BUDDY_OFF.x / 512) * 100}% ${50 + (BUDDY_OFF.y / 512) * 100}%`, opacity: buddy.o ?? 1 }}>
        <BlueLogo id={`${id}b`} size={size} part={(p) => (BOARD.includes(p) ? { o: 0 } : part(p))} />
      </div>
    </>
  );
};

// ── 0–200: hook + "two sides" ───────────────────────────────────────────────
export const Opening: React.FC<{ f: number }> = ({ f }) => {
  if (f >= 212) return null;
  const size = 440;
  const cam = shake(f, 0, 30, 5);
  const C0 = { x: 960, y: 520 };
  // assemble from scattered parts
  const part = (p: BPart) => {
    const i = [...BOARD, ...BUDDY].indexOf(p);
    const cfg = { damping: 13, stiffness: 220, mass: 0.55 };
    const start = 1 + i * 1.2;
    const k = sp(f, start, cfg);
    const a = noise(i + 4) * Math.PI;
    const { sx, sy } = squash(spVel(f, start, cfg), 1.3);
    return { x: Math.cos(a) * 700 * (1 - k), y: Math.sin(a) * 700 * (1 - k), r: noise(i * 9) * 200 * (1 - k), s: Math.max(0, k), sx, sy };
  };
  const bump = hits(f, [60, 90], 4) * 0.05 + hits(f, [105, 108.75, 112.5, 116.25], 2.5) * 0.04;
  // split: clipboard → homeowner side, buddy → provider side
  const split = tw(f, 104, 122, 0, 1, inOut);
  const up = tw(f, 170, 196, 0, 1, expoIn);
  const bx0 = C0.x + BOARD_OFF.x * (size / 512), by0 = C0.y + BOARD_OFF.y * (size / 512);
  const board = { x: bx0 + (480 - bx0) * split, y: by0 + (440 - by0) * split - up * 420, s: (1 + bump) * (1 - split * 0.35) * (1 - up * 0.6), o: 1 - up, r: split * -6 * (1 - split) };
  const buddy = { x: C0.x + BUDDY_OFF.x * (size / 512) + (1440 - C0.x - BUDDY_OFF.x * (size / 512)) * split, y: C0.y + BUDDY_OFF.y * (size / 512) + (440 - C0.y - BUDDY_OFF.y * (size / 512)) * split - up * 420, s: (1 + bump) * (1 + split * 0.35) * (1 - up * 0.6), o: 1 - up };
  const darkO = 1 - tw(f, 116, 124);
  const lbl = (at: number) => sp(f, at, { damping: 15, stiffness: 190, mass: 0.7 }) * (1 - up);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 48%, #0d4f9a 0%, #0a2a50 40%, #071426 100%)', opacity: darkO }} />
      <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px)` }}>
        {f < 40 && Array.from({ length: 18 }, (_, i) => {
          const a = (i / 18) * 360 + 7;
          const p = tw(f, 0, 18, 0, 1, expoOut);
          return <div key={i} style={{ position: 'absolute', left: 960, top: 520, width: 280 * (1 - p) + 20, height: 12, borderRadius: 9, background: i % 2 ? '#3cc8fc' : '#9fe6ff', opacity: 1 - p, transform: `rotate(${a}deg) translateX(${170 + p * 1000}px)`, transformOrigin: '0 50%' }} />;
        })}
        <Rings f={f} at={0} x={960} y={520} color="#7fdcff" max={1100} count={3} width={16} />
        <Burst f={f} at={36} x={1100} y={640} n={14} radius={300} size={18} seed={3} colors={['#3cc8fc', '#9fe6ff', '#ffffff']} />
        <AbsoluteFill style={{ perspective: 1600 }}>
          <AbsoluteFill style={{ transform: `rotateY(${Math.sin((f - 40) / 14) * 14 * tw(f, 38, 52) * (1 - split)}deg) rotateX(${Math.cos((f - 40) / 18) * 6 * tw(f, 38, 52) * (1 - split)}deg)`, transformOrigin: '960px 520px' }}>
            <Halves id="op" size={size} board={board} buddy={buddy} part={part} check={tw(f, 28, 36)} />
          </AbsoluteFill>
        </AbsoluteFill>
        {/* side titles */}
        <div style={{ position: 'absolute', left: 480 - 360, width: 720, top: 700, textAlign: 'center', fontFamily: INTER, transform: `translateY(${(1 - lbl(126)) * 60}px)`, opacity: lbl(126) }}>
          <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: '-0.045em', color: A.cyan900 }}>Homeowners</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: A.cyan700, marginTop: 6 }}>Post jobs. Hire safely.</div>
        </div>
        <div style={{ position: 'absolute', left: 1440 - 360, width: 720, top: 700, textAlign: 'center', fontFamily: INTER, transform: `translateY(${(1 - lbl(134)) * 60}px)`, opacity: lbl(134) }}>
          <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: '-0.045em', color: A.white }}>Providers</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: A.cyan200, marginTop: 6 }}>Find work. Get paid.</div>
        </div>
        <div style={{ position: 'absolute', left: 960 - 330, width: 660, top: 90, textAlign: 'center', fontFamily: INTER, opacity: lbl(146), transform: `scale(${0.8 + lbl(146) * 0.2})` }}>
          <div style={{ display: 'inline-block', padding: '18px 40px', borderRadius: 30, background: 'rgba(8,24,36,0.85)', fontSize: 58, fontWeight: 900, letterSpacing: '-0.04em', color: A.white }}>
            One app. <span style={{ color: A.cyan500 }}>Two sides.</span>
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#ffffff', opacity: hit(f, 0, 2.5) * 0.85 + hit(f, 120, 3) * 0.6 }} />
    </AbsoluteFill>
  );
};

// ── 1560–1800: montage, breath, drop, end card ─────────────────────────────
const CUTS = [0, 7, 14, 21, 27, 33, 38, 42, 46, 49.5];
const ITEMS = [
  { I: BadgeCheck, t: 'Verified' }, { I: Check, t: 'Posted' }, { I: Send, t: 'Proposed' }, { I: UserRound, t: 'Hired' }, { I: MessageCircle, t: 'Chatted' },
  { I: CircleCheck, t: 'Done' }, { I: Banknote, t: 'Paid' }, { I: Star, t: 'Rated' },
];
const WORD = 'TaskBuddy'.split('');

export const Closing: React.FC<{ f: number }> = ({ f }) => {
  const l = f - 1560;
  if (l < 0) return null;

  if (l < 52.5) {
    let i = 0;
    CUTS.forEach((c, k) => { if (l >= c) i = k; });
    const e = tw(l, CUTS[i], CUTS[i] + 5, 0, 1, expoOut);
    const push = 1 + l * 0.004;
    const bg = i % 2 ? '#0e1b2c' : '#0b7288';
    if (i >= 8) {
      const s = 0.5 + (i - 8) * 0.15;
      return (
        <AbsoluteFill style={{ background: bg }}>
          <Halves id={`m${i}`} size={420} board={{ x: 760, y: 520, s: s * (0.8 + e * 0.2) }} buddy={{ x: 1160, y: 540, s: s * (0.8 + e * 0.2) }} />
        </AbsoluteFill>
      );
    }
    const { I, t } = ITEMS[i];
    const dir = i % 2 ? 1 : -1;
    return (
      <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: 999, border: `${12 + i * 3}px solid rgba(6,182,212,0.35)`, transform: `scale(${0.4 + e * 0.6 + i * 0.05})` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 50, transform: `scale(${push}) rotate(${dir * 2}deg)` }}>
          <div style={{ transform: `scale(${0.4 + e * 0.6}) rotate(${(1 - e) * dir * 90}deg)` }}><I size={200} color={i % 2 ? '#06b6d4' : '#ffffff'} strokeWidth={2.2} /></div>
          <div style={{ fontFamily: INTER, fontWeight: 900, fontSize: 230, letterSpacing: '-0.05em', color: '#ffffff', transform: `translateX(${(1 - e) * dir * 140}px)`, filter: `blur(${(1 - e) * 8}px)` }}>{t}</div>
        </div>
      </AbsoluteFill>
    );
  }

  if (l < 60) {
    // the breath before the drop: halves face each other, trembling
    const tr = (l - 52.5) * 0.8;
    return (
      <AbsoluteFill style={{ background: '#050b14' }}>
        <Halves id="gap" size={420} board={{ x: 700 + tr * 4 + noise(l * 9) * tr, y: 520, s: 0.8 }} buddy={{ x: 1220 - tr * 4 + noise(l * 7) * tr, y: 540, s: 0.8 }} />
      </AbsoluteFill>
    );
  }

  // DROP (1620) → end card
  const g = f - 1620;
  const cam = shake(g, 0, 34, 5);
  const size = 400;
  const C0 = { x: 960, y: 400 };
  const u = size / 512;
  const cfg = { damping: 11, stiffness: 260, mass: 0.6 };
  const m = sp(g, 0, cfg);
  const v = squash(spVel(g, 0, cfg), 0.8);
  const beat = hits(g, [0, 15, 30, 45], 4) * (g < 60 ? 1 : 0);
  const rise = tw(g, 30, 50, 0, 1, expoOut) * 30;
  const float = Math.sin(g / 16) * 6 * tw(g, 60, 90);
  const real = tw(g, 72, 88);
  const boardP = { x: 700 + (C0.x + BOARD_OFF.x * u - 700) * m, y: C0.y + BOARD_OFF.y * u - rise + float, s: (1 + beat * 0.05) * v.sx };
  const buddyP = { x: 1220 + (C0.x + BUDDY_OFF.x * u - 1220) * m, y: C0.y + BUDDY_OFF.y * u - rise + float, s: (1 + beat * 0.05) * v.sx };

  return (
    <AbsoluteFill style={{ background: '#f5fbfd', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 36%, rgba(60,200,252,0.35) 0%, rgba(245,251,253,0) 45%)', transform: `scale(${1 + beat * 0.1})` }} />
      <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px)` }}>
        <Rings f={g} at={0} x={960} y={400} color="#0d86ef" max={1100} count={3} width={20} gap={3} />
        <Rings f={g} at={60} x={960} y={400} color="#3cc8fc" max={700} count={2} width={10} />
        <Burst f={g} at={0} x={960} y={400} n={34} radius={900} size={24} seed={11} gravity={1.2} life={42} colors={['#0d86ef', '#3cc8fc', '#9fe6ff', '#f59e0b']} />
        <div style={{ opacity: 1 - real }}>
          <Halves id="end" size={size} board={boardP} buddy={buddyP} />
        </div>
        <Img src={staticFile('taskbuddy-logo.png')} style={{ position: 'absolute', left: C0.x - size / 2, top: C0.y - size / 2 - rise + float, width: size, height: size, opacity: real }} />

        <div style={{ position: 'absolute', top: 640 - rise, width: '100%', display: 'flex', justifyContent: 'center', fontFamily: INTER, fontWeight: 800, fontSize: 132, letterSpacing: '-0.02em', color: '#063e4d' }}>
          {WORD.map((ch, i) => {
            const c = { damping: 10, stiffness: 230, mass: 0.6 };
            const k = sp(g, 5 + i * 1.6, c);
            const q = squash(spVel(g, 5 + i * 1.6, c), 1.6);
            return <span key={i} style={{ display: 'inline-block', opacity: g >= 5 + i * 1.6 ? 1 : 0, transform: `translateY(${(1 - k) * -600}px) scale(${q.sx}, ${q.sy}) rotate(${(1 - k) * (i % 2 ? 25 : -25)}deg)`, transformOrigin: '50% 100%' }}>{ch}</span>;
          })}
        </div>
        <div style={{ position: 'absolute', top: 810 - rise, width: '100%', display: 'flex', justifyContent: 'center', gap: 14, fontFamily: INTER, fontWeight: 800, fontSize: 46, color: '#063e4d', letterSpacing: '-0.01em' }}>
          {'Hire with confidence, pay with ease.'.split(' ').map((w, i) => {
            const k = sp(g, 60 + i * 2, { damping: 16, stiffness: 200, mass: 0.6 });
            return <div key={i} style={{ overflow: 'hidden', paddingBottom: 6 }}><div style={{ transform: `translateY(${(1 - k) * 110}%)`, color: i >= 3 ? '#0e7490' : '#063e4d' }}>{w}</div></div>;
          })}
        </div>
        <div style={{ position: 'absolute', top: 886 - rise, left: 960 - 120, width: 240, height: 8, borderRadius: 8, background: '#0d86ef', transform: `scaleX(${tw(g, 66, 84)})` }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#ffffff', opacity: hit(g, 0, 3) }} />
    </AbsoluteFill>
  );
};

export { BOUNCY };
