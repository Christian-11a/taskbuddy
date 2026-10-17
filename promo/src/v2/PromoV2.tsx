import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { Finish } from '../components/ui';
import { Stage } from './Stage';
import { Closing, Opening } from './Bookends';

// Version A (music only), 16:9 master.
export const PromoV2: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#071426' }}>
      <Audio src={staticFile('music60.wav')} />
      {f >= 110 && f < 1560 && <Stage f={f} />}
      <Opening f={f} />
      <Closing f={f} />
      <Finish f={f} />
    </AbsoluteFill>
  );
};
