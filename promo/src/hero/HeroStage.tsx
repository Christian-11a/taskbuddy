import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CalendarCheck, CircleCheck, MessageCircle, Star } from 'lucide-react';
import { INTER } from '../theme';
import { expoOut, hit, inOut, noise, sp, tw } from '../motion';
import { peso } from '../components/ui';
import { Avatar, DW, Phone, T, phoneH } from './ui';
import { ClientPhone } from './ClientPhone';
import { ProviderPhone } from './ProviderPhone';
import { CHAT, JOB, K, PRO } from './story';

// Two phones side by side, one continuous take. Client on the light Sky side, provider on the navy side.
const PW = 456;
const PH = phoneH(PW);
type PS = { x: number; y: number; ry: number };
const HO: PS = { x: 540, y: 566, ry: 6 };
const SP: PS = { x: 1380, y: 566, ry: -6 };
const KK = (PW * (1 - 0.044)) / DW;
/** dp point on a phone → stage pixels (ignores the small rotation). */
const dp = (ps: PS, x: number, y: number) => ({ x: ps.x + (-PW / 2 + PW * 0.022 + x * KK), y: ps.y + (-PH / 2 + PW * 0.022 + y * KK) });

type Cap = { at: number; out: number; a: string; b: string };
export const CAPS: Cap[] = [
  { at: 0, out: 130, a: 'Verified', b: 'providers.' },
  { at: 138, out: 318, a: 'Post a job', b: 'in a minute.' },
  { at: 326, out: 482, a: 'Proposals', b: 'roll in.' },
  { at: 490, out: 586, a: 'Pay when', b: 'you hire.' },
  { at: 594, out: 640, a: 'Booking', b: 'confirmed.' },
  { at: 650, out: 740, a: 'Chat in', b: 'real time.' },
  { at: 750, out: 826, a: 'Tick off', b: 'each task.' },
  { at: 834, out: 896, a: 'Paid when', b: 'you confirm.' },
  { at: 906, out: 1032, a: 'Rate', b: 'the work.' },
];

