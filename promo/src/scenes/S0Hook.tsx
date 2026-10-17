import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { BOUNCY, expoIn, expoOut, hit, hits, noise, shake, sp, spVel, squash, tw } from '../motion';
import { Logo, PartName } from '../components/Logo';
import { Burst, Rings } from '../components/ui';

// 0–60 (bar 0). Impact on frame 0 → logo assembles from flying parts,
// checks tick on the hats, buddy pops, snare fill punches, camera dives in.
const PARTS: PartName[] = ['board', 'clip', 'box0', 'line0', 'box1', 'line1', 'box2', 'line2', 'body', 'head', 'cap', 'visor'];

export const S0Hook: React.FC = () => {
  const f = useCurrentFrame();
  const cam = shake(f, 0, 38, 5);
  const fill = hits(f, [45, 49, 52, 56], 2.5);
  const size = 560;

  const part = (p: PartName) => {
    const i = PARTS.indexOf(p);
    const start = 1 + i * 1.3;
    const a = noise(i + 4) * Math.PI;
    const dist = 420 + 160 * Math.abs(noise(i * 5));
    const k = sp(f, start, { damping: 13, stiffness: 230, mass: 0.55 });
    const { sx, sy } = squash(spVel(f, start, { damping: 13, stiffness: 230, mass: 0.55 }), 1.4);
    return {
      x: Math.cos(a) * dist * (1 - k),
      y: Math.sin(a) * dist * (1 - k),
      r: noise(i * 9) * 220 * (1 - k),
      s: Math.max(0, k),
      sx, sy,
    };
  };

  const checks: [number, number, number] = [tw(f, 15, 21), tw(f, 22, 28), tw(f, 30, 36)];
  const lines: [number, number, number] = [0.2 + 0.8 * tw(f, 15, 24), 0.2 + 0.8 * tw(f, 22, 31), 0.2 + 0.8 * tw(f, 30, 39)];
  const bp = sp(f, 36, BOUNCY);
  const buddy = { s: bp, r: (1 - bp) * -25 + Math.sin(f / 3) * hit(f, 40, 10) * 6 };

  // camera dive into the clipboard on the last half-beat
  const dive = tw(f, 51, 60, 0, 1, expoIn);
  const scale = (1 + fill * 0.07) * (1 + dive * 16);
  const disc = sp(f, 0, { damping: 10, stiffness: 140, mass: 0.8 });

  return (
    <AbsoluteFill style={{ background: C.brandDark, overflow: 'hidden' }}>
      {/* radial glow disc */}
      <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px)` }}>
        <div
          style={{
            position: 'absolute', left: 540 - 520, top: 900 - 520, width: 1040, height: 1040, borderRadius: '50%',
            background: `radial-gradient(circle, ${C.brandTeal} 0%, rgba(9,110,139,0.35) 45%, rgba(6,61,77,0) 70%)`,
            transform: `scale(${disc * (1 + fill * 0.12)})`,
          }}
        />
        {/* speed lines */}
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * 360 + 11;
          const p = tw(f, 0, 16, 0, 1, expoOut);
          const len = 260 * (1 - p) + 20;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: 540, top: 900, width: len, height: 14, borderRadius: 9,
                background: i % 2 ? C.brandCyan : C.brandCyanLight, opacity: 1 - p,
                transform: `rotate(${a}deg) translateX(${160 + p * 900}px)`, transformOrigin: '0 50%',
              }}
            />
          );
        })}
        <Rings f={f} at={0} x={540} y={900} color={C.brandCyanLight} max={900} count={3} width={16} />
        <Rings f={f} at={45} x={540} y={900} color={C.brandCyan} max={600} count={2} width={8} gap={4} />
        <Burst f={f} at={37} x={700} y={1050} n={14} radius={260} size={18} seed={3} />

        <div
          style={{
            position: 'absolute', left: 540 - size / 2, top: 900 - (size * 270) / 240 / 2,
            transform: `scale(${scale}) rotate(${cam.r + tw(f, 0, 20, -8, 0)}deg)`,
            transformOrigin: `${(100 / 240) * size}px ${(128 / 270) * ((size * 270) / 240)}px`,
          }}
        >
          <Logo size={size} part={part} checks={checks} lines={lines} buddy={buddy} />
        </div>
      </AbsoluteFill>
      {/* frame-0 flash */}
      <AbsoluteFill style={{ background: C.brandCyanLight, opacity: 0.85 * hit(f, 0, 2.5) }} />
      {/* dive lands in the clipboard cyan → next scene */}
      <AbsoluteFill style={{ background: C.brandCyan, opacity: tw(f, 56, 60, 0, 1) }} />
    </AbsoluteFill>
  );
};
