import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import { Banknote, Inbox, MessageCircle, Send, Star } from 'lucide-react';
import { INTER } from '../theme';
import { CLAMP, expoOut, hit, inOut, noise, sp, tw } from '../motion';
import { A, DP_H, DP_W, Phone, Avatar } from './kit';
import { HOPhoneContent, JobCardUI, CHAT } from './HOScreens';
import { SPPhoneContent } from './SPScreens';
import { JOB, PROVIDER as P } from './timeline';
import { peso } from '../components/ui';

// ── Phone choreography ──────────────────────────────────────────────────────
type PS = { x: number; y: number; s: number; ry: number };
type Mode = { ho: PS; sp: PS; div: number };
const PW = 440;
const MODES: Record<string, Mode> = {
  hidden: { ho: { x: 540, y: 1600, s: 0.9, ry: 30 }, sp: { x: 1380, y: 1600, s: 0.9, ry: -30 }, div: 960 },
  both: { ho: { x: 540, y: 572, s: 1, ry: 12 }, sp: { x: 1380, y: 572, s: 1, ry: -12 }, div: 960 },
  sp: { ho: { x: -460, y: 572, s: 1, ry: 45 }, sp: { x: 1330, y: 566, s: 1.05, ry: -8 }, div: -200 },
  ho: { ho: { x: 590, y: 566, s: 1.05, ry: 8 }, sp: { x: 2380, y: 572, s: 1, ry: -45 }, div: 2120 },
};
const KEYS: [number, string, number][] = [
  [120, 'hidden', 1], [172, 'both', 34], [240, 'sp', 20], [420, 'ho', 20], [626, 'both', 20], [680, 'sp', 20], [866, 'both', 18], [920, 'ho', 20], [1024, 'both', 20],
];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixPS = (a: PS, b: PS, t: number): PS => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: lerp(a.s, b.s, t), ry: lerp(a.ry, b.ry, t) });
export const stageAt = (f: number): Mode => {
  let i = 0;
  KEYS.forEach(([at], k) => { if (f >= at) i = k; });
  const [at, name, dur] = KEYS[i];
  const prev = MODES[KEYS[Math.max(0, i - 1)][1]];
  const cur = MODES[name];
  const t = tw(f, at, at + dur, 0, 1, inOut);
  return { ho: mixPS(prev.ho, cur.ho, t), sp: mixPS(prev.sp, cur.sp, t), div: lerp(prev.div, cur.div, t) };
};

// dp → screen coordinates for a phone state (ignores the small rotateY)
const K = (PW * (1 - 0.056)) / DP_W;
const PH = DP_H * K + PW * 0.056;
export const dp = (ps: PS, x: number, y: number) => ({
  x: ps.x + (-PW / 2 + PW * 0.028 + x * K) * ps.s,
  y: ps.y + (-PH / 2 + PW * 0.028 + y * K) * ps.s,
});

// ── Captions ────────────────────────────────────────────────────────────────
type Cap = { at: number; out: number; side: 'left' | 'right' | 'center'; a: string; b: string; sub?: string };
const CAPS: Cap[] = [
  { at: 246, out: 414, side: 'left', a: 'Verified', b: 'first.', sub: 'Government ID + face scan' },
  { at: 428, out: 618, side: 'right', a: 'Post a job', b: 'in minutes.', sub: 'Service · place · time · budget' },
  { at: 688, out: 860, side: 'left', a: 'Proposals', b: 'roll in.', sub: 'Verified providers nearby apply' },
  { at: 928, out: 1018, side: 'right', a: 'Hire with', b: 'one tap.', sub: 'Compare offers, pick the best' },
  { at: 1040, out: 1134, side: 'center', a: 'Booking', b: 'confirmed.' },
  { at: 1146, out: 1256, side: 'center', a: 'Chat in', b: 'real time.' },
  { at: 1266, out: 1336, side: 'center', a: 'Mark it', b: 'done.' },
  { at: 1344, out: 1434, side: 'center', a: 'Held safe', b: 'in escrow.', sub: 'Released only when you confirm' },
  { at: 1446, out: 1556, side: 'center', a: 'Rate', b: 'the work.' },
];

