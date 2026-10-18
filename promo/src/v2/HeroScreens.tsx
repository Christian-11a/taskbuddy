import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft, ArrowUp, Bell, BrushCleaning, Check, ClipboardList, Droplets, Footprints, Hammer,
  House, Image as ImageIcon, MessageCircle, Search, Sparkles, Star, User, Wrench, X,
} from 'lucide-react';
import { S, StatusBar, Tap, Toggle, typed } from './kit';
import type { Scr } from './kit';
import { BOUNCY, SNAPPY, hit, sp, tw } from '../motion';

// Hero loop screens. Authored at 360 x 776 dp (kit Phone). Fake data only: client "Maria Santos",
// provider "Ramon Dela Cruz", Lipa City, job "Fix leaking kitchen sink" (Plumbing). Money and
// identity screens are left out on purpose. Every timing is an absolute GLOBAL frame (the loop is 560 frames).
// Text is at least 21 dp, so it reads at about 24 px on the 1920 frame.

const CARD: React.CSSProperties = { background: S.surface, border: `1px solid ${S.line}`, borderRadius: 17, boxShadow: '0 1px 2px rgba(12,74,110,0.05)' };
const abs = (x: number, y: number, w: number, h: number, extra: React.CSSProperties = {}): React.CSSProperties =>
  ({ position: 'absolute', left: x, top: y, width: w, height: h, ...extra });

const Base: React.FC<{ children?: React.ReactNode; bg?: string }> = ({ children, bg = S.canvas }) => (
  <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden' }}>{children}</div>
);

const BackBtn: React.FC<{ icon?: LucideIcon }> = ({ icon: I = ArrowLeft }) => (
  <div style={abs(20, 52, 44, 44, { ...CARD, borderRadius: 22, display: 'grid', placeItems: 'center' })}>
    <I size={24} color={S.ink700} />
  </div>
);

const Title: React.FC<{ children: React.ReactNode; x?: number; y?: number; w?: number; size?: number }> = ({ children, x = 76, y = 52, w = 264, size = 27 }) => (
  <div style={abs(x, y, w, 44, { fontSize: size, fontWeight: 800, lineHeight: '44px', letterSpacing: -0.2, whiteSpace: 'nowrap' })}>{children}</div>
);

const Steps: React.FC<{ step: number }> = ({ step }) => (
  <div style={abs(20, 124, 320, 6, { display: 'flex', gap: 6 })}>
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < step ? S.primary : S.line }} />
    ))}
  </div>
);

const Action: React.FC<{ label: string; press?: number; y?: number; x?: number; w?: number; tone?: 'primary' | 'tonal' | 'dim' }> =
  ({ label, press = 0, y = 692, x = 20, w = 320, tone = 'primary' }) => {
    const bg = tone === 'primary' ? S.primary : tone === 'tonal' ? S.tonal : '#A9CDE0';
    const color = tone === 'tonal' ? S.primary : S.white;
    return (
      <div style={abs(x, y, w, 56, {
        borderRadius: 13, background: bg, color, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800,
        transform: `scale(${1 - press * 0.04})`, boxShadow: tone === 'primary' ? '0 6px 14px rgba(3,105,161,0.22)' : undefined,
      })}>{label}</div>
    );
  };

const Footer: React.FC = () => (
  <div style={abs(0, 676, 360, 100, { background: S.surface, borderTop: `1px solid ${S.hairline}` })} />
);

const NAV: Record<'client' | 'provider', [string, LucideIcon][]> = {
  client: [['Home', House], ['My Jobs', ClipboardList], ['Messages', MessageCircle], ['Profile', User]],
  provider: [['Feed', Search], ['My Work', ClipboardList], ['Messages', MessageCircle], ['Profile', User]],
};
const Nav: React.FC<{ tone: 'client' | 'provider'; active: number }> = ({ tone, active }) => (
  <div style={abs(0, 692, 360, 84, { background: S.surface, borderTop: `1px solid ${S.hairline}`, display: 'flex', alignItems: 'flex-start', padding: '8px 2px 0' })}>
    {NAV[tone].map(([label, I], i) => {
      const on = i === active;
      const pro = tone === 'provider';
      return (
        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: on ? (pro ? S.navy : S.brandDark) : S.inactive }}>
          <div style={{ width: 72, height: 36, borderRadius: 18, background: on ? (pro ? S.navyTonalStrong : S.skyLight) : 'transparent', display: 'grid', placeItems: 'center' }}>
            <I size={24} strokeWidth={on ? 2.4 : 2} />
          </div>
          <span style={{ fontSize: 18, fontWeight: on ? 800 : 600, whiteSpace: 'nowrap', lineHeight: '22px' }}>{label}</span>
        </div>
      );
    })}
  </div>
);

