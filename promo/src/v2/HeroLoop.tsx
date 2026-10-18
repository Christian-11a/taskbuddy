import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { HeroStage } from '../hero/HeroStage';
import { K } from '../hero/story';
import { inOut } from '../motion';

// Website hero: one continuous take, both phones on screen, the whole job from
// verification to review. The last frames dissolve into frame 0 so it loops cleanly.
const XF = 20;
export const HERO_LOOP_FRAMES = K.end;

export const HeroLoop: React.FC = () => {
  const f = useCurrentFrame();
  const p = f >= HERO_LOOP_FRAMES - XF ? inOut(Math.min(1, (f - (HERO_LOOP_FRAMES - XF)) / (XF - 1))) : 0;
  return (
    <AbsoluteFill style={{ background: '#0B1826' }}>
      {p < 1 && <HeroStage f={f} />}
      {p > 0 && <AbsoluteFill style={{ opacity: p }}><HeroStage f={0} /></AbsoluteFill>}
      {/* no grain: keeps phone text crisp */}
    </AbsoluteFill>
  );
};

export const HeroStill: React.FC<{ at: number }> = ({ at }) => (
  <AbsoluteFill style={{ background: '#0B1826' }}><HeroStage f={at} /></AbsoluteFill>
);