const Caption: React.FC<{ f: number; c: Cap }> = ({ f, c }) => {
  if (f < c.at || f > c.out + 12) return null;
  const onNavy = c.side === 'left';
  const center = c.side === 'center';
  const size = center ? 58 : 112;
  const words = [c.a, c.b];
  const outP = tw(f, c.out, c.out + 10, 0, 1, (t) => t * t);
  const x = c.side === 'left' ? 150 : c.side === 'right' ? 1110 : 960;
  const panel = center ? sp(f, c.at, { damping: 16, stiffness: 200, mass: 0.7 }) * (1 - outP) : 0;
  return (
    <div style={{ position: 'absolute', left: center ? x - 190 : x, top: center ? 470 : 380, width: center ? 380 : 720, textAlign: center ? 'center' : 'left', fontFamily: INTER }}>
      {center && (
        <div style={{ position: 'absolute', inset: '-26px -10px', borderRadius: 34, background: 'rgba(8,24,36,0.82)', backdropFilter: 'blur(10px)', border: '1px solid rgba(153,222,241,0.18)', transform: `scale(${panel})`, boxShadow: '0 30px 60px rgba(0,0,0,0.3)' }} />
      )}
      {words.map((w, i) => {
        const p = sp(f, c.at + 2 + i * 4, { damping: 15, stiffness: 190, mass: 0.7 });
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: size * 0.1, marginBottom: -size * 0.1, position: 'relative' }}>
            <div style={{ fontSize: size, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1, color: i ? (onNavy || center ? A.cyan500 : A.cyan700) : (onNavy || center ? A.white : A.cyan900), transform: `translateY(${(1 - p) * 110 - outP * 110}%)` }}>
              {w}
            </div>
          </div>
        );
      })}
      {c.sub && (
        <div style={{ position: 'relative', marginTop: center ? 10 : 22, fontSize: center ? 17 : 30, fontWeight: 700, color: onNavy || center ? 'rgba(207,250,254,0.8)' : A.ink500, opacity: tw(f, c.at + 10, c.at + 18) * (1 - outP), transform: `translateY(${tw(f, c.at + 10, c.at + 22, 16, 0)}px)` }}>
          {c.sub}
        </div>
      )}
    </div>
  );
};

// ── Flying objects between phones ──────────────────────────────────────────
const Flyer: React.FC<{ f: number; a: number; b: number; from: { x: number; y: number }; to: { x: number; y: number }; arc?: number; children: React.ReactNode; scaleMid?: number; trail?: number }> = ({
  f, a, b, from, to, arc = -220, children, scaleMid = 1.25, trail = 4,
}) => {
  if (f < a - 1 || f > b + 2) return null;
  const at = (g: number) => {
    const t = tw(g, a, b, 0, 1, inOut);
    return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * arc, s: 1 + Math.sin(t * Math.PI) * (scaleMid - 1), r: Math.sin(t * Math.PI) * (to.x > from.x ? 8 : -8), t };
  };
  const land = hit(f, b, 3);
  return (
    <>
      {Array.from({ length: trail }, (_, k) => trail - k).map((k) => {
        const p = at(f - k * 1.2);
        if (p.t <= 0 || p.t >= 1) return null;
        return <div key={k} style={{ position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%, -50%) scale(${p.s}) rotate(${p.r}deg)`, opacity: 0.12 * (trail - k + 1) / trail, filter: 'blur(2px)' }}>{children}</div>;
      })}
      {(() => {
        const p = at(f);
        return <div style={{ position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%, -50%) scale(${p.s * (1 - land * 0.2)}) rotate(${p.r}deg)`, opacity: f > b ? 0 : 1, filter: 'drop-shadow(0 24px 30px rgba(0,0,0,0.35))' }}>{children}</div>;
      })()}
    </>
  );
};

const Coin: React.FC = () => (
  <div style={{ width: 84, height: 84, borderRadius: 84, background: 'linear-gradient(135deg, #fde68a, #f59e0b)', display: 'grid', placeItems: 'center', color: A.white, fontFamily: INTER, fontSize: 44, fontWeight: 900, border: '4px solid #fef3c7' }}>₱</div>
);