const CheckBox: React.FC<{ on: boolean }> = ({ on }) => (
  <div style={{ width: 30, height: 30, borderRadius: 9, border: `2px solid ${on ? S.primary : S.field}`, background: on ? S.primary : S.surface, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    {on && <Check size={20} color={S.white} strokeWidth={3} />}
  </div>
);

const TaskRow: React.FC<{ y: number; label: string; on: boolean; x?: number; w?: number; f?: number; appearAt?: number }> =
  ({ y, label, on, x = 20, w = 320, f = 0, appearAt }) => {
    const a = appearAt == null ? 1 : tw(f, appearAt, appearAt + 8, 0, 1);
    return (
      <div style={abs(x, y, w, 52, { display: 'flex', alignItems: 'center', gap: 14, opacity: a, transform: `translateY(${(1 - a) * 10}px)` })}>
        <CheckBox on={on} />
        <div style={{ fontSize: 21, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    );
  };

const Avatar: React.FC<{ ini: string; size?: number; navy?: boolean }> = ({ ini, size = 56, navy }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: navy ? S.navyTonalStrong : S.primary, color: navy ? S.navy : S.white, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>{ini}</div>
);

const Toast: React.FC<{ f: number; at: number; out: number; title: string; body?: string; I?: LucideIcon }> = ({ f, at, out, title, body, I = Bell }) => {
  if (f < at) return null;
  const p = Math.max(0, Math.min(1, sp(f, at, SNAPPY)));
  const fade = tw(f, out, out + 8, 1, 0);
  return (
    <div style={abs(12, 52, 336, 0, {
      ...CARD, borderRadius: 20, minHeight: 92, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', boxSizing: 'border-box',
      boxShadow: '0 12px 28px rgba(12,26,40,0.18)', transform: `translateY(${(p - 1) * 120}px)`, opacity: p * fade, zIndex: 30,
    })}>
      <div style={{ width: 50, height: 50, borderRadius: 15, background: S.tonal, display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={26} color={S.primary} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: '26px' }}>{title}</div>
        {body && <div style={{ fontSize: 18, color: S.muted, fontWeight: 600, marginTop: 3, lineHeight: '22px' }}>{body}</div>}
      </div>
    </div>
  );
};

const Stars: React.FC<{ n: number; size: number; gap: number }> = ({ n, size, gap }) => (
  <div style={{ display: 'flex', gap }}>
    {[0, 1, 2, 3, 4].map((i) => (
      <Star key={i} size={size} color={i < n ? S.amber : '#CBD5E1'} fill={i < n ? S.amber : 'transparent'} strokeWidth={2} />
    ))}
  </div>
);

// ═════════════════════════ CLIENT ═════════════════════════

const SERVICES: [string, LucideIcon][] = [['Plumbing', Wrench], ['Cleaning', BrushCleaning], ['Handyman', Hammer], ['Manicure', Sparkles], ['Pedicure', Footprints]];
const TILE_XY: [number, number][] = [[20, 250], [186, 250], [20, 378], [186, 378], [20, 506]];

const Tile: React.FC<{ x: number; y: number; label: string; I: LucideIcon; sel: boolean; press: number }> = ({ x, y, label, I, sel, press }) => (
  <div style={abs(x, y, 154, 116, {
    borderRadius: 16, background: sel ? S.tonal : S.surface, border: `2px solid ${sel ? S.primary : S.line}`, boxSizing: 'border-box',
    transform: `scale(${1 - press * 0.04})`,
  })}>
    <div style={{ position: 'absolute', left: 14, top: 14, width: 44, height: 44, borderRadius: 13, background: sel ? S.surface : S.tonal, display: 'grid', placeItems: 'center' }}>
      <I size={26} color={S.primary} strokeWidth={2.1} />
    </div>
    <div style={{ position: 'absolute', left: 14, bottom: 12, fontSize: 21, fontWeight: 800 }}>{label}</div>
    {sel && (
      <div style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, background: S.primary, display: 'grid', placeItems: 'center' }}>
        <Check size={18} color={S.white} strokeWidth={3} />
      </div>
    )}
  </div>
);

/** Post a job, step 1 (Service). Plumbing is tapped at frame 10, Next at 28. */
export const ClientService: React.FC<{ f: number }> = ({ f }) => (
  <Base>
    <StatusBar />
    <div style={abs(20, 52, 44, 44, { ...CARD, borderRadius: 22, display: 'grid', placeItems: 'center' })}><X size={24} color={S.ink700} /></div>
    <Title>Post a job</Title>
    <Steps step={1} />
    <div style={abs(20, 160, 320, 70, { fontSize: 26, fontWeight: 800, lineHeight: '32px', letterSpacing: -0.3 })}>What do you need help with?</div>
    {SERVICES.map(([label, I], i) => (
      <Tile key={label} x={TILE_XY[i][0]} y={TILE_XY[i][1]} label={label} I={I} sel={i === 0 && f >= 12} press={i === 0 ? hit(f, 10, 3) : 0} />
    ))}
    <Footer />
    <Action label="Next" press={hit(f, 28, 3)} />
    <Tap f={f} at={10} x={97} y={308} />
    <Tap f={f} at={28} x={180} y={720} />
  </Base>
);

const TASK_TEXT = 'Check the pipe';

/** Post a job, step 3 (Tasks). Preset ticked at 40, the own task typed from 48, added at 72, Next at 78. */
export const ClientTasks: React.FC<{ f: number }> = ({ f }) => {
  const typing = f >= 48 && f < 74;
  const shown = typed(TASK_TEXT, f, 48, 20);
  return (
    <Base>
      <StatusBar />
      <BackBtn icon={X} />
      <Title>Post a job</Title>
      <Steps step={3} />
      <div style={abs(20, 160, 320, 40, { fontSize: 26, fontWeight: 800, letterSpacing: -0.3 })}>What needs doing?</div>
      <TaskRow y={212} label="Fix leaking faucet" on={f >= 42} f={f} />
      <TaskRow y={272} label="Unclog drain" on={false} f={f} />
      <TaskRow y={332} label="Fix toilet" on={false} f={f} />
      <TaskRow y={436} label={TASK_TEXT} on={f >= 74} f={f} appearAt={74} />
      <div style={abs(20, 500, 236, 52, { borderRadius: 14, border: `1.5px solid ${typing ? S.primary : S.field}`, background: S.surface, display: 'flex', alignItems: 'center', padding: '0 14px', boxSizing: 'border-box', boxShadow: typing ? '0 0 0 4px rgba(3,105,161,0.12)' : undefined })}>
        <span style={{ fontSize: 21, fontWeight: shown ? 600 : 500, color: shown ? S.ink : S.muted, whiteSpace: 'nowrap' }}>{f >= 74 ? 'Add your own task' : shown || 'Add your own task'}</span>
        {typing && <span style={{ width: 2, height: 24, background: S.primary, marginLeft: 2, opacity: Math.floor(f / 8) % 2 === 0 ? 1 : 0 }} />}
      </div>
      <div style={abs(266, 500, 74, 52, { borderRadius: 14, background: S.tonal, color: S.primary, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800, transform: `scale(${1 - hit(f, 72, 3) * 0.05})` })}>Add</div>
      <Footer />
      <Action label="Next" press={hit(f, 78, 3)} />
      <Tap f={f} at={40} x={44} y={238} />
      <Tap f={f} at={72} x={303} y={526} />
      <Tap f={f} at={78} x={180} y={720} />
    </Base>
  );
};

/** Post a job posted. */
export const ClientPosted: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  const p = Math.max(0, Math.min(1.05, sp(f, at, BOUNCY)));
  return (
    <Base>
      <StatusBar />
      <div style={abs(132, 262, 96, 96, { borderRadius: 48, background: S.success, display: 'grid', placeItems: 'center', transform: `scale(${p})` })}>
        <Check size={50} color={S.white} strokeWidth={3} />
      </div>
      <div style={abs(0, 392, 360, 44, { textAlign: 'center', fontSize: 31, fontWeight: 800, opacity: tw(f, at + 4, at + 12, 0, 1) })}>Job posted!</div>
      <div style={abs(40, 446, 280, 60, { textAlign: 'center', fontSize: 21, fontWeight: 600, color: S.muted, lineHeight: '28px', opacity: tw(f, at + 6, at + 14, 0, 1) })}>Compare proposals on the job page</div>
    </Base>
  );
};

const JOB_TITLE = 'Fix leaking kitchen sink';

/** Client My Jobs. The posted job reads "Waiting for proposals" until the proposal lands at 204. */
export const ClientMyJobs: React.FC<{ f: number }> = ({ f }) => {
  const got = f >= 218;
  return (
    <Base>
      <StatusBar />
      <div style={abs(20, 52, 240, 44, { fontSize: 32, fontWeight: 800, letterSpacing: -0.4, lineHeight: '44px' })}>My Jobs</div>
      <div style={abs(20, 112, 96, 42, { borderRadius: 21, background: S.primary, color: S.white, display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 800 })}>{`All ${f >= 98 ? 1 : 0}`}</div>
      <div style={abs(126, 112, 154, 42, { borderRadius: 21, background: S.surface, border: `1px solid ${S.line}`, boxSizing: 'border-box', display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 700, color: S.ink700 })}>{`Needs you ${got ? 1 : 0}`}</div>
      <div style={abs(20, 180, 320, 218, { ...CARD, padding: 18, boxSizing: 'border-box' })}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: '27px' }}>{`Plumbing: ${JOB_TITLE}`}</div>
        <div style={{ fontSize: 19, color: S.muted, fontWeight: 600, marginTop: 8 }}>Lipa City · Tue, Oct 20</div>
        <div style={{ position: 'absolute', left: 18, top: 136, height: 42, borderRadius: 21, padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 21, fontWeight: 800, whiteSpace: 'nowrap',
          background: got ? '#FEF3C7' : S.tonal, color: got ? S.warningText : S.primaryDeep }}>
          {got ? '1 proposal waiting' : 'Waiting for proposals'}
        </div>
      </div>
      <Nav tone="client" active={1} />
      <Toast f={f} at={214} out={240} title="New proposal" body="Ramon Dela Cruz sent a proposal." />
      <Tap f={f} at={226} x={180} y={290} />
    </Base>
  );
};

