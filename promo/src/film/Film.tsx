import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { BadgeCheck, Check, CircleCheck, IdCard, Lock, MapPin, ShieldCheck, Star, UserRound, Wrench } from 'lucide-react';
import { INTER } from '../theme';
import { expoOut, hit, inOut, noise, sp, tw } from '../motion';
import { peso } from '../components/ui';
import { Phone, T } from '../hero/ui';
import { ShowTaps } from '../v2/kit';
import { ClientPhone } from '../hero/ClientPhone';
import { ProviderPhone } from '../hero/ProviderPhone';
import { JOB, K, PRO } from '../hero/story';

// 60 s promo film, 30 fps, 1920x1080. Voice-over: ElevenLabs "Rachelle" (v4), one line per scene,
// cut from public/film-vo.mp3 at the silences. Music: public/music60.wav under the voice.
export const FILM_FRAMES = 1800;
const S = (s: number) => Math.round(s * 30);

// [vo start s, vo end s, film start s]
const VO: [number, number, number][] = [
  [0.0, 3.95, 0.5], [4.38, 7.3, 5.3], [7.65, 12.5, 9.4], [12.97, 15.62, 18.3], [15.95, 20.82, 22.4], [21.15, 25.2, 29.4],
  [25.46, 29.3, 35.4], [29.74, 33.45, 41.6], [33.77, 36.68, 48.3], [37.02, 40.2, 52.2], [40.57, 43.6, 56.3],
];

const SKY = '#0369A1';
const SKY2 = '#0284C7';
const Kw: React.FC<{ children: React.ReactNode; light?: boolean }> = ({ children, light }) => <span style={{ color: light ? '#7DD3FC' : SKY2 }}>{children}</span>;

// ── Backgrounds ────────────────────────────────────────────────────────────
const Airy: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ background: '#F7FAFD' }}>
    <div style={{ position: 'absolute', left: -200 + Math.sin(f / 80) * 40, top: -260, width: 900, height: 900, borderRadius: 900, background: 'radial-gradient(circle, rgba(186,230,253,0.55), rgba(186,230,253,0) 70%)' }} />
    <div style={{ position: 'absolute', right: -260, bottom: -320 + Math.cos(f / 90) * 40, width: 1000, height: 1000, borderRadius: 1000, background: 'radial-gradient(circle, rgba(224,242,254,0.9), rgba(224,242,254,0) 70%)' }} />
    <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(3,105,161,0.07) 1.5px, transparent 2px)', backgroundSize: '40px 40px' }} />
  </AbsoluteFill>
);
const Blue: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at ${50 + Math.sin(f / 70) * 6}% 40%, #0B8BD3 0%, #0369A1 45%, #0C4A6E 100%)` }}>
    <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.10) 1.5px, transparent 2px)', backgroundSize: '40px 40px' }} />
  </AbsoluteFill>
);

/** Headline that rises in word by word. */
const Head: React.FC<{ f: number; at?: number; children: React.ReactNode[]; size?: number; y?: number; light?: boolean; x?: number; align?: 'center' | 'left'; w?: number }> = ({ f, at = 4, children, size = 76, y = 92, light, x = 960, align = 'center', w = 1600 }) => (
  <div style={{ position: 'absolute', top: y, left: align === 'center' ? x - w / 2 : x, width: w, textAlign: align, fontFamily: INTER, fontWeight: 800, fontSize: size, letterSpacing: '-0.035em', lineHeight: 1.1, color: light ? T.white : T.ink900 }}>
    {children.map((c, i) => {
      const p = sp(f, at + i * 3, { damping: 16, stiffness: 180, mass: 0.7 });
      return <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>{c}</span>;
    })}
  </div>
);