// ── Stage ───────────────────────────────────────────────────────────────────
// hero: both phones stay on screen the whole time and every caption sits in
// the centre panel between them (used by the website hero loop).
export const Stage: React.FC<{ f: number; hero?: boolean }> = ({ f, hero = false }) => {
  const st = hero ? MODES.both : stageAt(f);
  const d = st.div;
  const beat = f % 15 === 0 ? 1 : 0;
  const bump = (f >= 1140 && f < 1260) ? 0 : hit(f, Math.floor(f / 15) * 15, 4) * 0.004 + beat * 0;
  const drift = Math.sin(f / 90) * 6;
  const secs = [240, 420, 626, 680, 866, 920, 1024, 1140, 1340, 1440, 1560];
  let s0 = 172, s1 = 240;
  secs.forEach((t, k) => { if (f >= t) { s0 = t; s1 = secs[k + 1] ?? 1560; } });
  const push = 1 + 0.035 * tw(f, s0, s1, 0, 1, (t) => t);

  const hoPhone = (
    <Phone w={PW}><HOPhoneContent f={f} /></Phone>
  );
  const spPhone = (
    <Phone w={PW}><SPPhoneContent f={f} /></Phone>
  );
  const place = (ps: PS, node: React.ReactNode, label: string, color: string, bg: string, lp: number) => (
    <div style={{ position: 'absolute', left: ps.x - PW / 2, top: ps.y - PH / 2, width: PW, height: PH, transform: `perspective(2200px) rotateY(${ps.ry}deg) scale(${ps.s})`, transformStyle: 'preserve-3d' }}>
      <div style={{ position: 'absolute', top: -58, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `scale(${lp})` }}>
        <div style={{ padding: '8px 18px', borderRadius: 99, background: bg, color, fontFamily: INTER, fontWeight: 800, fontSize: 18, letterSpacing: '0.14em' }}>{label}</div>
      </div>
      {node}
    </div>
  );
  const chipIn = sp(f, 196, { damping: 12, stiffness: 200, mass: 0.6 });

  const hoP = st.ho, spP = st.sp;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* navy provider world */}
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 75% 40%, #16395a 0%, #0e1b2c 55%, #0a1220 100%)' }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(125,211,252,0.18) 1.5px, transparent 2px)', backgroundSize: '44px 44px', backgroundPosition: `${-f * 0.6}px ${-f * 0.3}px` }} />
      {/* light homeowner world, diagonal split */}
      <AbsoluteFill style={{ clipPath: `polygon(0 0, ${d + 110}px 0, ${d - 110}px 100%, 0 100%)`, background: 'radial-gradient(circle at 25% 40%, #ffffff 0%, #e6f7fa 45%, #c9ecf4 100%)' }}>
        <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(8,145,178,0.14) 1.5px, transparent 2px)', backgroundSize: '44px 44px', backgroundPosition: `${f * 0.6}px ${-f * 0.3}px` }} />
      </AbsoluteFill>
      {/* divider glow line */}
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        <line x1={d + 110} y1={0} x2={d - 110} y2={1080} stroke={A.cyan500} strokeWidth={4} opacity={0.7} />
      </svg>

      <AbsoluteFill style={{ transform: `translateY(${drift}px) scale(${(1 + bump) * push})` }}>
        {CAPS.map((c, i) => <Caption key={i} f={f} c={hero ? { ...c, side: 'center', sub: undefined } : c} />)}
        {place(hoP, hoPhone, 'HOMEOWNER', A.white, A.cyan700, chipIn)}
        {place(spP, spPhone, 'PROVIDER', A.cyan900, '#99DEF1', chipIn)}

        {/* job card: homeowner → provider feed */}
        <Flyer f={f} a={646} b={668} from={dp(hoP, 180, 350)} to={dp(spP, 180, 300)}>
          <div style={{ width: DP_W - 40, transform: `scale(${K})`, fontFamily: INTER, color: A.ink900 }}><JobCardUI status={{ label: 'Open', color: '#F59E0B', bg: '#FFF7ED' }} urgent /></div>
        </Flyer>
        {/* proposal: provider → homeowner */}
        <Flyer f={f} a={876} b={903} from={dp(spP, 180, 480)} to={dp(hoP, 180, 390)} arc={200}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: A.white, borderRadius: 22, padding: '14px 20px', fontFamily: INTER, boxShadow: `0 0 0 3px ${A.cyan500}` }}>
            <Avatar ini={P.ini} size={48} />
            <div><div style={{ fontSize: 18, fontWeight: 800 }}>New proposal</div><div style={{ fontSize: 15, color: A.ink500, fontWeight: 600 }}>{P.name}</div></div>
            <div style={{ fontSize: 22, fontWeight: 800, color: A.cyan800 }}>{peso(JOB.offer)}</div>
          </div>
        </Flyer>
        {/* booking request: homeowner → provider */}
        <Flyer f={f} a={1028} b={1045} from={dp(hoP, 180, 400)} to={dp(spP, 296, 80)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: A.cyan700, color: A.white, borderRadius: 99, padding: '12px 22px', fontFamily: INTER, fontSize: 20, fontWeight: 800 }}><Inbox size={22} /> Booking request</div>
        </Flyer>
        {/* chat messages cross the gap */}
        {CHAT.map((m, i) => {
          const fromHO = m.from === 'ho';
          return (
            <Flyer key={i} f={f} a={m.at} b={m.at + 8} from={dp(fromHO ? hoP : spP, 300, 140 + i * 60)} to={dp(fromHO ? spP : hoP, 60, 140 + i * 60)} arc={-80} scaleMid={1.1} trail={3}>
              <div style={{ width: 56, height: 56, borderRadius: 56, background: fromHO ? A.cyan600 : A.white, display: 'grid', placeItems: 'center' }}><MessageCircle size={28} color={fromHO ? A.white : A.cyan700} /></div>
            </Flyer>
          );
        })}
        {/* job done signal: provider → homeowner */}
        <Flyer f={f} a={1297} b={1305} from={dp(spP, 180, 488)} to={dp(hoP, 180, 470)} arc={-120} scaleMid={1.1} trail={3}>
          <div style={{ padding: '10px 18px', borderRadius: 99, background: A.green500, color: A.white, fontFamily: INTER, fontWeight: 800, fontSize: 18 }}>Job done ✓</div>
        </Flyer>
        {/* escrow release coin */}
        <Flyer f={f} a={1374} b={1394} from={dp(hoP, 180, 250)} to={dp(spP, 110, 130)} arc={-260} scaleMid={1.6}><Coin /></Flyer>
        {/* review star */}
        <Flyer f={f} a={1500} b={1505} from={dp(hoP, 180, 330)} to={dp(spP, 270, 300)} arc={-160} scaleMid={1.5} trail={3}>
          <Star size={64} color="#f59e0b" fill="#f59e0b" />
        </Flyer>
        {[668, 903, 1045, 1394, 1505].map((t) => {
          const target = t === 903 ? dp(hoP, 180, 390) : t === 668 ? dp(spP, 180, 300) : t === 1045 ? dp(spP, 296, 80) : t === 1394 ? dp(spP, 110, 130) : dp(spP, 270, 300);
          if (f < t || f > t + 22) return null;
          const p = tw(f, t, t + 20, 0, 1, expoOut);
          return (
            <div key={t} style={{ position: 'absolute', left: target.x - 160 * p, top: target.y - 160 * p, width: 320 * p, height: 320 * p, borderRadius: 999, border: `${6 * (1 - p) + 1}px solid ${A.cyan500}`, opacity: 1 - p }} />
          );
        })}
      </AbsoluteFill>
      {/* particles for ambience */}
      {Array.from({ length: 14 }, (_, i) => {
        const x = ((noise(i) + 1) / 2) * 1920;
        const y = (((noise(i * 3) + 1) / 2) * 1080 - f * (0.3 + ((noise(i * 7) + 1) / 2) * 0.6) + 2000) % 1080;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 6, height: 6, borderRadius: 6, background: x < d ? 'rgba(8,145,178,0.35)' : 'rgba(153,222,241,0.35)' }} />;
      })}
    </AbsoluteFill>
  );
};

export { interpolate, CLAMP, Banknote, Send };