/** Proposals list: Ramon Dela Cruz with rating stars and a review count. Slides in at 230. */
export const ClientProposals: React.FC<{ f: number }> = ({ f }) => {
  const a = tw(f, 230, 242, 0, 1);
  return (
    <Base>
      <StatusBar />
      <BackBtn />
      <Title>Proposals</Title>
      <div style={abs(20, 118, 320, 26, { fontSize: 18, fontWeight: 700, color: S.muted, whiteSpace: 'nowrap' })}>Plumbing: {JOB_TITLE}</div>
      <div style={abs(20, 166, 320, 206, { ...CARD, padding: 18, boxSizing: 'border-box', opacity: a, transform: `translateY(${(1 - a) * 40}px)` })}>
        <div style={{ position: 'absolute', left: 18, top: 18 }}><Avatar ini="RD" size={72} navy /></div>
        <div style={{ position: 'absolute', left: 106, top: 26, width: 200, fontSize: 22, fontWeight: 800, lineHeight: '26px' }}>Ramon Dela Cruz</div>
        <div style={{ position: 'absolute', left: 106, top: 62, width: 200, fontSize: 19, fontWeight: 600, color: S.muted }}>Lipa City</div>
        <div style={{ position: 'absolute', left: 18, top: 110 }}><Stars n={5} size={30} gap={6} /></div>
        <div style={{ position: 'absolute', left: 18, top: 152, fontSize: 21, fontWeight: 800 }}>4.9 <span style={{ color: S.muted, fontWeight: 600 }}>· 12 reviews</span></div>
      </div>
    </Base>
  );
};

