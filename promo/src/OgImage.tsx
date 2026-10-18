import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { INTER } from './theme';

export const OgImage: React.FC = () => (
  <AbsoluteFill
    style={{
      fontFamily: INTER,
      background:
        'radial-gradient(900px 600px at 95% 40%, #e0f2fe 0%, rgba(224,242,254,0) 70%), linear-gradient(180deg, #f0f9ff 0%, #f8fafc 100%)',
    }}
  >
    <div style={{ position: 'absolute', left: 64, top: 60, display: 'flex', alignItems: 'center', gap: 16 }}>
      <Img src={staticFile('taskbuddy-logo.png')} style={{ width: 64, height: 64, objectFit: 'contain' }} />
      <div style={{ fontSize: 40, fontWeight: 800, color: '#0c4a6e', letterSpacing: -1 }}>TaskBuddy</div>
    </div>
    <div style={{ position: 'absolute', left: 64, top: 190, width: 640 }}>
      <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.06, letterSpacing: -2, color: '#0f172a' }}>
        Get the help you need. <span style={{ color: '#0369a1' }}>Find work that fits.</span>
      </div>
      <div style={{ marginTop: 28, fontSize: 28, fontWeight: 500, lineHeight: 1.35, color: '#586a7f' }}>
        Home services in Lipa City. One app for clients and providers.
      </div>
    </div>
    <Img
      src={staticFile('taskbuddy-mascot.webp')}
      style={{ position: 'absolute', right: 60, bottom: 40, height: 520, objectFit: 'contain' }}
    />
  </AbsoluteFill>
);
