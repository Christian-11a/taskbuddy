import React from 'react';
import { CircleCheck } from 'lucide-react';
import { Tap, TapGate } from '../v2/kit';
import { sp, tw } from '../motion';
import { T, pal } from '../hero/ui';
import { ClientPhone } from '../hero/ClientPhone';
import { K } from '../hero/story';

// Screens the hero timeline does not have, built from the mobile code (one to one).
// Each takes the step's local frame f and its length dur.

const S = pal('client');
const lerp = (f: number, dur: number, a: number, b: number) => a + Math.min(1, Math.max(0, f / dur)) * (b - a);

/** ConfirmationModal: centred card on a scrim (src/components/ConfirmationModal.tsx). */
export const Dialog: React.FC<{ p: number; title: string; message: string; confirm: string; cancel: string; danger?: boolean; press?: number; f: number; tone?: 'client' | 'provider' }> = ({ p, title, message, confirm, cancel, danger, press, f, tone = 'client' }) => {
  const c = pal(tone);
  const k = press != null && f >= press ? Math.exp(-(f - press) / 3) : 0;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(15,23,42,${0.5 * p})`, zIndex: 30 }} />
      <div style={{ position: 'absolute', left: 24, right: 24, top: 300, background: T.surface, borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, zIndex: 31, opacity: p, transform: `scale(${0.92 + p * 0.08})` }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, alignSelf: 'center', background: danger ? T.warnSurface : c.tonal, display: 'grid', placeItems: 'center' }}><CircleCheck size={24} color={danger ? T.danger : c.link} /></div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px', textAlign: 'center' }}>{title}</div>
        <div style={{ fontSize: 15, lineHeight: '22px', textAlign: 'center', color: T.ink700 }}>{message}</div>
        <div style={{ height: 46, borderRadius: 16, background: danger ? T.danger : c.primary, color: T.white, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600, transform: `scale(${1 - k * 0.04})` }}>{confirm}</div>
        <div style={{ alignSelf: 'center', padding: '8px 12px', fontSize: 14, fontWeight: 600, color: c.link }}>{cancel}</div>
      </div>
    </>
  );
};

const confirmDone = (f: number, dur: number) => <ClientPhone f={lerp(f, dur, K.doneLand + 4, K.cConfirm + 2)} />;

const confirmDialog = (f: number, dur: number) => {
  const press = Math.round(dur * 0.55);
  const p = sp(f, 2, { damping: 18, stiffness: 200, mass: 0.7 }) * tw(f, press + 4, press + 12, 1, 0);
  const done = f >= press + 10;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* the Confirm tap belongs to the previous step: keep it off this still background */}
      <TapGate.Provider value={{ min: -Infinity, max: Infinity, o: 0 }}><ClientPhone f={done ? lerp(f - press - 10, dur - press - 10, K.paid + 12, K.paid + 30) : K.cConfirm + 2} /></TapGate.Provider>
      {p > 0.01 && <Dialog f={f} p={p} press={press} title="Mark this job complete?" message="This confirms the work is done to your satisfaction. Report any problem before you confirm." confirm="Yes, Mark Complete" cancel="Not Yet" />}
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={press} x={205} y={530} /></div>
    </div>
  );
};

export const CUSTOM = { confirmDone, confirmDialog } satisfies Record<string, (f: number, dur: number) => React.ReactNode>;
export { S };