/** Messages list. One conversation. Row shows at 244 for the tap at 256. */
export const MessagesList: React.FC<{ f: number; tone: 'client' | 'provider'; name: string }> = ({ f, tone, name }) => {
  const a = tw(f, 244, 254, 0, 1);
  return (
    <Base>
      <StatusBar />
      <div style={abs(20, 52, 240, 44, { fontSize: 32, fontWeight: 800, letterSpacing: -0.4, lineHeight: '44px' })}>Messages</div>
      <div style={abs(20, 124, 320, 96, { ...CARD, padding: 16, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 14, opacity: a })}>
        <Avatar ini={name.split(' ').map((p) => p[0]).join('').slice(0, 2)} size={60} navy={tone === 'client'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 800 }}>{name}</div>
          <div style={{ fontSize: 19, color: S.muted, fontWeight: 600, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`Plumbing: ${JOB_TITLE}`}</div>
        </div>
      </div>
      <Nav tone={tone} active={2} />
      <Tap f={f} at={254} x={180} y={170} />
    </Base>
  );
};

type Msg = { from: 'client' | 'provider'; text?: string; photo?: boolean; at: number };
const MSGS: Msg[] = [
  { from: 'client', text: 'Hi Ramon, can you fix my kitchen sink?', at: 268 },
  { from: 'provider', text: 'Yes, I can come on Tuesday.', at: 280 },
  { from: 'client', text: 'Great, see you at 9 AM.', at: 292 },
  { from: 'provider', photo: true, at: 304 },
];

