import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, INTER, SPARTAN } from '../theme';
import { BOUNCY, expoOut, hit, hits, noise, shake, sp, spVel, squash, tw } from '../motion';
import { Logo, PartName } from '../components/Logo';
import { Burst, Rings } from '../components/ui';

// 780–900 (bars 13–14). The drop: the mark re-assembles from an explosion,
// wordmark bounces in letter by letter; at 840 the final chord lands the
// tagline, then everything settles into a clean frame.
const PARTS: PartName[] = ['board', 'clip', 'box0', 'line0', 'box1', 'line1', 'box2', 'line2', 'body', 'head', 'cap', 'visor'];
const WORD = 'TaskBuddy'.split('');
const TAG = 'Hire with confidence, pay with ease.'.split(' ');

export const S7End: React.FC = () => {
  const f = useCurrentFrame();
  const cam = shake(f, 0, 34, 5);
  const cam2 = shake(f, 60, 12, 5);
  const beat = hits(f, [0, 15, 30, 45], 4) * (f < 60 ? 1 : 0);
  const settle = tw(f, 60, 120, 0, 1, expoOut);
  const size = 400;

  const part = (p: PartName) => {
    const i = PARTS.indexOf(p);
    const cfg = { damping: 12, stiffness: 200, mass: 0.55 };
    const k = sp(f, i * 0.7, cfg);
    const a = (i / PARTS.length) * Math.PI * 2 + noise(i) * 0.5;
    const { sx, sy } = squash(spVel(f, i * 0.7, cfg), 1.2);
    return { x: Math.cos(a) * 700 * (1 - k), y: Math.sin(a) * 700 * (1 - k), r: noise(i * 3) * 300 * (1 - k), sx, sy };
  };
  const checks: [number, number, number] = [tw(f, 15, 21), tw(f, 22, 28), tw(f, 30, 36)];
  const bp = sp(f, 8, BOUNCY);
  const up = tw(f, 30, 52, 0, 1, expoOut) * 70;

  return (
    <AbsoluteFill style={{ background: C.canvas, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 42%, ${C.cyan100} 0%, rgba(247,249,251,0) 50%)`, transform: `scale(${1 + beat * 0.08})` }} />
      <AbsoluteFill style={{ transform: `translate(${cam.x + cam2.x}px, ${cam.y + cam2.y - up}px) scale(${1.04 - settle * 0.04})` }}>
        <Rings f={f} at={0} x={540} y={820} color={C.brandCyan} max={1100} count={3} width={22} gap={3} />
        <Burst f={f} at={0} x={540} y={820} n={30} radius={760} size={26} seed={8} gravity={1.4} life={40} colors={[C.brandCyan, C.brandCyanLight, C.brandTeal, C.amber]} />
        <Rings f={f} at={60} x={540} y={820} color={C.brandCyanLight} max={700} count={2} width={10} />

        <div style={{ position: 'absolute', left: 540 - size / 2 + 10, top: 820 - (size * 270) / 240 / 2, transform: `translateY(${Math.sin(f / 14) * 8 * settle}px) scale(${1 + beat * 0.05})` }}>
          <Logo size={size} part={part} checks={checks} buddy={{ s: bp, r: Math.sin(f / 4) * hit(f, 12, 14) * 10 }} />
        </div>

        {/* wordmark */}
        <div style={{ position: 'absolute', top: 1110, width: '100%', display: 'flex', justifyContent: 'center', fontFamily: SPARTAN, fontWeight: 800, fontSize: 190, letterSpacing: '0.005em', color: C.brandDark }}>
          {WORD.map((ch, i) => {
            const cfg = { damping: 10, stiffness: 230, mass: 0.6 };
            const k = sp(f, 5 + i * 1.6, cfg);
            const { sx, sy } = squash(spVel(f, 5 + i * 1.6, cfg), 1.6);
            return (
              <span key={i} style={{ display: 'inline-block', color: i >= 4 ? C.brandCyan : C.brandDark, transform: `translateY(${(1 - k) * -700}px) scale(${sx}, ${sy}) rotate(${(1 - k) * (i % 2 ? 30 : -30)}deg)`, transformOrigin: '50% 100%', opacity: f >= 5 + i * 1.6 ? 1 : 0 }}>
                {ch}
              </span>
            );
          })}
        </div>

        {/* tagline lands on the final chord */}
        <div style={{ position: 'absolute', top: 1335, width: '100%', fontFamily: INTER, fontWeight: 700, fontSize: 62, letterSpacing: '-0.015em', lineHeight: 1.15 }}>
          {[TAG.slice(0, 3), TAG.slice(3)].map((line, li) => (
            <div key={li} style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              {line.map((w, j) => {
                const i = li * 3 + j;
                const k = sp(f, 60 + i * 2, { damping: 16, stiffness: 200, mass: 0.6 });
                return (
                  <div key={i} style={{ overflow: 'hidden', paddingBottom: 8 }}>
                    <div style={{ transform: `translateY(${(1 - k) * 110}%)`, color: li ? C.brandTeal : C.ink500 }}>{w}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', top: 1510, left: 540 - 110, width: 220, height: 10, borderRadius: 9, background: C.brandCyan, transform: `scaleX(${tw(f, 70, 88)})` }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.white, opacity: hit(f, 0, 3) }} />
      <AbsoluteFill style={{ background: C.brandCyanLight, opacity: hit(f, 60, 3) * 0.35 }} />
    </AbsoluteFill>
  );
};
