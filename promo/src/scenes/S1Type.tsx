import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Clock, Snowflake, Sparkles, Wrench } from 'lucide-react';
import { C, INTER } from '../theme';
import { BOUNCY, expoIn, expoOut, hit, shake, sp, spVel, squash, tw } from '../motion';

// 60–180 (bars 1–2). One problem per beat, each with its own type treatment,
// then "GET IT DONE." — the full stop becomes the next scene.
const PROBLEMS = [
  { a: 'LEAKY', b: 'PIPES?', bg: C.brandCyan, fg: C.brandDark, acc: C.white, Icon: Wrench },
  { a: 'MESSY', b: 'ROOMS?', bg: C.brandDark, fg: C.white, acc: C.brandCyan, Icon: Sparkles },
  { a: 'BROKEN', b: 'AIRCON?', bg: C.white, fg: C.brandDark, acc: C.brandCyan, Icon: Snowflake },
  { a: 'NO', b: 'TIME?', bg: C.brandTeal, fg: C.white, acc: C.brandCyanLight, Icon: Clock },
];

const big: React.CSSProperties = { fontFamily: INTER, fontWeight: 900, letterSpacing: '-0.05em', lineHeight: 0.9, whiteSpace: 'nowrap' };

const Problem: React.FC<{ f: number; i: number }> = ({ f, i }) => {
  const p = PROBLEMS[i];
  const { Icon } = p;
  const cam = shake(f, 0, 14, 4);
  let A: React.ReactNode, B: React.ReactNode;

  if (i === 0) {
    // slam: scale down from huge
    const s = 1 + 2.4 * (1 - tw(f, 0, 7, 0, 1, expoOut));
    A = <div style={{ ...big, fontSize: 250, transform: `scale(${s})` }}>{p.a}</div>;
    const s2 = 1 + 2.4 * (1 - tw(f, 2, 9, 0, 1, expoOut));
    B = <div style={{ ...big, fontSize: 250, color: p.acc, transform: `scale(${s2})` }}>{p.b}</div>;
  } else if (i === 1) {
    // letters rise from a mask, one per frame
    const row = (t: string, d: number, col?: string) => (
      <div style={{ display: 'flex', justifyContent: 'center', overflow: 'hidden', color: col }}>
        {t.split('').map((ch, k) => (
          <span key={k} style={{ ...big, fontSize: 250, display: 'inline-block', transform: `translateY(${(1 - sp(f, d + k * 0.8, { damping: 14, stiffness: 300, mass: 0.5 })) * 105}%)` }}>
            {ch}
          </span>
        ))}
      </div>
    );
    A = row(p.a, 0);
    B = row(p.b, 3, p.acc);
  } else if (i === 2) {
    // two lines slide in from opposite sides with a skew smear
    const a = tw(f, 0, 8, 1, 0, expoOut), b = tw(f, 1, 9, 1, 0, expoOut);
    A = <div style={{ ...big, fontSize: 215, transform: `translateX(${-a * 1100}px) skewX(${a * 30}deg)` }}>{p.a}</div>;
    B = <div style={{ ...big, fontSize: 215, color: p.acc, transform: `translateX(${b * 1100}px) skewX(${-b * 30}deg)` }}>{p.b}</div>;
  } else {
    // flips down in 3D
    const a = sp(f, 0, BOUNCY), b = sp(f, 2, BOUNCY);
    A = <div style={{ ...big, fontSize: 300, transform: `perspective(900px) rotateX(${(1 - a) * -95}deg)`, transformOrigin: '50% 0%' }}>{p.a}</div>;
    B = <div style={{ ...big, fontSize: 300, color: p.acc, transform: `perspective(900px) rotateX(${(1 - b) * -95}deg)`, transformOrigin: '50% 0%' }}>{p.b}</div>;
  }

  const ic = sp(f, 0, { damping: 12, stiffness: 120, mass: 0.8 });
  return (
    <AbsoluteFill style={{ background: p.bg, color: p.fg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', opacity: 0.12, transform: `rotate(${(1 - ic) * -120 + f * 1.5}deg) scale(${0.6 + ic * 0.6})` }}>
        <Icon size={1100} color={p.acc} strokeWidth={1.6} />
      </div>
      <div style={{ transform: `translate(${cam.x}px, ${cam.y}px)`, textAlign: 'center' }}>
        {A}
        {B}
      </div>
    </AbsoluteFill>
  );
};

export const S1Type: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 60) {
    const i = Math.min(3, Math.floor(f / 15));
    return <Problem f={f - i * 15} i={i} />;
  }
  const g = f - 60;
  const cam = shake(g, 0, 16, 4);
  const cam2 = shake(g, 15, 22, 4);
  // GET IT (kick) → DONE (clap) → dot pops → dot pulses on clap → dot swallows frame
  const get = tw(g, 0, 7, 0, 1, expoOut);
  const done = sp(g, 15, { damping: 11, stiffness: 260, mass: 0.6 });
  const dv = squash(spVel(g, 15, { damping: 11, stiffness: 260, mass: 0.6 }), 1.8);
  const dot = sp(g, 30, BOUNCY);
  const pulse = hit(g, 45, 4);
  const grow = tw(g, 48, 60, 0, 1, expoIn);
  const dotSize = 90 * dot * (1 + pulse * 0.5) + grow * 4200;
  const up = tw(g, 0, 20, 0, 1, expoOut);

  return (
    <AbsoluteFill style={{ background: C.white, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 90, top: 640, transform: `translate(${cam.x + cam2.x}px, ${cam.y + cam2.y - up * 20}px)` }}>
        <div style={{ ...big, fontSize: 290, color: C.brandDark, transform: `scale(${1 + (1 - get) * 1.6})`, transformOrigin: 'left center', filter: `blur(${(1 - get) * 14}px)` }}>
          GET IT
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <div
            style={{
              ...big, fontSize: 290, color: C.brandCyan, transformOrigin: '50% 100%',
              transform: `translateY(${(1 - done) * 500}px) scale(${dv.sx}, ${dv.sy})`, opacity: g >= 15 ? 1 : 0,
            }}
          >
            DONE
          </div>
          <div style={{ width: 110, height: 110, position: 'relative', marginLeft: 6, marginBottom: 26 }}>
            <div
              style={{
                position: 'absolute', left: 55 - dotSize / 2, top: 55 - dotSize / 2, width: dotSize, height: dotSize,
                borderRadius: '50%', background: C.brandCyan,
              }}
            />
          </div>
        </div>
        <div style={{ fontFamily: INTER, fontWeight: 700, fontSize: 64, color: C.ink500, marginTop: 40, opacity: tw(g, 32, 40), transform: `translateY(${tw(g, 32, 42, 30, 0)}px)` }}>
          with a buddy you can trust.
        </div>
      </div>
    </AbsoluteFill>
  );
};
