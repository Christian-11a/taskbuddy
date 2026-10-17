import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { interpolatePath } from '@remotion/paths';
import { Check, Lock, LockOpen, User, Wrench } from 'lucide-react';
import { C, INTER } from '../theme';
import { BOUNCY, CLAMP, expoIn, expoOut, inOut, hit, hits, shake, sp, tw } from '../motion';
import { Burst, Headline, Pill, Rings, countUp, peso } from '../components/ui';

// 420–540 (bars 7–8). Escrow: circle morphs into a shield, the payment coin
// flies in and is held, the job is ticked done, the coin is released.
const CIRCLE = 'M 0 -190 C 105 -190 190 -105 190 0 C 190 105 105 190 0 190 C -105 190 -190 105 -190 0 C -190 -105 -105 -190 0 -190 Z';
const SHIELD = 'M 0 -215 C 60 -175 130 -165 185 -165 C 185 -20 170 125 0 225 C -170 125 -185 -20 -185 -165 C -130 -165 -60 -175 0 -215 Z';
const CX = 540, CY = 900;
const LX = 150, RX = 930;

export const S4Pay: React.FC = () => {
  const f = useCurrentFrame();
  const exit = tw(f, 108, 120, 0, 1, expoIn);
  const kicks = hits(f, [0, 15, 30, 45, 60, 75, 90, 105], 4);
  const cam = shake(f, 45, 16, 4);
  const cam2 = shake(f, 105, 18, 4);

  const pop = sp(f, 0, BOUNCY);
  const morph = tw(f, 6, 20, 0, 1, inOut);
  const shieldPath = interpolatePath(morph, CIRCLE, SHIELD);
  const released = f >= 90;
  const paid = f >= 105;

  // coin 1: left node → shield (arrives on beat 3 = 45)
  const c1 = tw(f, 30, 45, 0, 1, inOut);
  // coin 2: shield → provider (90 → 105 clap)
  const c2 = tw(f, 90, 105, 0, 1, inOut);
  const coin = (p: number, from: number, to: number) => ({
    x: interpolate(p, [0, 1], [from, to]),
    y: CY - Math.sin(p * Math.PI) * 260,
  });
  const k1 = coin(c1, LX, CX);
  const k2 = coin(c2, CX, RX);

  const node = (x: number, at: number, Icon: typeof User, label: string, flash: number) => {
    const p = sp(f, at, BOUNCY);
    return (
      <div style={{ position: 'absolute', left: x - 80, top: CY - 80, width: 160, textAlign: 'center', transform: `scale(${p * (1 + flash * 0.2)})` }}>
        <div style={{ width: 160, height: 160, borderRadius: 99, background: C.white, border: `6px solid ${flash > 0.05 ? C.green : C.line}`, display: 'grid', placeItems: 'center', boxShadow: '0 20px 40px rgba(6,61,77,0.12)' }}>
          <Icon size={72} color={C.brandTeal} strokeWidth={2.2} />
        </div>
        <div style={{ fontFamily: INTER, fontWeight: 800, fontSize: 30, color: C.ink500, marginTop: 14 }}>{label}</div>
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ background: C.canvas, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 47%, ${C.cyan100}, rgba(247,249,251,0) 55%)`, opacity: 0.8 + kicks * 0.2 }} />
      <div style={{ position: 'absolute', top: 160, width: '100%', transform: `translateY(${-exit * 400}px)` }}>
        <Headline f={f} at={1} size={128} words={[[{ t: 'Pay', c: C.ink900 }, { t: 'with', c: C.ink900 }], [{ t: 'peace', c: C.brandCyan }, { t: 'of', c: C.brandCyan }, { t: 'mind', c: C.brandCyan }]]} />
      </div>

      <AbsoluteFill style={{ transform: `translate(${cam.x + cam2.x}px, ${cam.y + cam2.y}px) scale(${1 - exit * 0.3})`, opacity: 1 - exit }}>
        {/* connectors */}
        <svg width={1080} height={1920} style={{ position: 'absolute' }}>
          {[
            { x1: LX + 90, x2: CX - 200, p: tw(f, 20, 34) },
            { x1: CX + 200, x2: RX - 90, p: tw(f, 26, 40) },
          ].map((l, i) => (
            <line key={i} x1={l.x1} y1={CY} x2={l.x1 + (l.x2 - l.x1) * l.p} y2={CY} stroke={C.ink300} strokeWidth={6} strokeDasharray="4 16" strokeLinecap="round" />
          ))}
        </svg>
        {node(LX, 11, User, 'You', 0)}
        {node(RX, 22, Wrench, 'Provider', paid ? hit(f, 105, 8) + 0.06 : 0)}

        {/* shield */}
        <svg width={1080} height={1920} style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="sh" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={C.brandCyan} />
              <stop offset="1" stopColor={C.brandTeal} />
            </linearGradient>
          </defs>
          <g transform={`translate(${CX} ${CY}) scale(${pop * (1 + kicks * 0.035 + hit(f, 45, 4) * 0.08)})`}>
            <path d={shieldPath} fill="url(#sh)" />
            <path d={shieldPath} fill="none" stroke={C.brandCyanLight} strokeWidth={10} opacity={0.5} transform="scale(1.1)" />
          </g>
        </svg>
        <div style={{ position: 'absolute', left: CX - 70, top: CY - 80, width: 140, height: 140, display: 'grid', placeItems: 'center', transform: `scale(${sp(f, 18, BOUNCY) * (1 + hit(f, 90, 5) * 0.3)}) rotate(${released ? -12 * hit(f, 90, 8) : 0}deg)` }}>
          {released ? <LockOpen size={130} color={C.white} strokeWidth={2.4} /> : <Lock size={130} color={C.white} strokeWidth={2.4} />}
        </div>
        <Rings f={f} at={45} x={CX} y={CY} color={C.brandCyan} max={420} count={2} />
        <Rings f={f} at={105} x={RX} y={CY} color={C.green} max={260} count={2} />

        {/* coins */}
        {[
          { k: k1, show: f >= 30 && f < 46, s: 1 - tw(f, 42, 46) },
          { k: k2, show: f >= 90 && f < 107, s: 1 - tw(f, 103, 107) },
        ].map((c, i) =>
          c.show ? (
            <div key={i} style={{ position: 'absolute', left: c.k.x - 58, top: c.k.y - 58, width: 116, height: 116, borderRadius: 99, background: `linear-gradient(135deg, #fcd34d, ${C.amber})`, color: C.white, display: 'grid', placeItems: 'center', fontFamily: INTER, fontSize: 64, fontWeight: 900, transform: `scale(${c.s}) rotate(${f * 12}deg)`, boxShadow: '0 16px 30px rgba(245,158,11,0.45)' }}>
              ₱
            </div>
          ) : null,
        )}
        <Burst f={f} at={105} x={RX} y={CY} n={18} radius={240} colors={[C.green, C.amber, C.brandCyan]} size={18} />

        {/* amount + status */}
        <div style={{ position: 'absolute', top: 1190, width: '100%', textAlign: 'center', fontFamily: INTER }}>
          <div style={{ fontSize: 132, fontWeight: 900, color: C.ink900, letterSpacing: '-0.04em', opacity: tw(f, 4, 10) }}>{peso(countUp(f, 4, 44, 1500))}</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, transform: `scale(${sp(f, 45, BOUNCY) * (1 + hit(f, 105, 5) * 0.2)})` }}>
            {paid ? <Pill label="Released to provider" color={C.green} bg="#dcfce7" dot size={34} /> : <Pill label="Held until the job is done" color="#92400e" bg="#fef3c7" dot size={34} />}
          </div>
        </div>

        {/* job done tick */}
        <div
          style={{
            position: 'absolute', left: 170, right: 170, top: 1500, height: 140, borderRadius: 36, background: C.white,
            border: `3px solid ${f >= 75 ? C.green : C.line}`, display: 'flex', alignItems: 'center', gap: 26, padding: '0 36px',
            fontFamily: INTER, fontSize: 40, fontWeight: 800, color: C.ink900, boxShadow: '0 20px 40px rgba(6,61,77,0.1)',
            transform: `translateY(${(1 - sp(f, 60, { damping: 15, stiffness: 200, mass: 0.6 })) * 500}px) scale(${1 + hit(f, 75, 4) * 0.06})`,
          }}
        >
          <div style={{ width: 72, height: 72, borderRadius: 20, background: f >= 75 ? C.green : C.ink100, display: 'grid', placeItems: 'center' }}>
            <Check size={50} color={C.white} strokeWidth={3.4} style={{ transform: `scale(${sp(f, 75, BOUNCY)})` }} />
          </div>
          Job marked as done
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
