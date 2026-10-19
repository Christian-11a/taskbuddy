import React from 'react';
import { AbsoluteFill, type CalculateMetadataFunction, useCurrentFrame } from 'remotion';
import { inOut } from '../motion';
import { ShowTaps } from '../v2/kit';
import { Phone } from './ui';
import { ClientPhone } from './ClientPhone';
import { ProviderPhone } from './ProviderPhone';
import { SignupPhone, SU } from './Signup';

// Website "How it works" carousel: one silent square loop per step, one big phone,
// played a little slower than the hero so each step can be read.
export type Role = 'customer' | 'provider';
type Seg = [number, number];
type Clip = { kind: 'signup' } | { kind: 'hero'; segs: Seg[] };
const SPEED = 0.8;
const XF = 8; // dissolve between segments and back to the start

export const CLIPS: Record<Role, Clip[]> = {
  customer: [
    { kind: 'signup' },                          // 1 create your account
    { kind: 'hero', segs: [[100, 184]] },        // 2 home → Post a job
    { kind: 'hero', segs: [[146, 326]] },        // 3 post a job, steps 1-5
    { kind: 'hero', segs: [[456, 606]] },        // 4 proposal → hire → pay
    { kind: 'hero', segs: [[796, 1006]] },       // 5 your turn → confirm → review
  ],
  provider: [
    { kind: 'signup' },                          // 1 create your account
    { kind: 'hero', segs: [[0, 184]] },          // 2 setup → get verified
    { kind: 'hero', segs: [[296, 374]] },        // 3 feed: a new job lands
    { kind: 'hero', segs: [[366, 482]] },        // 4 job details → send a proposal
    { kind: 'hero', segs: [[598, 646], [750, 808]] }, // 5 booked → start → tick tasks with proof
    { kind: 'hero', segs: [[834, 902]] },        // 6 earnings: payment released
  ],
};

// Solid square, the same colours as the hero stage; the website panel uses the edge colour.
export const FIELD: Record<Role, { edge: string; glow: string }> = {
  customer: { edge: '#075985', glow: '#0B8BD3' },
  provider: { edge: '#0B1826', glow: '#21405F' },
};

export type CarouselProps = { role: Role; step: number };
const clipOf = (p: CarouselProps) => CLIPS[p.role][p.step - 1];
const segFrames = (s: Seg) => Math.round((s[1] - s[0]) / SPEED);
const lengthOf = (c: Clip) => (c.kind === 'signup' ? SU.end : c.segs.reduce((n, s) => n + segFrames(s), 0));

export const carouselMetadata: CalculateMetadataFunction<CarouselProps> = ({ props }) => ({ durationInFrames: lengthOf(clipOf(props)) });

const Screen: React.FC<{ role: Role; clip: Clip; t: number }> = ({ role, clip, t }) => {
  if (clip.kind === 'signup') return <SignupPhone f={t} role={role === 'customer' ? 'client' : 'provider'} />;
  // t is clip time in output frames; find the segment and map to hero frames
  let rest = t;
  for (let i = 0; i < clip.segs.length; i++) {
    const s = clip.segs[i];
    const len = segFrames(s);
    if (rest < len || i === clip.segs.length - 1) {
      const hero = s[0] + Math.min(rest, len) * SPEED;
      return role === 'customer' ? <ClientPhone f={hero} /> : <ProviderPhone f={hero} />;
    }
    rest -= len;
  }
  return null;
};

const Stage: React.FC<{ role: Role; clip: Clip; t: number; len: number }> = ({ role, clip, t, len }) => {
  const k = (t / len) * Math.PI * 2; // sway repeats over the clip, so the loop is seamless
  const fld = FIELD[role];
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 46%, ${fld.glow} 0%, ${fld.edge} 46%)`, overflow: 'hidden' }}>
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1.5px, transparent 2px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(circle at 50% 50%, black 30%, transparent 70%)' }} />
      <div style={{ position: 'absolute', left: 540 - 232, top: 40, transform: `perspective(2200px) rotateY(${(role === 'customer' ? 1 : -1) * (5 + Math.sin(k) * 2.5)}deg) translateY(${Math.sin(k) * 6}px)` }}>
        <Phone w={464}><Screen role={role} clip={clip} t={t} /></Phone>
      </div>
    </AbsoluteFill>
  );
};

export const CarouselClip: React.FC<CarouselProps> = (props) => {
  const f = useCurrentFrame();
  const clip = clipOf(props);
  const len = lengthOf(clip);
  // dissolve between segments
  let seam: number | null = null;
  if (clip.kind === 'hero') {
    let acc = 0;
    for (let i = 0; i < clip.segs.length - 1; i++) { acc += segFrames(clip.segs[i]); if (f >= acc - XF && f < acc) seam = acc; }
  }
  const tail = f - (len - XF);
  return (
    <AbsoluteFill>
      <Stage role={props.role} clip={clip} t={f} len={len} />
      {seam !== null && <AbsoluteFill style={{ opacity: inOut((f - (seam - XF)) / XF) }}><Stage role={props.role} clip={clip} t={seam} len={len} /></AbsoluteFill>}
      {tail >= 0 && <AbsoluteFill style={{ opacity: inOut(Math.min(1, tail / (XF - 1))) }}><Stage role={props.role} clip={clip} t={0} len={len} /></AbsoluteFill>}
    </AbsoluteFill>
  );
};

// Poster: one settled frame of the clip, without the finger.
export const POSTER_AT: Record<Role, number[]> = { customer: [112, 5, 177, 92, 205], provider: [165, 140, 82, 80, 122, 57] };
export const CarouselPoster: React.FC<CarouselProps> = (props) => {
  const clip = clipOf(props);
  return <ShowTaps.Provider value={false}><Stage role={props.role} clip={clip} t={POSTER_AT[props.role][props.step - 1]} len={lengthOf(clip)} /></ShowTaps.Provider>;
};