const Caption: React.FC<{ f: number; c: Cap }> = ({ f, c }) => {
  // the first caption is already on screen at frame 0 so the loop has no gap
  const at = c.at === 0 ? -30 : c.at;
  if (f < at || f > c.out + 12) return null;
  const outP = tw(f, c.out, c.out + 10, 0, 1, (t) => t * t);
  const size = Math.min(56, 600 / Math.max(c.a.length, c.b.length));
  return (
    <div style={{ position: 'absolute', left: 960 - 190, top: 480, width: 380, textAlign: 'center', fontFamily: INTER }}>
      {[c.a, c.b].map((w, i) => {
        const p = sp(f, at + 2 + i * 4, { damping: 15, stiffness: 190, mass: 0.7 });
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: size * 0.12, marginBottom: -size * 0.12, position: 'relative' }}>
            <div style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: i ? '#7DD3FC' : T.white, transform: `translateY(${(1 - p) * 110 - outP * 110}%)` }}>{w}</div>
          </div>
        );
      })}
    </div>
  );
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const Flyer: React.FC<{ f: number; a: number; b: number; from: { x: number; y: number }; to: { x: number; y: number }; arc?: number; scaleMid?: number; trail?: number; children: React.ReactNode }> = ({ f, a, b, from, to, arc = -200, scaleMid = 1.2, trail = 4, children }) => {
  if (f < a - 1 || f > b + 2) return null;
  const at = (g: number) => {
    const t = tw(g, a, b, 0, 1, inOut);
    return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * arc, s: 1 + Math.sin(t * Math.PI) * (scaleMid - 1), r: Math.sin(t * Math.PI) * (to.x > from.x ? 7 : -7), t };
  };
  const land = hit(f, b, 3);
  return (
    <>
      {Array.from({ length: trail }, (_, k) => trail - k).map((k) => {
        const p = at(f - k * 1.2);
        if (p.t <= 0 || p.t >= 1) return null;
        return <div key={k} style={{ position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%,-50%) scale(${p.s}) rotate(${p.r}deg)`, opacity: (0.12 * (trail - k + 1)) / trail, filter: 'blur(2px)' }}>{children}</div>;
      })}
      {(() => {
        const p = at(f);
        return <div style={{ position: 'absolute', left: p.x, top: p.y, transform: `translate(-50%,-50%) scale(${p.s * (1 - land * 0.2)}) rotate(${p.r}deg)`, opacity: f > b ? 0 : 1, filter: 'drop-shadow(0 22px 28px rgba(0,0,0,0.32))' }}>{children}</div>;
      })()}
    </>
  );
};
const Ring: React.FC<{ f: number; at: number; p: { x: number; y: number }; color?: string }> = ({ f, at, p, color = '#38BDF8' }) => {
  if (f < at || f > at + 22) return null;
  const t = tw(f, at, at + 20, 0, 1, expoOut);
  return <div style={{ position: 'absolute', left: p.x - 150 * t, top: p.y - 150 * t, width: 300 * t, height: 300 * t, borderRadius: 999, border: `${6 * (1 - t) + 1}px solid ${color}`, opacity: 1 - t }} />;
};

const pill = (bg: string, color: string, children: React.ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderRadius: 99, background: bg, color, fontFamily: INTER, fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</div>
);

export const HeroStage: React.FC<{ f: number }> = ({ f }) => {
  const d = 960;
  const drift = Math.sin(f / 90) * 3;
  const zoom = 1.006 + Math.sin(f / 140) * 0.006;
  const bob = (k: number) => Math.sin(f / 46 + k) * 3;
  const ho = { ...HO, y: HO.y + bob(0) };
  const spp = { ...SP, y: SP.y + bob(2) };
  const place = (ps: PS, node: React.ReactNode, label: string, bg: string, color: string) => (
    <div style={{ position: 'absolute', left: ps.x - PW / 2, top: ps.y - PH / 2, width: PW, height: PH, transform: `perspective(2200px) rotateY(${ps.ry}deg)` }}>
      <div style={{ position: 'absolute', top: -54, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '7px 18px', borderRadius: 99, background: bg, color, fontFamily: INTER, fontWeight: 800, fontSize: 17, letterSpacing: '0.16em' }}>{label}</div>
      </div>
      <Phone w={PW}>{node}</Phone>
    </div>
  );
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#0B1826' }}>
      {/* provider navy side */}
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 74% 42%, #21405F 0%, #13283C 52%, #0B1826 100%)' }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(125,211,252,0.16) 1.5px, transparent 2px)', backgroundSize: '44px 44px', backgroundPosition: `${-f * 0.5}px ${-f * 0.25}px` }} />
      {/* client sky side */}
      <AbsoluteFill style={{ clipPath: `polygon(0 0, ${d + 110}px 0, ${d - 110}px 100%, 0 100%)`, background: 'radial-gradient(circle at 26% 42%, #0B8BD3 0%, #0369A1 50%, #075985 100%)' }}>
        <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.16) 1.5px, transparent 2px)', backgroundSize: '44px 44px', backgroundPosition: `${f * 0.5}px ${-f * 0.25}px` }} />
      </AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}><line x1={d + 110} y1={0} x2={d - 110} y2={1080} stroke="#7DD3FC" strokeWidth={4} opacity={0.9} /></svg>

      <AbsoluteFill style={{ transform: `translateY(${drift}px) scale(${zoom})` }}>
        {place(ho, <ClientPhone f={f} />, 'CLIENT', T.white, T.sky)}
        {place(spp, <ProviderPhone f={f} />, 'PROVIDER', "#D0DAE5", T.navy)}
        <div style={{ position: 'absolute', left: 960 - 196, top: 454, width: 392, height: 172, borderRadius: 32, background: 'rgba(12,30,48,0.86)', backdropFilter: 'blur(10px)', border: '1px solid rgba(186,230,253,0.22)', boxShadow: '0 30px 60px rgba(4,16,28,0.35)' }} />
        {CAPS.map((c, i) => <Caption key={i} f={f} c={c} />)}

        {/* job card: client → provider feed */}
        <Flyer f={f} a={K.jobFly} b={K.jobLand} from={dp(ho, 205, 300)} to={dp(spp, 205, 634)}>
          <div style={{ width: 340, background: T.surface, borderRadius: 16, padding: '14px 16px', fontFamily: INTER, color: T.ink900, boxShadow: '0 0 0 3px #38BDF8' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.sky, letterSpacing: 0.6 }}>NEW JOB · PLUMBING</div>
            <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4 }}>{JOB.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 15, color: T.ink500 }}><span>Tomorrow · 1.2 km away</span><b style={{ color: T.ink900 }}>{peso(JOB.price)}</b></div>
          </div>
        </Flyer>
        {/* proposal: provider → client */}
        <Flyer f={f} a={K.propFly} b={K.propLand} from={dp(spp, 205, 820)} to={dp(ho, 205, 500)} arc={180}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: T.surface, borderRadius: 20, padding: '13px 20px', fontFamily: INTER, boxShadow: '0 0 0 3px #38BDF8' }}>
            <Avatar ini={PRO.ini} size={46} />
            <div><div style={{ fontSize: 18, fontWeight: 700 }}>New proposal</div><div style={{ fontSize: 15, color: T.ink500 }}>{PRO.name} · ★ 4.8</div></div>
          </div>
        </Flyer>
        {/* booking: client → provider */}
        <Flyer f={f} a={K.bookFly} b={K.bookLand} from={dp(ho, 205, 300)} to={dp(spp, 205, 300)}>
          {pill(T.okSolid, T.white, <><CalendarCheck size={22} /> Booking confirmed</>)}
        </Flyer>
        {/* chat bubbles */}
        {CHAT.map((m, i) => {
          const fromC = m.from === 'c';
          return (
            <Flyer key={i} f={f} a={m.at} b={m.at + 8} from={dp(fromC ? ho : spp, 340, 300 + i * 64)} to={dp(fromC ? spp : ho, 70, 300 + i * 64)} arc={-80} scaleMid={1.1} trail={3}>
              <div style={{ width: 56, height: 56, borderRadius: 56, background: fromC ? T.sky : T.navy, display: 'grid', placeItems: 'center', border: '3px solid #fff' }}><MessageCircle size={27} color={T.white} /></div>
            </Flyer>
          );
        })}
        {/* tasks done: provider → client */}
        <Flyer f={f} a={K.doneFly} b={K.doneLand} from={dp(spp, 205, 660)} to={dp(ho, 205, 300)} arc={-130} scaleMid={1.1} trail={3}>
          {pill(T.okSolid, T.white, <><CircleCheck size={21} /> All tasks done</>)}
        </Flyer>
        {/* payment released: client → provider earnings */}
        <Flyer f={f} a={K.coinFly} b={K.coinLand} from={dp(ho, 205, 300)} to={dp(spp, 110, 280)} arc={-250} scaleMid={1.55}>
          <div style={{ width: 84, height: 84, borderRadius: 84, background: 'linear-gradient(135deg, #FDE68A, #F59E0B)', display: 'grid', placeItems: 'center', color: T.white, fontFamily: INTER, fontSize: 44, fontWeight: 900, border: '4px solid #FEF3C7' }}>₱</div>
        </Flyer>
        {/* review star */}
        <Flyer f={f} a={K.starFly} b={K.starLand} from={dp(ho, 205, 346)} to={dp(spp, 205, 372)} arc={-160} scaleMid={1.5} trail={3}>
          <Star size={66} color={T.amber} fill={T.amber} />
        </Flyer>
        <Ring f={f} at={K.jobLand} p={dp(spp, 205, 634)} />
        <Ring f={f} at={K.propLand} p={dp(ho, 205, 500)} />
        <Ring f={f} at={K.bookLand} p={dp(spp, 205, 300)} color="#4ADE80" />
        <Ring f={f} at={K.doneLand} p={dp(ho, 205, 300)} color="#4ADE80" />
        <Ring f={f} at={K.coinLand} p={dp(spp, 110, 280)} color="#FCD34D" />
        <Ring f={f} at={K.starLand} p={dp(spp, 205, 372)} color="#FCD34D" />
      </AbsoluteFill>
      {Array.from({ length: 14 }, (_, i) => {
        const x = ((noise(i) + 1) / 2) * 1920;
        const y = ((((noise(i * 3) + 1) / 2) * 1080 - f * (0.3 + ((noise(i * 7) + 1) / 2) * 0.6)) % 1080 + 1080) % 1080;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 6, height: 6, borderRadius: 6, background: x < d ? 'rgba(255,255,255,0.3)' : 'rgba(186,230,253,0.32)' }} />;
      })}
    </AbsoluteFill>
  );
};
