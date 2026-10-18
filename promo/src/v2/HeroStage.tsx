import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { INTER } from '../theme';
import { tw } from '../motion';
import { DP_H, Phone, S, Screens } from './kit';
import type { Scr } from './kit';
import { CLIENT_SCREENS, PROVIDER_SCREENS } from './HeroScreens';

// Hero loop stage, 1920 x 1080. Two phones centred as one pair; the provider phone sits on a soft
// navy-tinted wash (not a slab). Headline at the bottom, one blue keyword per beat.
// Phones are 440 px wide: a full 360 x 776 phone is about 2.16:1 and cannot be 540 px wide inside
// a 1080 px frame with room for the headline. Text inside them is 21 dp or more (about 24 px).

export const BEAT_LEN = 80;
const BEATS = 7;
export const STAGE_FRAMES = BEAT_LEN * BEATS;

const PW = 440;
const PAD = PW * 0.022;
const K = (PW - PAD * 2) / 360;
export const PH = DP_H * K + PAD * 2;
const PHONE_TOP = 40;
const GAP = 80;
const CLIENT_X = (1920 - (PW * 2 + GAP)) / 2;
const PROVIDER_X = CLIENT_X + PW + GAP;

// Dim (white veil) per beat, 0 = fully bright. Eases over the first 10 frames of each beat.
const CLIENT_DIM = [0, 0.35, 0, 0, 0, 0, 0];
const PROVIDER_DIM = [0.4, 0, 0.3, 0, 0, 0, 0.4];
const dimAt = (f: number, levels: number[]) => {
  const b = Math.min(BEATS - 1, Math.floor(f / BEAT_LEN));
  const lf = f - b * BEAT_LEN;
  const cur = levels[b];
  const prev = b > 0 ? levels[b - 1] : cur;
  return prev + (cur - prev) * tw(lf, 0, 10, 0, 1);
};

type Head = { pre: string; key: string };
const HEADS: Head[] = [
  { pre: 'Post a ', key: 'job' },
  { pre: 'Jobs come to ', key: 'you' },
  { pre: 'Compare ', key: 'proposals' },
  { pre: 'Chat and share ', key: 'photos' },
  { pre: 'Track every ', key: 'task' },
  { pre: 'Reschedule ', key: 'easily' },
  { pre: 'Rate your ', key: 'provider' },
];

const Headline: React.FC<{ h: Head; opacity: number; y: number }> = ({ h, opacity, y }) => (
  <div style={{
    position: 'absolute', left: 0, top: 986 + y, width: 1920, textAlign: 'center', fontFamily: INTER,
    fontWeight: 800, fontSize: 66, letterSpacing: '-0.03em', lineHeight: '76px', color: S.ink, opacity,
    whiteSpace: 'nowrap',
  }}>
    {h.pre}
    <span style={{ color: S.primary }}>{h.key}</span>.
  </div>
);

const PhoneSlot: React.FC<{ x: number; label: string; provider?: boolean; dim: number; list: Scr[]; f: number }> = ({ x, label, provider, dim, list, f }) => (
  <>
    <div style={{ position: 'absolute', left: x, top: 0, width: PW, height: 34, display: 'flex', justifyContent: 'center' }}>
      <div style={{
        padding: '4px 20px', borderRadius: 99, background: provider ? S.navyTonalStrong : S.primary,
        color: provider ? S.navy : S.white, fontFamily: INTER, fontWeight: 800, fontSize: 20, letterSpacing: '0.12em', lineHeight: '26px',
      }}>{label}</div>
    </div>
    <div style={{ position: 'absolute', left: x, top: PHONE_TOP, width: PW, height: PH }}>
      <Phone w={PW}>
        <Screens f={f} list={list} />
        {dim > 0 && <div style={{ position: 'absolute', left: 0, top: 0, width: 360, height: DP_H, background: `rgba(246,248,250,${dim})`, zIndex: 70 }} />}
      </Phone>
    </div>
  </>
);

/** One frame of the loop at global frame f (0 .. STAGE_FRAMES - 1). */
export const HeroStage: React.FC<{ f: number }> = ({ f }) => {
  const b = Math.min(BEATS - 1, Math.floor(f / BEAT_LEN));
  const lf = f - b * BEAT_LEN;
  const enter = b === 0 ? 1 : tw(lf, 0, 10, 0, 1);
  const leave = b === 0 ? 0 : 1 - tw(lf, 0, 8, 0, 1);
  return (
    <AbsoluteFill style={{ background: S.canvas, fontFamily: INTER, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 900px 620px at 30% 40%, rgba(186,230,253,0.45) 0%, rgba(246,248,250,0) 70%)' }} />
      {/* soft provider wash behind the right phone */}
      <div style={{ position: 'absolute', left: PROVIDER_X - 24, top: 0, width: PW + 48, height: 978, borderRadius: 48, background: '#E4EBF2' }} />

      <PhoneSlot x={CLIENT_X} label="CLIENT" dim={dimAt(f, CLIENT_DIM)} list={CLIENT_SCREENS} f={f} />
      <PhoneSlot x={PROVIDER_X} label="PROVIDER" provider dim={dimAt(f, PROVIDER_DIM)} list={PROVIDER_SCREENS} f={f} />

      {b > 0 && lf < 8 && <Headline h={HEADS[b - 1]} opacity={leave} y={0} />}
      <Headline h={HEADS[b]} opacity={enter} y={(1 - enter) * 24} />
    </AbsoluteFill>
  );
};

/** Beat stills for checking the look: frame 60 (tasks being typed) and frame 118 (new job landed). */
export const HeroBeat1: React.FC<{ at?: number }> = ({ at }) => {
  const cur = useCurrentFrame();
  return <HeroStage f={at ?? cur} />;
};
export const HeroBeat2: React.FC<{ at?: number }> = ({ at }) => {
  const cur = useCurrentFrame();
  return <HeroStage f={at ?? cur} />;
};