const Bubble: React.FC<{ m: Msg; f: number; mine: boolean }> = ({ m, f, mine }) => {
  if (f < m.at) return null;
  const p = Math.max(0, Math.min(1, sp(f, m.at, SNAPPY)));
  const base: React.CSSProperties = {
    alignSelf: mine ? 'flex-end' : 'flex-start', opacity: p, transform: `translateY(${(1 - p) * 14}px)`,
    background: mine ? S.primary : S.surface, color: mine ? S.white : S.ink, border: mine ? 'none' : `1px solid ${S.line}`,
  };
  if (m.photo) {
    return (
      <div style={{ ...base, width: 220, height: 160, borderRadius: 18, background: S.tonal, border: `1px solid ${S.line}`, display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <Droplets size={64} color={S.primary} strokeWidth={1.6} />
        <div style={{ position: 'absolute', right: 10, bottom: 10, width: 34, height: 34, borderRadius: 17, background: S.surface, display: 'grid', placeItems: 'center' }}>
          <ImageIcon size={18} color={S.primary} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...base, maxWidth: 250, padding: '12px 16px', borderRadius: 18, fontSize: 21, fontWeight: 600, lineHeight: '27px' }}>{m.text}</div>
  );
};

/** Job chat. Same thread on both phones; "who" decides which side is mine. */
export const ChatScreen: React.FC<{ f: number; who: 'client' | 'provider' }> = ({ f, who }) => {
  const other = who === 'client' ? 'Ramon Dela Cruz' : 'Maria Santos';
  return (
    <Base>
      <StatusBar />
      <BackBtn />
      <div style={abs(76, 52, 44, 44)}><Avatar ini={other.split(' ').map((p) => p[0]).join('').slice(0, 2)} size={44} navy={who === 'client'} /></div>
      <div style={abs(132, 52, 210, 44, { fontSize: 21, fontWeight: 800, lineHeight: '44px', whiteSpace: 'nowrap', overflow: 'hidden' })}>{other}</div>
      <div style={abs(20, 118, 320, 560, { display: 'flex', flexDirection: 'column', gap: 12 })}>
        {MSGS.map((m) => <Bubble key={m.at} m={m} f={f} mine={m.from === who} />)}
      </div>
      <div style={abs(16, 688, 328, 62, { ...CARD, borderRadius: 31, display: 'flex', alignItems: 'center', padding: '0 8px 0 18px', boxSizing: 'border-box' })}>
        <span style={{ flex: 1, fontSize: 19, color: S.muted, fontWeight: 600 }}>Message…</span>
        <div style={{ width: 46, height: 46, borderRadius: 23, background: S.primary, display: 'grid', placeItems: 'center' }}><ArrowUp size={24} color={S.white} /></div>
      </div>
    </Base>
  );
};

/** Client job detail, tasks and the schedule change request. Ticks at 344 and 398 (proof photo). */
export const ClientJob: React.FC<{ f: number }> = ({ f }) => {
  const done = (f >= 344 ? 1 : 0) + (f >= 398 ? 1 : 0);
  const cardA = tw(f, 462, 472, 0, 1);
  const accepted = f >= 476;
  const proofA = tw(f, 400, 410, 0, 1);
  return (
    <Base>
      <StatusBar />
      <BackBtn />
      <div style={abs(76, 46, 264, 60, { fontSize: 24, fontWeight: 800, lineHeight: '29px' })}>{JOB_TITLE}</div>
      <div style={abs(76, 110, 264, 26, { fontSize: 19, fontWeight: 600, color: S.muted })}>Ramon Dela Cruz</div>
      <div style={abs(20, 160, 200, 34, { fontSize: 23, fontWeight: 800 })}>Tasks</div>
      <div style={abs(180, 162, 160, 30, { fontSize: 19, fontWeight: 700, color: S.muted, textAlign: 'right' })}>{`${done}/2 done`}</div>
      <TaskRow y={204} label="Fix leaking faucet" on={f >= 344} f={f} />
      <TaskRow y={256} label="Check the pipe" on={f >= 398} f={f} />
      <div style={abs(62, 318, 60, 60, { borderRadius: 14, background: S.tonal, display: 'grid', placeItems: 'center', opacity: proofA, transform: `scale(${0.85 + 0.15 * proofA})` })}>
        <Droplets size={28} color={S.primary} />
      </div>
      <div style={abs(20, 420, 320, 222, { ...CARD, padding: 16, boxSizing: 'border-box', opacity: cardA, transform: `translateY(${(1 - cardA) * 40}px)` })}>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px' }}>
          {accepted ? 'Date change accepted. The job has the new schedule.' : 'Ramon Dela Cruz asked to move this job to Sat, Oct 24, 2:00 PM.'}
        </div>
        {!accepted && <div style={{ fontSize: 19, color: S.muted, fontWeight: 600, marginTop: 10 }}>Reason: Parts arrive Saturday</div>}
        {!accepted && (
          <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, height: 52, borderRadius: 13, background: S.primary, color: S.white, display: 'grid', placeItems: 'center', fontSize: 21, fontWeight: 800, transform: `scale(${1 - hit(f, 470, 3) * 0.04})` }}>Accept</div>
            <div style={{ flex: 1, height: 52, borderRadius: 13, background: S.tonal, color: S.primary, display: 'grid', placeItems: 'center', fontSize: 21, fontWeight: 800 }}>Decline</div>
          </div>
        )}
      </div>
      {f >= 478 && <Action label="Leave Review" y={692} press={hit(f, 484, 3)} />}
      <Tap f={f} at={470} x={105} y={600} />
      <Tap f={f} at={484} x={180} y={720} />
    </Base>
  );
};

const STAR_AT = [502, 508, 514, 520, 526];

