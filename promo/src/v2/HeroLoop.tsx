import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { HeroStage, STAGE_FRAMES } from './HeroStage';
import { inOut } from '../motion';

// Website hero loop: 7 beats of 80 frames at 30 fps (about 18.7 s), silent, 1920 x 1080.
// The last 12 frames dissolve into frame 0, and the final frame (559) is exactly frame 0,
// so the loop repeats without a jump.
export const HERO_LOOP_FRAMES = STAGE_FRAMES;
const DISSOLVE_FROM = HERO_LOOP_FRAMES - 12;

export const HeroLoop: React.FC = () => {
  const f = useCurrentFrame();
  // The last frame is drawn exactly like frame 0 (same tree, no overlay), so the two match pixel for pixel.
  if (f >= HERO_LOOP_FRAMES - 1) {
    return (
      <AbsoluteFill style={{ background: '#F6F8FA' }}>
        <HeroStage f={0} />
      </AbsoluteFill>
    );
  }
  const p = f >= DISSOLVE_FROM ? inOut((f - DISSOLVE_FROM) / (HERO_LOOP_FRAMES - 1 - DISSOLVE_FROM)) : 0;
  return (
    <AbsoluteFill style={{ background: '#F6F8FA' }}>
      <HeroStage f={f} />
      {p > 0 && (
        <AbsoluteFill style={{ opacity: Math.min(1, p) }}>
          <HeroStage f={0} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