type Focus = { hero: [number, number]; y: number; s: number };
const Floating: React.FC<{ f: number; x: number; y: number; w: number; rot?: number; children: React.ReactNode; at?: number; k?: number; zoom?: number; originY?: number; label?: { text: string; bg: string; color: string } }> = ({ f, x, y, w, rot = 0, children, at = 0, k = 0, zoom = 1, originY = 50, label }) => {
  const p = sp(f, at, { damping: 20, stiffness: 110, mass: 0.9 });
  return (
    <div style={{ position: 'absolute', left: x - w / 2, top: y + (1 - p) * 120 + Math.sin(f / 45 + k) * 5, transform: `perspective(2400px) rotateY(${rot * (1 - (zoom - 1) * 2)}deg) scale(${(0.94 + p * 0.06) * zoom})`, transformOrigin: `50% ${originY}%`, opacity: p }}>
      {label && <div style={{ position: 'absolute', top: -50, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}><div style={{ padding: '7px 18px', borderRadius: 99, background: label.bg, color: label.color, fontFamily: INTER, fontWeight: 800, fontSize: 17, letterSpacing: '0.16em' }}>{label.text}</div></div>}
      <Phone w={w}>{children}</Phone>
    </div>
  );
};

const Chip: React.FC<{ f: number; at: number; x: number; y: number; I: React.ComponentType<any>; label: string; tone?: 'ok' | 'sky' }> = ({ f, at, x, y, I, label, tone = 'ok' }) => {
  const p = sp(f, at, { damping: 12, stiffness: 200, mass: 0.6 });
  if (f < at) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${p})`, transformOrigin: 'left center', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px 16px 16px', borderRadius: 22, background: T.white, boxShadow: '0 20px 50px rgba(12,40,64,0.14)', fontFamily: INTER }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: tone === 'ok' ? T.okSurface : '#E0F2FE', display: 'grid', placeItems: 'center' }}><I size={26} color={tone === 'ok' ? T.okText : SKY} /></div>
      <span style={{ fontSize: 28, fontWeight: 700, color: T.ink900 }}>{label}</span>
      {tone === 'ok' && <div style={{ width: 30, height: 30, borderRadius: 15, background: T.okSolid, display: 'grid', placeItems: 'center', marginLeft: 6 }}><Check size={18} color={T.white} strokeWidth={3} /></div>}
    </div>
  );
};

// ── Scenes (local frame f) ─────────────────────────────────────────────────
const Hook: React.FC<{ f: number }> = ({ f }) => {
  const lines: [number, React.ReactNode][] = [[S(0.55), <>A leaking <Kw>sink.</Kw></>], [S(1.85), <>A busy <Kw>week.</Kw></>], [S(3.3), <>No one to <Kw>call.</Kw></>]];
  return (
    <AbsoluteFill>
      <Airy f={f} />
      <div style={{ position: 'absolute', left: 520, top: 330, fontFamily: INTER }}>
        {lines.map(([at, t], i) => {
          const p = sp(f, at, { damping: 15, stiffness: 190, mass: 0.7 });
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 34, marginBottom: 34, opacity: p, transform: `translateX(${(1 - p) * -60}px)` }}>
              <div style={{ width: 34 - i * 6, height: 34 - i * 6, borderRadius: 6, background: SKY2, transform: `scale(${p})` }} />
              <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: '-0.035em', color: T.ink900 }}>{t}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Static phones in the orbit: only settled screens (no slide in progress, no finger).
const ORBIT: { role: 'c' | 'p'; at: number }[] = [
  { role: 'c', at: 60 }, { role: 'p', at: 250 }, { role: 'c', at: 340 }, { role: 'p', at: 420 }, { role: 'c', at: 590 }, { role: 'p', at: 612 }, { role: 'c', at: 700 }, { role: 'p', at: 880 },
];
const Orbit: React.FC<{ f: number }> = ({ f }) => {
  const logo = S(1.6);
  const shrink = tw(f, logo - 6, logo + 14, 1, 0.55, inOut);
  return (
    <AbsoluteFill>
      <Airy f={f} />
      {ORBIT.map((o, i) => {
        const a = (i / ORBIT.length) * Math.PI * 2 + f / 60;
        const rx = 640 * shrink, ry = 330 * shrink;
        const x = 960 + Math.cos(a) * rx, y = 540 + Math.sin(a) * ry;
        const depth = (Math.sin(a) + 1) / 2;
        const p = sp(f, i * 2, { damping: 18, stiffness: 140, mass: 0.8 });
        return (
          <div key={i} style={{ position: 'absolute', left: x - 115, top: y - 250, zIndex: Math.round(depth * 10), transform: `scale(${(0.7 + depth * 0.4) * p}) rotate(${Math.cos(a) * -12}deg)`, opacity: 0.75 + depth * 0.25 }}>
            <ShowTaps.Provider value={false}><Phone w={230}>{o.role === 'c' ? <ClientPhone f={o.at} /> : <ProviderPhone f={o.at} />}</Phone></ShowTaps.Provider>
          </div>
        );
      })}
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 20, fontFamily: INTER }}>
        {f < logo ? (
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: '-0.04em', color: T.ink900, opacity: tw(f, 6, 14) }}>One <Kw>app.</Kw></div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 26, transform: `scale(${sp(f, logo, { damping: 12, stiffness: 160, mass: 0.7 })})`, padding: '28px 44px', borderRadius: 40, background: 'rgba(255,255,255,0.85)', boxShadow: '0 30px 80px rgba(12,40,64,0.16)' }}>
            <Img src={staticFile('taskbuddy-logo.png')} style={{ width: 110, height: 110, borderRadius: 28 }} />
            <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: '-0.045em', color: T.ink900 }}>Task<Kw>Buddy</Kw></div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// Map of Lipa City: abstract roads, a job pin, nearby providers light up.
const PROVIDERS = [[-330, -150, '1.2 km'], [300, -190, '2.0 km'], [360, 150, '0.8 km'], [-280, 190, '1.6 km']] as const;
const MapScene: React.FC<{ f: number }> = ({ f }) => {
  const pin = sp(f, 8, { damping: 9, stiffness: 160, mass: 0.7 });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: '#EEF5FA' }} />
      <svg width={1920} height={1080} style={{ position: 'absolute', transform: `scale(${1.08 - tw(f, 0, 110, 0, 0.08)})` }}>
        {[[0, 300, 1920, 360], [0, 720, 1920, 640], [380, 0, 520, 1080], [1300, 0, 1180, 1080], [0, 520, 1920, 560], [860, 0, 1000, 1080], [0, 960, 1920, 900]].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFFFFF" strokeWidth={i % 3 === 0 ? 34 : 18} strokeLinecap="round" />
        ))}
        <path d="M0 860 C 400 780, 700 960, 1100 880 S 1700 760, 1920 820" stroke="#BAE6FD" strokeWidth={46} fill="none" opacity={0.7} />
        {Array.from({ length: 26 }, (_, i) => <rect key={i} x={((noise(i) + 1) / 2) * 1800 + 40} y={((noise(i * 5) + 1) / 2) * 960 + 40} width={70 + (i % 3) * 30} height={50 + (i % 4) * 16} rx={10} fill="#DCEAF4" />)}
      </svg>
      <div style={{ position: 'absolute', left: 60, top: 60, padding: '10px 18px', borderRadius: 999, background: T.white, fontFamily: INTER, fontSize: 24, fontWeight: 700, color: T.ink700, display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 8px 20px rgba(12,40,64,0.08)' }}><MapPin size={22} color={SKY} /> Lipa City</div>
      {PROVIDERS.map(([dx, dy, d], i) => {
        const at = 30 + i * 8;
        const on = sp(f, at, { damping: 12, stiffness: 180, mass: 0.6 });
        const line = tw(f, at - 6, at + 6, 0, 1, expoOut);
        return (
          <React.Fragment key={i}>
            <svg width={1920} height={1080} style={{ position: 'absolute' }}><line x1={960} y1={540} x2={960 + dx * line} y2={540 + dy * line} stroke={SKY2} strokeWidth={4} strokeDasharray="10 10" opacity={0.6} /></svg>
            <div style={{ position: 'absolute', left: 960 + dx - 46, top: 540 + dy - 46, width: 92, height: 92, borderRadius: 46, background: T.white, boxShadow: `0 0 0 ${8 * on}px rgba(2,132,199,0.18), 0 14px 30px rgba(12,40,64,0.18)`, display: 'grid', placeItems: 'center', transform: `scale(${0.6 + on * 0.4})` }}>
              <Wrench size={40} color={T.navy} />
            </div>
            <div style={{ position: 'absolute', left: 960 + dx - 50, top: 540 + dy + 54, width: 100, textAlign: 'center', fontFamily: INTER, fontSize: 22, fontWeight: 700, color: T.ink700, opacity: on }}>{d}</div>
          </React.Fragment>
        );
      })}
      {[0, 1, 2].map((k) => { const t = ((f + k * 20) % 60) / 60; return <div key={k} style={{ position: 'absolute', left: 960 - 200 * t, top: 540 - 200 * t, width: 400 * t, height: 400 * t, borderRadius: 999, border: `3px solid rgba(2,132,199,${0.5 * (1 - t)})` }} />; })}
      <div style={{ position: 'absolute', left: 960 - 40, top: 540 - 100 - (1 - pin) * 300, transform: `scale(${pin})` }}><MapPin size={80} color={T.white} fill={SKY} strokeWidth={1.6} /></div>
      <div style={{ position: 'absolute', left: 960 - 190, top: 560, padding: '14px 22px', borderRadius: 18, background: T.white, boxShadow: '0 16px 40px rgba(12,40,64,0.16)', fontFamily: INTER, opacity: tw(f, 16, 24), transform: `translateY(${tw(f, 16, 28, 20, 0)}px)` }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: SKY, letterSpacing: 1 }}>NEW JOB · PLUMBING</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{JOB.title}</div>
      </div>
      <Head f={f} at={4} y={110}>{['Right', 'next', <Kw key="d">door.</Kw>]}</Head>
    </AbsoluteFill>
  );
};

// Screen changes inside the phones (slides, fades, sheets) play at real speed; only the calm parts between
// them are slowed, so a phone never shows half of two screens for long.
export const CUTS: Record<'c' | 'p', number[]> = {
  c: [K.cStep1, K.cStep2, K.cStep3, K.cStep4, K.cStep5, K.cWaiting, K.cProps, K.cHireSheet, K.cConfirmPage, K.cBooked, K.chat, K.work, K.paid, K.review],
  p: [K.pStep1, K.pStep2, K.pStep3, K.pStep4, K.pStep5, K.pPending, K.pFeed, K.pDetail, K.pSheet, K.pSent, K.pBooked, K.chat, K.work, K.proofSheet, K.proofDone, K.paid + 2, K.review],
};
export const FAST = 16;
type Warp = { heroAt: (l: number) => number; localAt: (h: number) => number };
export const makeWarp = (role: 'c' | 'p', from: number, to: number, dur: number): Warp => {
  const wins = CUTS[role].filter((c) => c >= from && c < to).map((c) => [c, Math.min(c + FAST, to)] as [number, number]);
  const fastLen = wins.reduce((n, [a, b]) => n + (b - a), 0);
  const slowHero = to - from - fastLen;
  const slowOut = dur - fastLen;
  // a range that is mostly one screen change would freeze on the old screen: play it evenly instead
  if (slowOut <= 1 || slowHero <= 0 || slowHero < (to - from) * 0.4) {
    return { heroAt: (l) => from + Math.min(1, Math.max(0, l / dur)) * (to - from), localAt: (h) => ((h - from) / (to - from)) * dur };
  }
  const rate = slowHero / slowOut;
  const pts: [number, number][] = [[0, from]];
  let l = 0;
  let h = from;
  for (const [a, b] of wins) {
    l += (a - h) / rate; h = a; pts.push([l, h]);
    l += b - a; h = b; pts.push([l, h]);
  }
  pts.push([dur, to]);
  const lerpPts = (x: number, xi: 0 | 1, yi: 0 | 1) => {
    if (x <= pts[0][xi]) return pts[0][yi];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][xi]) {
        const [x0, x1] = [pts[i - 1][xi], pts[i][xi]];
        const [y0, y1] = [pts[i - 1][yi], pts[i][yi]];
        return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      }
    }
    return pts[pts.length - 1][yi];
  };
  return { heroAt: (x) => lerpPts(x, 0, 1), localAt: (x) => lerpPts(x, 1, 0) };
};

type PhoneSpec = { role: 'c' | 'p'; from: number; to: number; dur: number; focus?: Focus };
type ChipSpec = { at: number; I: React.ComponentType<any>; label: string; tone?: 'ok' | 'sky' };
const PhoneScene: React.FC<{ f: number; head: React.ReactNode[]; sub?: string; phones: PhoneSpec[]; chips?: ChipSpec[]; light?: boolean }> = ({ f, head, sub, phones, chips = [], light }) => {
  const two = phones.length === 2;
  return (
    <AbsoluteFill>
      {light ? <Blue f={f} /> : <Airy f={f} />}
      <Head f={f} at={2} x={150} y={two ? 330 : 300} align="left" w={two ? 760 : 820} size={two ? 76 : 84} light={light}>{head}</Head>
      {sub && <div style={{ position: 'absolute', left: 150, top: two ? 520 : 500, width: 700, fontFamily: INTER, fontSize: 30, lineHeight: '42px', color: light ? 'rgba(255,255,255,0.85)' : T.ink500, opacity: tw(f, 14, 26), transform: `translateY(${tw(f, 14, 30, 16, 0)}px)` }}>{sub}</div>}
      {chips.map((c, i) => <Chip key={i} f={f} at={c.at} x={150} y={(two ? 620 : 600) + i * 108} I={c.I} label={c.label} tone={c.tone} />)}
      {phones.map((ph, i) => {
        const wp = makeWarp(ph.role, ph.from, ph.to, ph.dur);
        const hero = wp.heroAt(Math.min(ph.dur, Math.max(0, f)));
        let zoom = 1;
        if (ph.focus) {
          const za = wp.localAt(ph.focus.hero[0]);
          const zb = wp.localAt(ph.focus.hero[1]);
          zoom = 1 + (ph.focus.s - 1) * Math.min(tw(f, za - 12, za + 6, 0, 1, inOut), tw(f, zb - 6, zb + 12, 1, 0, inOut));
        }
        const w = two ? 380 : 440;
        const x = two ? (i ? 1590 : 1150) : 1300;
        const top = two ? 140 : 66;
        const lbl = two ? (ph.role === 'c' ? { text: 'CLIENT', bg: SKY, color: T.white } : { text: 'PROVIDER', bg: T.navy, color: T.white }) : undefined;
        return <Floating key={i} f={f} x={x} y={top} w={w} rot={two ? (i ? -6 : 6) : -6} at={i * 4} k={i * 2} zoom={zoom} originY={ph.focus ? (ph.focus.y / 914) * 100 : 50} label={lbl}>{ph.role === 'c' ? <ClientPhone f={hero} /> : <ProviderPhone f={hero} />}</Floating>;
      })}
    </AbsoluteFill>
  );
};

const Escrow: React.FC<{ f: number }> = ({ f }) => {
  const steps = ['Posted', 'Hired', 'Working', 'Done'];
  const n = f < 40 ? 1 : f < 80 ? 2 : 3;
  const released = f >= 120;
  const p = sp(f, 4, { damping: 16, stiffness: 140, mass: 0.8 });
  return (
    <AbsoluteFill>
      <Blue f={f} />
      <Head f={f} at={2} y={110} light>{['Held', <Kw key="s" light>safely</Kw>, 'until', "it's", 'done.']}</Head>
      <div style={{ position: 'absolute', left: 960 - 330, top: 330, width: 660, padding: 40, borderRadius: 36, background: T.white, boxShadow: '0 40px 100px rgba(4,20,40,0.35)', fontFamily: INTER, transform: `translateY(${(1 - p) * 120}px) scale(${0.92 + p * 0.08})`, opacity: p }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ width: 84, height: 84, borderRadius: 24, background: released ? T.okSurface : '#E0F2FE', display: 'grid', placeItems: 'center', transform: `scale(${1 + hit(f, 120, 6) * 0.2})` }}>{released ? <CircleCheck size={46} color={T.okText} /> : <Lock size={42} color={SKY} />}</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1.2, color: released ? T.okText : SKY }}>{released ? 'RELEASED' : 'HELD SAFELY'}</div>
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.03em' }}>{peso(JOB.price)}</div>
          </div>
        </div>
        <div style={{ fontSize: 26, color: T.ink700, marginTop: 18, lineHeight: '36px' }}>{released ? `Paid to ${PRO.name} as soon as the job was confirmed.` : 'Paid at hire with GCash, Maya, card or bank. Released when you confirm the job is done.'}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 30 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1 }}>
              <div style={{ height: 10, borderRadius: 5, background: i <= n ? (released ? T.okSolid : SKY) : T.line, transition: 'none' }} />
              <div style={{ fontSize: 20, fontWeight: i === n ? 700 : 500, color: i === n ? T.ink900 : T.ink500, marginTop: 10 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const End: React.FC<{ f: number }> = ({ f }) => {
  const p = sp(f, 4, { damping: 13, stiffness: 160, mass: 0.7 });
  const m = sp(f, 16, { damping: 12, stiffness: 140, mass: 0.8 });
  return (
    <AbsoluteFill>
      <Blue f={f} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: INTER, color: T.white }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, transform: `scale(${p})` }}>
          <Img src={staticFile('taskbuddy-logo.png')} style={{ width: 120, height: 120, borderRadius: 30, boxShadow: '0 16px 40px rgba(0,0,0,0.25)' }} />
          <div style={{ fontSize: 110, fontWeight: 800, letterSpacing: '-0.045em' }}>TaskBuddy</div>
        </div>
        <div style={{ fontSize: 54, fontWeight: 700, marginTop: 26, opacity: tw(f, 14, 24), transform: `translateY(${tw(f, 14, 28, 20, 0)}px)` }}>Everyday work, <Kw light>sorted.</Kw></div>
        <div style={{ marginTop: 44, padding: '22px 44px', borderRadius: 999, background: T.white, color: SKY, fontSize: 36, fontWeight: 800, transform: `scale(${sp(f, 26, { damping: 12, stiffness: 180, mass: 0.6 })})`, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>Get the app →</div>
      </div>
      <Img src={staticFile('mascot-wave.png')} style={{ position: 'absolute', right: 110, bottom: -30 + (1 - m) * 400, width: 420, height: 420, transform: `rotate(${(1 - m) * 12}deg)` }} />
    </AbsoluteFill>
  );
};

// ── Timeline ───────────────────────────────────────────────────────────────
type Scene = { from: number; to: number; render: (f: number) => React.ReactNode };
const SCENES: Scene[] = [
  { from: 0, to: S(5), render: (f) => <Hook f={f} /> },
  { from: S(5), to: S(9), render: (f) => <Orbit f={f} /> },
  { from: S(9), to: S(18), render: (f) => <PhoneScene f={f} head={['Post', 'a', 'job', 'in', 'a', <Kw key="m">minute.</Kw>]} sub="Pick a service, tick the tasks, choose one of three prices."
    phones={[{ role: 'c', from: 146, to: 320, dur: S(8.4), focus: { hero: [262, 292], y: 520, s: 1.28 } }]} /> },
  { from: S(18), to: S(22), render: (f) => <MapScene f={f} /> },
  { from: S(22), to: S(29), render: (f) => <PhoneScene f={f} head={['Every', 'provider,', <Kw key="v">verified.</Kw>]}
    phones={[{ role: 'p', from: 0, to: 168, dur: S(6.6), focus: { hero: [48, 66], y: 360, s: 1.22 } }]}
    chips={[{ at: S(2.0), I: IdCard, label: 'Valid ID' }, { at: S(2.9), I: UserRound, label: 'Selfie' }, { at: S(3.6), I: BadgeCheck, label: 'Certificate for the service' }]} /> },
  { from: S(29), to: S(35), render: (f) => <PhoneScene f={f} head={['Compare.', 'Then', <Kw key="h">hire.</Kw>]}
    phones={[{ role: 'c', from: 474, to: 570, dur: S(5.6), focus: { hero: [522, 562], y: 700, s: 1.22 } }]}
    chips={[{ at: S(1.2), I: Star, label: '4.8 · 38 jobs done', tone: 'sky' }, { at: S(2.0), I: ShieldCheck, label: 'Verified · Certified' }]} /> },
  { from: S(35), to: S(41), render: (f) => <Escrow f={f} /> },
  { from: S(41), to: S(48), render: (f) => <PhoneScene f={f} head={['Every', 'task,', 'ticked', 'with', <Kw key="p">proof.</Kw>]} sub="Chat in the app. Each task needs a photo before it is done."
    phones={[{ role: 'c', from: 654, to: 742, dur: S(6.4) }, { role: 'p', from: 750, to: 806, dur: S(6.4), focus: { hero: [762, 790], y: 760, s: 1.18 } }]} /> },
  { from: S(48), to: S(52), render: (f) => <PhoneScene f={f} head={['Confirm.', <Kw key="p">Paid.</Kw>]} sub="Released to the provider right away."
    phones={[{ role: 'c', from: 824, to: 856, dur: S(1.6) }, { role: 'p', from: 840, to: 884, dur: S(3.6) }]} /> },
  { from: S(52), to: S(56), render: (f) => <PhoneScene f={f} head={['Rate', 'the', <Kw key="w">work.</Kw>]}
    phones={[{ role: 'c', from: 916, to: 1000, dur: S(3.7), focus: { hero: [918, 962], y: 380, s: 1.2 } }]}
    chips={[{ at: S(1.4), I: Star, label: '5 stars · On time · Friendly', tone: 'sky' }]} /> },
  { from: S(56), to: FILM_FRAMES, render: (f) => <End f={f} /> },
];
const XF = 18;

export const Film: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#F7FAFD' }}>
      {SCENES.map((s, i) => {
        if (f < s.from - (i ? XF : 0) || f >= s.to) return null;
        const t = inOut(Math.min(1, Math.max(0, (f - (s.from - XF)) / XF)));
        const o = i > 0 ? t : 1;
        const len = s.to - s.from;
        const push = 1 + 0.025 * Math.min(1, Math.max(0, (f - s.from) / len));
        const exitOut = i < SCENES.length - 1 && f >= s.to - XF ? inOut((f - (s.to - XF)) / XF) : 0;
        return (
          <AbsoluteFill key={i} style={{ opacity: o, zIndex: i, transform: `scale(${push * (i > 0 ? 0.985 + 0.015 * t : 1) * (1 + exitOut * 0.02)})`, filter: exitOut > 0 ? `blur(${exitOut * 3}px)` : undefined }}>
            {s.render(f - s.from)}
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill style={{ background: '#000', opacity: interpolate(f, [FILM_FRAMES - 12, FILM_FRAMES], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), zIndex: 50 }} />
      {VO.map(([a, b, at], i) => (
        <Sequence key={i} from={S(at)} durationInFrames={S(b - a) + 4}>
          <Audio src={staticFile('film-vo.mp3')} trimBefore={S(a)} trimAfter={S(b)} />
        </Sequence>
      ))}
      <Audio src={staticFile('music60.wav')} volume={(fr) => {
        // duck smoothly under each voice line: ramps down before it and back up after it
        let env = 0;
        for (const [va, vb, at] of VO) {
          const st = S(at);
          const en = S(at + (vb - va));
          env = Math.max(env, interpolate(fr, [st - 14, st, en, en + 18], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
        }
        const fade = interpolate(fr, [0, 24, FILM_FRAMES - 50, FILM_FRAMES], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (0.42 - 0.34 * env) * fade;
      }} />
    </AbsoluteFill>
  );
};