/** Client: Rate your provider. Five stars fill, the review is submitted at 534 and a done chip shows at 540. */
export const RateProvider: React.FC<{ f: number }> = ({ f }) => {
  const count = STAR_AT.filter((t) => f >= t).length;
  const done = f >= 540;
  const ready = count === 5;
  return (
    <Base>
      <StatusBar />
      <BackBtn />
      <Title x={76} w={264} size={24}>Rate your provider</Title>
      <div style={abs(138, 108, 84, 84, { borderRadius: 42, background: S.tonal, display: 'grid', placeItems: 'center' })}><Avatar ini="RD" size={84} navy /></div>
      <div style={abs(0, 204, 360, 34, { textAlign: 'center', fontSize: 24, fontWeight: 800 })}>Ramon Dela Cruz</div>
      <div style={abs(0, 240, 360, 28, { textAlign: 'center', fontSize: 19, fontWeight: 600, color: S.muted })}>{JOB_TITLE}</div>
      <div style={abs(35, 290, 290, 52, { display: 'flex', gap: 10 })}>
        {[0, 1, 2, 3, 4].map((i) => {
          const on = i < count;
          const pop = on ? hit(f, STAR_AT[i], 4) * 0.12 : 0;
          return <Star key={i} size={50} color={on ? S.amber : '#CBD5E1'} fill={on ? S.amber : 'transparent'} strokeWidth={2} style={{ transform: `scale(${1 + pop})` }} />;
        })}
      </div>
      <div style={abs(0, 356, 360, 34, { textAlign: 'center', fontSize: 22, fontWeight: 800, color: ready ? S.ink : S.muted })}>{ready ? 'Excellent' : 'Tap a star to rate'}</div>
      <div style={abs(20, 412, 320, 24, { fontSize: 19, fontWeight: 700, color: S.ink700 })}>Add a comment (optional)</div>
      <div style={abs(20, 444, 320, 110, { borderRadius: 14, border: `1.5px solid ${S.field}`, background: S.surface, boxSizing: 'border-box', padding: 14, fontSize: 21, color: S.muted, fontWeight: 500 })}>Tell others about the job</div>
      {done && (
        <div style={abs(60, 590, 240, 52, { borderRadius: 26, background: S.successSurface, border: `1.5px solid ${S.success}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 21, fontWeight: 800, color: S.success, opacity: tw(f, 540, 548, 0, 1) })}>
          <Check size={22} color={S.success} strokeWidth={3} /> Review submitted
        </div>
      )}
      <Action label="Submit review" tone={ready ? 'primary' : 'dim'} press={hit(f, 534, 3)} />
      <Tap f={f} at={534} x={180} y={720} />
    </Base>
  );
};

// ═════════════════════════ PROVIDER ═════════════════════════

const FEED_ROW_Y = 292;
const FEED_STEP = 118;

/** Provider Feed: availability on, the new job slides in at newAt with NEW, the bell badge pops. */
export const ProviderFeed: React.FC<{ f: number; newAt: number }> = ({ f, newAt }) => {
  const landed = f >= newAt;
  const k = tw(f, newAt, newAt + 14, 0, 1);
  const pBadge = Math.max(0, Math.min(1.1, sp(f, newAt + 4, BOUNCY)));
  const row = (y: number, title: string, meta: string, glow = 0) => (
    <div style={abs(20, y, 320, 104, { ...CARD, padding: 16, boxSizing: 'border-box', boxShadow: glow ? `0 0 0 ${3 + glow * 4}px rgba(3,105,161,${0.2 + 0.4 * glow})` : CARD.boxShadow })}>
      <div style={{ fontSize: 21, fontWeight: 800, lineHeight: '26px', paddingRight: 80 }}>{title}</div>
      <div style={{ fontSize: 19, color: S.muted, fontWeight: 600, marginTop: 6 }}>{meta}</div>
    </div>
  );
  const newP = tw(f, newAt, newAt + 14, 0, 1);
  return (
    <Base>
      <StatusBar />
      <div style={abs(20, 52, 52, 52, { borderRadius: 26, background: S.navyTonalStrong, color: S.navy, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 19 })}>RD</div>
      <div style={abs(84, 54, 180, 24, { fontSize: 18, color: S.muted, fontWeight: 600 })}>Hello</div>
      <div style={abs(84, 76, 200, 30, { fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap' })}>Ramon Dela Cruz</div>
      <div style={abs(288, 52, 52, 52, { borderRadius: 26, background: S.surface, border: `1px solid ${S.line}`, boxSizing: 'border-box', display: 'grid', placeItems: 'center' })}>
        <Bell size={24} color={S.ink700} />
      </div>
      {landed && (
        <div style={abs(322, 44, 26, 26, { borderRadius: 13, background: S.danger, color: S.white, fontSize: 18, fontWeight: 800, display: 'grid', placeItems: 'center', transform: `scale(${pBadge})` })}>1</div>
      )}
      <div style={abs(20, 128, 320, 88, { ...CARD, padding: '0 16px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12 })}>
        <div style={{ width: 13, height: 13, borderRadius: 7, background: S.success, flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 22, fontWeight: 800 }}>Available for jobs</div>
        <Toggle p={1} />
      </div>
      <div style={abs(20, 236, 260, 34, { fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap' })}>Open jobs near you</div>
      <div style={abs(292, 240, 40, 28, { borderRadius: 14, background: S.well, display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 800 })}>{landed ? 3 : 2}</div>
      {landed && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: 360, height: 776, opacity: newP, transform: `translateY(${(newP - 1) * 60}px)` }}>
          {row(FEED_ROW_Y, 'Fix leaking kitchen sink', 'Plumbing · Lipa City', 1 - Math.min(1, (f - newAt) / 22))}
          <div style={abs(250, FEED_ROW_Y + 14, 80, 24, { borderRadius: 12, background: S.navy, color: S.white, fontSize: 16, fontWeight: 800, display: 'grid', placeItems: 'center', transform: `scale(${Math.max(0, Math.min(1, sp(f, newAt + 6, BOUNCY)))})` })}>NEW</div>
        </div>
      )}
      {row(FEED_ROW_Y + k * FEED_STEP, 'Install ceiling fan', 'Handyman · Lipa City')}
      {row(FEED_ROW_Y + FEED_STEP + k * FEED_STEP, 'Deep clean condo', 'Cleaning · Lipa City')}
      <Nav tone="provider" active={0} />
      <Tap f={f} at={132} x={180} y={340} />
    </Base>
  );
};

/** Job detail before the proposal: the sheet slides up at 160, the message is typed from 164, Send is tapped at 200. */
export const ProviderJobPre: React.FC<{ f: number }> = ({ f }) => {
  const MSG = 'Hi! I can come on Tuesday at 9 AM.';
  const sent = f >= 206;
  const up = tw(f, 160, 172, 0, 1);
  const down = tw(f, 204, 216, 0, 1);
  const vis = up * (1 - down);
  const typing = f >= 164 && f < 200;
  return (
    <Base>
      <StatusBar />
      <BackBtn />
      <div style={abs(76, 46, 264, 60, { fontSize: 24, fontWeight: 800, lineHeight: '29px' })}>{JOB_TITLE}</div>
      <div style={abs(20, 118, 320, 26, { fontSize: 19, fontWeight: 600, color: S.muted })}>Plumbing · Lipa City</div>
      <div style={abs(20, 166, 320, 34, { fontSize: 23, fontWeight: 800 })}>What the job includes</div>
      {['Fix leaking faucet', 'Unclog drain', 'Check the pipe'].map((label, i) => (
        <div key={label} style={abs(20, 216 + i * 52, 320, 44, { display: 'flex', alignItems: 'center', gap: 14 })}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: S.primary, marginLeft: 10 }} />
          <div style={{ fontSize: 21, fontWeight: 700 }}>{label}</div>
        </div>
      ))}
      <Action label={sent ? 'Proposal sent' : 'Send a proposal'} tone={sent ? 'tonal' : 'primary'} press={hit(f, 200, 3)} />
      <Tap f={f} at={172} x={180} y={720} />
      {vis > 0 && <div style={abs(0, 0, 360, 776, { background: `rgba(15,23,42,${0.18 * vis})` })} />}
      <div style={abs(0, 276, 360, 500, { background: S.surface, borderRadius: '24px 24px 0 0', boxShadow: '0 -10px 30px rgba(15,23,42,0.18)', transform: `translateY(${(1 - vis) * 540}px)` })}>
        <div style={abs(20, 26, 320, 36, { fontSize: 26, fontWeight: 800 })}>Send a proposal</div>
        <div style={abs(20, 84, 320, 24, { fontSize: 19, fontWeight: 700, color: S.ink700 })}>Your message</div>
        <div style={abs(20, 114, 320, 150, { borderRadius: 14, border: `1.5px solid ${typing ? S.primary : S.field}`, boxSizing: 'border-box', padding: 14, fontSize: 21, fontWeight: 600, lineHeight: '28px' })}>
          {typed(MSG, f, 164, 30)}
          {typing && <span style={{ display: 'inline-block', width: 2, height: 22, background: S.primary, marginLeft: 2, opacity: Math.floor(f / 8) % 2 === 0 ? 1 : 0 }} />}
        </div>
        <div style={abs(20, 300, 320, 56, { borderRadius: 13, background: S.primary, color: S.white, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, transform: `scale(${1 - hit(f, 200, 3) * 0.04})` })}>Send proposal</div>
      </div>
      <Tap f={f} at={200} x={180} y={604} />
      <Toast f={f} at={208} out={236} title="Proposal sent" I={Check} />
    </Base>
  );
};

/** Working job (provider): tasks ticked at 336 and 390 (proof photo), Change date or time from 404. */
export const ProviderJobWorking: React.FC<{ f: number }> = ({ f }) => {
  const done = (f >= 336 ? 1 : 0) + (f >= 390 ? 1 : 0);
  const rescheduled = f >= 458;
  // proof sheet: slides in at 354, photo added at 368, Mark as done at 378, out by 394
  const pvis = tw(f, 354, 366, 0, 1) * (1 - tw(f, 386, 396, 0, 1));
  const photoIn = tw(f, 368, 378, 0, 1);
  // change date sheet: in at 410, out at 458
  const cvis = tw(f, 410, 422, 0, 1) * (1 - tw(f, 458, 468, 0, 1));
  const newDate = f >= 420;
  const newTime = f >= 426;
  const reason = typed('Parts arrive Saturday', f, 430, 40);
  return (
    <Base>
      <StatusBar />
      <BackBtn />
      <div style={abs(76, 46, 264, 60, { fontSize: 24, fontWeight: 800, lineHeight: '29px' })}>{JOB_TITLE}</div>
      <div style={abs(76, 110, 264, 26, { fontSize: 19, fontWeight: 600, color: S.muted })}>{rescheduled ? 'Sat, Oct 24 · 2:00 PM' : 'Tue, Oct 20 · 9:00 AM'}</div>
      <div style={abs(20, 160, 200, 34, { fontSize: 23, fontWeight: 800 })}>Tasks</div>
      <div style={abs(180, 162, 160, 30, { fontSize: 19, fontWeight: 700, color: S.muted, textAlign: 'right' })}>{`${done}/2 done`}</div>
      <TaskRow y={204} label="Fix leaking faucet" on={f >= 336} f={f} />
      <TaskRow y={256} label="Check the pipe" on={f >= 390} f={f} />
      <div style={abs(62, 318, 60, 60, { borderRadius: 14, background: S.tonal, display: 'grid', placeItems: 'center', opacity: tw(f, 394, 402, 0, 1) })}>
        <Droplets size={28} color={S.primary} />
      </div>
      <Action label="Change date or time" tone="tonal" y={692} press={hit(f, 404, 3)} />
      <Tap f={f} at={330} x={30} y={230} />
      <Tap f={f} at={348} x={30} y={282} />
      <Tap f={f} at={362} x={180} y={464} />
      <Tap f={f} at={378} x={180} y={590} />
      <Tap f={f} at={404} x={180} y={720} />
      {/* proof sheet */}
      {pvis > 0 && <div style={abs(0, 0, 360, 776, { background: `rgba(15,23,42,${0.18 * pvis})` })} />}
      <div style={abs(0, 300, 360, 476, { background: S.surface, borderRadius: '24px 24px 0 0', boxShadow: '0 -10px 30px rgba(15,23,42,0.18)', transform: `translateY(${(1 - pvis) * 500}px)` })}>
        <div style={abs(20, 26, 320, 36, { fontSize: 25, fontWeight: 800 })}>Show the finished task</div>
        <div style={abs(20, 84, 320, 160, { borderRadius: 16, background: S.tonal, display: 'grid', placeItems: 'center', opacity: photoIn, transform: `scale(${0.96 + 0.04 * photoIn})` })}>
          <Droplets size={64} color={S.primary} strokeWidth={1.6} />
        </div>
        <div style={abs(20, 262, 320, 56, { borderRadius: 13, background: photoIn > 0.5 ? S.primary : '#A9CDE0', color: S.white, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, transform: `scale(${1 - hit(f, 378, 3) * 0.04})` })}>Mark as done</div>
      </div>
      {/* change date sheet */}
      {cvis > 0 && <div style={abs(0, 0, 360, 776, { background: `rgba(15,23,42,${0.18 * cvis})` })} />}
      <div style={abs(0, 250, 360, 526, { background: S.surface, borderRadius: '24px 24px 0 0', boxShadow: '0 -10px 30px rgba(15,23,42,0.18)', transform: `translateY(${(1 - cvis) * 540}px)` })}>
        <div style={abs(20, 26, 320, 36, { fontSize: 25, fontWeight: 800 })}>Change date or time</div>
        <div style={abs(20, 76, 320, 22, { fontSize: 18, fontWeight: 600, color: S.muted })}>Current schedule</div>
        <div style={abs(20, 100, 320, 30, { fontSize: 21, fontWeight: 700 })}>Tue, Oct 20 · 9:00 AM</div>
        <div style={abs(20, 146, 320, 24, { fontSize: 19, fontWeight: 700, color: S.ink700 })}>New date</div>
        <div style={abs(20, 174, 320, 52, { borderRadius: 14, border: `1.5px solid ${newDate ? S.primary : S.field}`, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 21, fontWeight: 700, color: newDate ? S.ink : S.muted })}>{newDate ? 'Sat, Oct 24' : 'Pick a date'}</div>
        <div style={abs(20, 240, 320, 24, { fontSize: 19, fontWeight: 700, color: S.ink700 })}>New time</div>
        <div style={abs(20, 268, 320, 52, { borderRadius: 14, border: `1.5px solid ${newTime ? S.primary : S.field}`, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 21, fontWeight: 700, color: newTime ? S.ink : S.muted })}>{newTime ? '2:00 PM' : 'Pick a time'}</div>
        <div style={abs(20, 334, 320, 24, { fontSize: 19, fontWeight: 700, color: S.ink700 })}>Reason</div>
        <div style={abs(20, 362, 320, 52, { borderRadius: 14, border: `1.5px solid ${reason ? S.primary : S.field}`, boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 21, fontWeight: 600 })}>{reason}</div>
        <div style={abs(20, 440, 320, 56, { borderRadius: 13, background: S.primary, color: S.white, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, transform: `scale(${1 - hit(f, 452, 3) * 0.04})` })}>Send request</div>
      </div>
      <Tap f={f} at={420} x={180} y={450} />
      <Tap f={f} at={452} x={180} y={718} />
    </Base>
  );
};

// ═════════════════════════ LOOP SCREEN TIMELINE ═════════════════════════
// Global frames. Each phone is a sequence of screens; Screens cross-fades between them.

export const CLIENT_SCREENS: Scr[] = [
  { at: 0, render: (f) => <ClientService f={f} />, kind: 'none' },
  { at: 32, render: (f) => <ClientTasks f={f} />, kind: 'push' },
  { at: 82, render: (f) => <ClientPosted f={f} at={82} />, kind: 'fade' },
  { at: 98, render: (f) => <ClientMyJobs f={f} />, kind: 'push' },
  { at: 230, render: (f) => <ClientProposals f={f} />, kind: 'push' },
  { at: 244, render: (f) => <MessagesList f={f} tone="client" name="Ramon Dela Cruz" />, kind: 'fade' },
  { at: 258, render: (f) => <ChatScreen f={f} who="client" />, kind: 'push' },
  { at: 322, render: (f) => <ClientJob f={f} />, kind: 'push' },
  { at: 486, render: (f) => <RateProvider f={f} />, kind: 'push' },
];

export const PROVIDER_SCREENS: Scr[] = [
  { at: 0, render: (f) => <ProviderFeed f={f} newAt={104} />, kind: 'none' },
  { at: 140, render: (f) => <ProviderJobPre f={f} />, kind: 'push' },
  { at: 244, render: (f) => <MessagesList f={f} tone="provider" name="Maria Santos" />, kind: 'fade' },
  { at: 258, render: (f) => <ChatScreen f={f} who="provider" />, kind: 'push' },
  { at: 322, render: (f) => <ProviderJobWorking f={f} />, kind: 'push' },
];
