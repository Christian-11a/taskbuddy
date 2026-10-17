import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { C } from './theme';
import { expoIn, expoOut, hit, tw } from './motion';
import { Finish } from './components/ui';
import { S0Hook } from './scenes/S0Hook';
import { S1Type } from './scenes/S1Type';
import { S2Post } from './scenes/S2Post';
import { S3Pick } from './scenes/S3Pick';
import { S4Pay } from './scenes/S4Pay';
import { S5Near } from './scenes/S5Near';
import { S6Montage } from './scenes/S6Montage';
import { S7End } from './scenes/S7End';

// Transitions sit on top of the hard cuts and are timed to the whooshes /
// fills in the music (cover lands exactly on the downbeat).

/** Diagonal three-bar sweep (300). */
const BarWipe: React.FC<{ f: number; at: number; colors: string[] }> = ({ f, at, colors }) => {
  if (f < at - 12 || f > at + 12) return null;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: -800, top: -600, width: 2680, height: 3120, transform: 'rotate(-18deg)' }}>
        {colors.map((c, i) => {
          const inn = tw(f, at - 10 + i * 2, at - 2 + i * 1, 1, 0, expoIn);
          const out = tw(f, at + i * 2, at + 10 + i * 2, 0, -1, expoOut);
          const x = f < at ? inn : out;
          return <div key={i} style={{ position: 'absolute', inset: 0, background: c, transform: `translateX(${x * 100}%)` }} />;
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Iris from bottom centre (420). */
const Iris: React.FC<{ f: number; at: number; color: string; ring: string }> = ({ f, at, color, ring }) => {
  if (f < at - 10 || f >= at) return null;
  const p = tw(f, at - 10, at, 0, 1, expoIn);
  const r = p * 2400;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 540 - r - 40, top: 1700 - r - 40, width: (r + 40) * 2, height: (r + 40) * 2, borderRadius: '50%', background: ring }} />
      <div style={{ position: 'absolute', left: 540 - r, top: 1700 - r, width: r * 2, height: r * 2, borderRadius: '50%', background: color }} />
    </AbsoluteFill>
  );
};

/** Vertical blinds dropping (540). */
const Blinds: React.FC<{ f: number; at: number; color: string }> = ({ f, at, color }) => {
  if (f < at - 12 || f > at + 12) return null;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {Array.from({ length: 6 }, (_, i) => {
        const inn = tw(f, at - 11 + i, at - 5 + i * 0.8, -1, 0, expoIn);
        const out = tw(f, at + i, at + 8 + i, 0, 1, expoOut);
        const y = f < at ? inn : out;
        return <div key={i} style={{ position: 'absolute', top: 0, left: i * 180, width: 181, height: 1920, background: color, transform: `translateY(${y * 100}%)` }} />;
      })}
    </AbsoluteFill>
  );
};

export const Promo: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.brandDark }}>
      <Audio src={staticFile('music.wav')} />
      <Sequence from={0} durationInFrames={60}><S0Hook /></Sequence>
      <Sequence from={60} durationInFrames={120}><S1Type /></Sequence>
      <Sequence from={180} durationInFrames={120}><S2Post /></Sequence>
      <Sequence from={300} durationInFrames={120}><S3Pick /></Sequence>
      <Sequence from={420} durationInFrames={120}><S4Pay /></Sequence>
      <Sequence from={540} durationInFrames={120}><S5Near /></Sequence>
      <Sequence from={660} durationInFrames={120}><S6Montage /></Sequence>
      <Sequence from={780} durationInFrames={120}><S7End /></Sequence>

      <BarWipe f={f} at={300} colors={[C.brandCyanLight, C.brandCyan, C.brandDark]} />
      <Iris f={f} at={420} color={C.canvas} ring={C.brandCyan} />
      <Blinds f={f} at={540} color={C.brandTeal} />
      <AbsoluteFill style={{ background: C.white, opacity: hit(f, 660, 3) * 0.9, pointerEvents: 'none' }} />
      <Finish f={f} />
    </AbsoluteFill>
  );
};
