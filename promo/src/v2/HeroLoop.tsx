import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Finish } from '../components/ui';
import { Stage } from './Stage';

// Website hero: one continuous take, no cuts. Both phones stay on screen while
// the film's whole job plays through (verify → post → propose → hire → chat →
// pay → rate), sped up a little. Loops with a single dissolve back to the start.
const FROM = 246;   // provider opens verification
const TO = 1556;    // review submitted, rating ticked up
const SPEED = 1.6;
const XF = 18;      // loop dissolve
export const HERO_LOOP_FRAMES = Math.round((TO - FROM) / SPEED);

export const HeroLoop: React.FC = () => {
  const f = useCurrentFrame();
  const film = FROM + f * SPEED;
  const tail = f - (HERO_LOOP_FRAMES - XF);
  return (
    <AbsoluteFill style={{ background: '#0a1220' }}>
      <Stage f={Math.round(film)} hero />
      {tail >= 0 && (
        <AbsoluteFill style={{ opacity: tail / XF }}>
          <Stage f={Math.round(FROM - XF * SPEED + tail * SPEED)} hero />
        </AbsoluteFill>
      )}
      <Finish f={f} />
    </AbsoluteFill>
  );
};
