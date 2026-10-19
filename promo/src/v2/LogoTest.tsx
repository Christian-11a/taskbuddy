import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { BlueLogo, BPart } from './BlueLogo';

const EXPLODE: Partial<Record<BPart, { x: number; y: number; r: number }>> = {
  board: { x: -30, y: 0, r: -4 }, box0: { x: -60, y: -40, r: -12 }, box1: { x: -70, y: 0, r: 10 }, box2: { x: -60, y: 50, r: -8 },
  line0: { x: 30, y: -50, r: 4 }, line1: { x: 40, y: -10, r: -3 }, line2: { x: 20, y: 30, r: 5 },
  cap: { x: 60, y: -70, r: 12 }, face: { x: 80, y: -10, r: 0 }, body: { x: 60, y: 40, r: 0 },
};

export const LogoTest: React.FC = () => (
  <AbsoluteFill style={{ background: '#fff', flexDirection: 'row' }}>
    <BlueLogo size={512} />
    <Img src={staticFile('taskbuddy-logo.png')} style={{ width: 512, height: 512 }} />
    <div style={{ position: 'relative', width: 512, height: 512, background: '#000' }}>
      <Img src={staticFile('taskbuddy-logo.png')} style={{ position: 'absolute', width: 512, height: 512 }} />
      <div style={{ position: 'absolute', mixBlendMode: 'difference' }}><BlueLogo size={512} id="b2" /></div>
    </div>
    <div style={{ position: 'relative', width: 512, height: 512, background: '#eef6fb' }}>
      <BlueLogo size={512} id="b3" check={0.4} part={(p) => ({ ...(EXPLODE[p] ?? {}) })} />
    </div>
  </AbsoluteFill>
);
