import React from 'react';
import { AbsoluteFill, CalculateMetadataFunction, useCurrentFrame } from 'remotion';
import { Phone } from './kit';
import { HOPhoneContent } from './HOScreens';
import { SPPhoneContent } from './SPScreens';

// Website "How it works" carousel: one short silent loop per step, a single
// phone playing that step's moment from the film. [filmStart, filmEnd].
export const CLIPS = {
  customer: [
    [320, 446],   // 1 home → tap +
    [484, 606],   // 2 post a job: title, location, urgency, budget
    [934, 1022],  // 3 proposals → Hire → confirm
    [1344, 1432], // 4 escrow → released
    [1450, 1556], // 5 stars → review submitted
  ],
  provider: [
    [606, 716],   // 1 feed: new job lands → tap
    [260, 412],   // 2 verification
    [1454, 1556], // 3 profile: rating ticks up, new review
    [722, 866],   // 4 job details → proposal submitted
    [1036, 1122], // 5 booking request → accepted, hired
  ],
} as const;

export type StoryClipProps = { role: 'customer' | 'provider'; step: number };
const XF = 10;
const range = (p: StoryClipProps) => CLIPS[p.role][p.step - 1];

export const storyClipMetadata: CalculateMetadataFunction<StoryClipProps> = ({ props }) => {
  const [a, b] = range(props);
  return { durationInFrames: b - a };
};

// Solid field + a glow that fades out well inside the frame: the edges are the
// exact solid colour, which the website panel uses too, so the clip has no seam.
export const FIELD = { customer: '#dff3f8', provider: '#0d1a2a' };
const GLOW = { customer: 'rgba(255,255,255,0.95)', provider: 'rgba(34,90,130,0.85)' };
const Field: React.FC<{ role: StoryClipProps['role'] }> = ({ role }) => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 46%, ${GLOW[role]} 0%, ${FIELD[role]} 44%)` }} />
);

const PhoneAt: React.FC<{ role: StoryClipProps['role']; film: number; t: number }> = ({ role, film, t }) => (
  <div
    style={{
      position: 'absolute', left: 540 - 220, top: 70,
      transform: `perspective(2200px) rotateY(${(role === 'customer' ? 1 : -1) * (7 + Math.sin(t * Math.PI * 2) * 3)}deg) translateY(${Math.sin(t * Math.PI * 2) * 8}px)`,
    }}
  >
    <Phone w={440}>{role === 'customer' ? <HOPhoneContent f={film} /> : <SPPhoneContent f={film} />}</Phone>
  </div>
);

export const StoryClip: React.FC<StoryClipProps> = (props) => {
  const f = useCurrentFrame();
  const [a, b] = range(props);
  const len = b - a;
  const t = f / len; // sway is periodic over the clip, so the loop is seamless
  const tail = f - (len - XF);
  return (
    <AbsoluteFill style={{ background: FIELD[props.role], overflow: 'hidden' }}>
      <Field role={props.role} />
      <PhoneAt role={props.role} film={a + f} t={t} />
      {tail >= 0 && (
        <AbsoluteFill style={{ opacity: tail / XF }}>
          <AbsoluteFill style={{ background: FIELD[props.role] }} />
          <Field role={props.role} />
          <PhoneAt role={props.role} film={a} t={t} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
