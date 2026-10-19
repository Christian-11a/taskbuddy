import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ClientPhone } from '../hero/ClientPhone';
import { ProviderPhone } from '../hero/ProviderPhone';
import { SignupPhone } from '../hero/Signup';
import { DW, DH } from '../hero/ui';
import { CUSTOM } from './screens';
import { CUSTOM2 } from './screens2';

// Debug only: one phone screen at 1 px = 1 dp, at frame f, with a crosshair at (x, y) when given.
const ALL: Record<string, (f: number, dur: number) => React.ReactNode> = { ...CUSTOM, ...CUSTOM2 };
export type AuditProps = { src: string; f: number; dur?: number; x?: number; y?: number; label?: string };
export const TapAudit: React.FC<AuditProps> = ({ src, f, dur = 150, x, y, label }) => (
  <AbsoluteFill style={{ background: '#fff' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: DW, height: DH, overflow: 'hidden', background: '#F6F8FA', fontFamily: 'Inter' }}>
      {src === 'client' ? <ClientPhone f={f} /> : src === 'provider' ? <ProviderPhone f={f} /> : src === 'su-client' ? <SignupPhone f={f} role="client" /> : src === 'su-provider' ? <SignupPhone f={f} role="provider" /> : ALL[src](f, dur)}
    </div>
    {x != null && y != null && <>
      <div style={{ position: 'absolute', left: x - 1, top: 0, width: 2, height: DH, background: 'rgba(255,0,0,0.5)', zIndex: 99 }} />
      <div style={{ position: 'absolute', left: 0, top: y - 1, width: DW, height: 2, background: 'rgba(255,0,0,0.5)', zIndex: 99 }} />
    </>}
    {label && <div style={{ position: 'absolute', left: 4, top: DH - 22, fontSize: 13, fontWeight: 700, color: '#fff', background: 'rgba(200,0,0,0.85)', padding: '1px 6px', zIndex: 100 }}>{label}</div>}
  </AbsoluteFill>
);
