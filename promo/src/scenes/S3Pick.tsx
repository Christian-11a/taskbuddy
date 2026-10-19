import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BadgeCheck, Star } from 'lucide-react';
import { C, INTER } from '../theme';
import { BOUNCY, expoIn, expoOut, hit, hits, shake, sp, spVel, squash, tw } from '../motion';
import { Burst, Headline, Pill } from '../components/ui';

// 300–420 (bars 5–6). Proposals deal in on the kicks, a highlight scans on
// eighths and locks on the clap, the others fall away, chat pops on beat.
const PROS = [
  { name: 'Juan D.', ini: 'JD', color: C.amber, rating: '4.7', jobs: 21, price: '₱1,300' },
  { name: 'Maria S.', ini: 'MS', color: C.cyan600, rating: '4.9', jobs: 38, price: '₱1,450' },
  { name: 'Ramon T.', ini: 'RT', color: C.purple, rating: '4.8', jobs: 27, price: '₱1,600' },
];
const Y = [620, 900, 1180];
const PICK = 1;

export const S3Pick: React.FC = () => {
  const f = useCurrentFrame();
  const exit = tw(f, 108, 120, 0, 1, expoIn);
  const push = tw(f, 45, 75, 1, 1.05, expoOut);
  const cam = shake(f, 75, 20, 4);
  const scan = f < 60 ? -1 : f < 67 ? 0 : f < 75 ? 2 : 1;
  const locked = f >= 75;
  const center = sp(f, 88, { damping: 16, stiffness: 170, mass: 0.7 });

  return (
    <AbsoluteFill style={{ background: C.brandDark, overflow: 'hidden' }}>
      {/* parallax dot grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${C.brandTeal} 3px, transparent 3.5px)`, backgroundSize: '56px 56px',
          backgroundPosition: `${-f * 1.2}px ${-f * 2}px`, opacity: 0.8,
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 55%, rgba(10,162,203,0.35), rgba(6,61,77,0) 60%)`, opacity: 0.6 + hits(f, [0, 15, 30, 45, 60, 75, 90, 105], 5) * 0.4 }} />

      <div style={{ position: 'absolute', top: 150, width: '100%', transform: `translateY(${-exit * 400}px)` }}>
        <Headline f={f} at={1} size={128} words={[[{ t: 'Pick', c: C.white }, { t: 'the', c: C.white }], [{ t: 'right', c: C.brandCyan }, { t: 'provider', c: C.brandCyan }]]} />
      </div>

      <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${push * (1 - exit * 0.4)})`, opacity: 1 - exit, perspective: 2000 }}>
        {PROS.map((p, i) => {
          const d = sp(f, i * 15, { damping: 14, stiffness: 180, mass: 0.7 });
          const dv = squash(spVel(f, i * 15, { damping: 14, stiffness: 180, mass: 0.7 }), 0.6);
          const isPick = i === PICK;
          const fall = !isPick ? Math.max(0, f - 80 - i * 2) : 0;
          const lit = scan === i;
          const y = isPick ? Y[i] + (680 - Y[i]) * center : Y[i] + fall * fall * 2.4;
          const s = isPick ? 1 + center * 0.08 + hit(f, 75, 4) * 0.06 : 1;
          return (
            <div
              key={p.name}
              style={{
                position: 'absolute', left: 90, top: y, width: 900, height: 240, borderRadius: 40, background: C.white,
                transform: `translateX(${(1 - d) * 1300}px) rotate(${(1 - d) * 18 + (!isPick ? fall * (i ? 1.1 : -1.1) : 0)}deg) scale(${s * dv.sy}, ${s * dv.sx})`,
                opacity: !isPick ? 1 - tw(f, 84, 100) : 1,
                boxShadow: lit || (isPick && locked)
                  ? `0 0 0 8px ${C.brandCyan}, 0 30px 70px rgba(10,162,203,0.45)`
                  : '0 26px 60px rgba(0,0,0,0.3)',
                display: 'flex', alignItems: 'center', padding: '0 40px', gap: 34, fontFamily: INTER,
                zIndex: isPick ? 2 : 1,
              }}
            >
              <div style={{ width: 138, height: 138, borderRadius: 99, background: p.color, color: C.white, display: 'grid', placeItems: 'center', fontSize: 52, fontWeight: 900, flexShrink: 0 }}>
                {p.ini}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 46, fontWeight: 800, color: C.ink900 }}>
                  {p.name} <BadgeCheck size={40} color={C.brandCyan} strokeWidth={2.4} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 30, fontWeight: 700, color: C.ink500 }}>
                  <Star size={32} color={C.amber} fill={C.amber} /> {p.rating} · {p.jobs} jobs done
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 50, fontWeight: 900, color: C.brandTeal }}>{p.price}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.ink400 }}>proposal</div>
              </div>
              {isPick && (
                <div
                  style={{
                    position: 'absolute', right: -24, top: -44,
                    transform: `scale(${locked ? 1 + (1 - sp(f, 75, { damping: 12, stiffness: 320, mass: 0.6 })) * 2.2 : 0}) rotate(${-8 + (1 - sp(f, 75)) * -20}deg)`,
                    opacity: locked ? 1 : 0,
                  }}
                >
                  <Pill label="HIRED" color={C.white} bg={C.green} size={40} style={{ boxShadow: '0 12px 30px rgba(34,197,94,0.5)', letterSpacing: '0.04em' }} />
                </div>
              )}
            </div>
          );
        })}
        <Burst f={f} at={75} x={900} y={Y[PICK] - 10} n={20} radius={340} colors={[C.green, C.brandCyanLight, C.white, C.amber]} size={20} />

        {/* chat */}
        {[
          { at: 90, me: false, t: 'Hi! I can be there tomorrow at 9.' },
          { at: 105, me: true, t: 'Perfect, see you!' },
        ].map((m, k) => {
          const p = sp(f, m.at, BOUNCY);
          return (
            <div
              key={k}
              style={{
                position: 'absolute', top: 990 + k * 150, [m.me ? 'right' : 'left']: 110,
                background: m.me ? C.brandCyan : C.white, color: m.me ? C.white : C.ink900,
                fontFamily: INTER, fontSize: 38, fontWeight: 700, padding: '28px 38px',
                borderRadius: 40, [m.me ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 10,
                transform: `scale(${p})`, transformOrigin: m.me ? '100% 100%' : '0% 100%',
                boxShadow: '0 18px 40px rgba(0,0,0,0.25)',
              }}
            >
              {m.t}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
