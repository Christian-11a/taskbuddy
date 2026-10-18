import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Check, ClipboardList, House, MessageCircle, Search, Star, User, X, EllipsisVertical } from 'lucide-react';
import { INTER } from '../theme';
import { SNAPPY, hit, sp, tw } from '../motion';

// Exact light-mode tokens from mobile/src/constants/theme.ts + palettes.ts.
export const T = {
  ink900: '#0F172A', ink800: '#1E293B', ink700: '#314158', ink500: '#526073', ink300: '#94A3B8', ink100: '#E2E8F0', ink50: '#F1F5F9',
  canvas: '#F6F8FA', surface: '#FFFFFF', line: '#E5EAEF', hairline: '#EDF1F4', field: '#DCE3E9', well: '#F5F8FA', skeleton: '#E8EDF2',
  okText: '#15803D', okSurface: '#F0FDF4', okBorder: '#BBF7D0', okSolid: '#15803D',
  warnText: '#92400E', warnSurface: '#FFFBEB', warnBorder: '#FDE68A',
  danger: '#B91C1C', amber: '#F59E0B', white: '#FFFFFF',
  sky: '#0369A1', navy: '#13283C',
} as const;
export type Tone = 'client' | 'provider';
// Client uses the Sky palette; the provider app swaps in the navy palette (providerLightPalette).
export const pal = (tone: Tone) => tone === 'provider'
  ? { primary: '#13283C', tonal: '#E8EDF3', tonalStrong: '#D0DAE5', deep: '#13283C', link: '#2D4A68' }
  : { primary: '#0369A1', tonal: '#E0F2FE', tonalStrong: '#BAE6FD', deep: '#0C4A6E', link: '#0369A1' };

// Pixel 8 in dp (1080 x 2400 px at 420 dpi), so positions read straight off the reference screenshots.
export const DW = 411;
export const DH = 914;

export const Phone: React.FC<{ w: number; children: React.ReactNode }> = ({ w, children }) => {
  const pad = w * 0.022;
  const k = (w - pad * 2) / DW;
  return (
    <div style={{ width: w, height: DH * k + pad * 2, borderRadius: w * 0.12, background: '#0B1220', padding: pad, position: 'relative', boxShadow: `0 ${w * 0.07}px ${w * 0.18}px rgba(6,20,34,0.34)` }}>
      <div style={{ width: DW * k, height: DH * k, borderRadius: w * 0.1, overflow: 'hidden', position: 'relative', background: T.canvas }}>
        <div style={{ width: DW, height: DH, transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', fontFamily: INTER, color: T.ink900 }}>{children}</div>
        <div style={{ position: 'absolute', top: 14 * k, left: '50%', width: 20 * k, height: 20 * k, marginLeft: -10 * k, borderRadius: 20 * k, background: '#0B1220', zIndex: 20 }} />
      </div>
    </div>
  );
};
export const phoneH = (w: number) => DH * ((w - w * 0.044) / DW) + w * 0.044;

export const StatusBar: React.FC = () => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 26px 0 28px', fontSize: 14.5, fontWeight: 500, color: T.ink900, zIndex: 25 }}>
    <span>9:41</span>
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>{[4, 7, 10, 13].map((h, i) => <span key={i} style={{ width: 3, height: h, borderRadius: 1, background: T.ink900 }} />)}</span>
      <svg width="17" height="13" viewBox="0 0 24 18"><path d="M12 17.5 0.8 6.3a16 16 0 0 1 22.4 0Z" fill={T.ink900} /></svg>
      <span style={{ width: 24, height: 12, borderRadius: 3.5, background: T.ink900 }} />
    </span>
  </div>
);

const CLIENT_TABS: [string, LucideIcon][] = [['Home', House], ['My Jobs', ClipboardList], ['Messages', MessageCircle], ['Profile', User]];
const PROVIDER_TABS: [string, LucideIcon][] = [['Feed', Search], ['My Work', ClipboardList], ['Messages', MessageCircle], ['Profile', User]];
export const TabBar: React.FC<{ tone: Tone; active: number }> = ({ tone, active }) => {
  const p = pal(tone);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 112, background: T.surface, borderTop: `1px solid ${T.line}`, display: 'flex', paddingTop: 10, zIndex: 6 }}>
      {(tone === 'provider' ? PROVIDER_TABS : CLIENT_TABS).map(([l, I], i) => {
        const on = i === active;
        return (
          <div key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: on ? p.deep : T.ink500 }}>
            <div style={{ width: 58, height: 32, borderRadius: 16, background: on ? p.tonalStrong : 'transparent', display: 'grid', placeItems: 'center' }}><I size={22} strokeWidth={on ? 2.2 : 1.8} /></div>
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 500 }}>{l}</span>
          </div>
        );
      })}
      <GestureBar />
    </div>
  );
};
export const GestureBar: React.FC = () => <div style={{ position: 'absolute', bottom: 8, left: '50%', width: 106, height: 4, marginLeft: -53, borderRadius: 4, background: T.ink700 }} />;

/** Round back/close button + title (PostAppBar / VerifyAppBar / detail headers). `white` = header on a white bar with a bottom line. */
export const AppBar: React.FC<{ title: string; icon?: 'back' | 'close'; white?: boolean; menu?: boolean; size?: number; y?: number }> = ({ title, icon = 'back', white, menu, size = 18, y = 90 }) => {
  const I = icon === 'close' ? X : ArrowLeft;
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: y + 30 + (white ? 12 : 0), paddingTop: y - 20, display: 'flex', alignItems: 'flex-start', gap: 12, padding: `${y - 20}px 20px 0`, background: white ? T.surface : T.canvas, borderBottom: white ? `1px solid ${T.line}` : undefined, zIndex: 4 }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: T.surface, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={20} color={T.ink800} /></div>
      <div style={{ flex: 1, fontSize: size, fontWeight: size > 18 ? 800 : 700, lineHeight: '40px' }}>{title}</div>
      {menu && <div style={{ width: 40, height: 40, borderRadius: 12, background: T.surface, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center' }}><EllipsisVertical size={20} color={T.ink700} /></div>}
    </div>
  );
};

/** PostProgress: five bars + "STEP n OF 5 · LABEL". */
export const Steps: React.FC<{ n: number; label: string; tone: Tone; f?: number; at?: number }> = ({ n, label, tone, f = 0, at = -99 }) => {
  const p = pal(tone);
  return (
    <div style={{ position: 'absolute', top: 150, left: 20, right: 20 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: T.ink100, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${i < n ? 100 : i === n ? tw(f, at, at + 10, 0, 100) : 0}%`, background: p.primary }} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, lineHeight: '16px', letterSpacing: 0.6, color: p.link }}>{`STEP ${n} OF 5 · ${label.toUpperCase()}`}</div>
    </div>
  );
};

export const StepTitle: React.FC<{ children: React.ReactNode; sub?: string; top?: number; size?: number }> = ({ children, sub, top = 218, size = 23 }) => (
  <div style={{ position: 'absolute', top, left: 20, right: 20 }}>
    <div style={{ fontSize: size, fontWeight: 800, lineHeight: `${size * 1.25}px` }}>{children}</div>
    {sub && <div style={{ fontSize: 16.5, lineHeight: '21px', color: T.ink500, marginTop: 4 }}>{sub}</div>}
  </div>
);

/** PostFooter / BottomActionBar: white bar with a top line. */
export const Footer: React.FC<{ children: React.ReactNode; note?: string; link?: string; tone?: Tone; h?: number }> = ({ children, note, link, tone = 'client', h }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, padding: `${note ? 8 : 12}px 20px ${link ? 18 : 28}px`, background: T.surface, borderTop: `1px solid ${T.line}`, zIndex: 5 }}>
    {note && <div style={{ textAlign: 'center', fontSize: 13, color: T.ink700, marginBottom: 10 }}>{note}</div>}
    <div style={{ display: 'flex', gap: 12 }}>{children}</div>
    {link && <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: pal(tone).link, marginTop: 10, lineHeight: '18px' }}>{link}</div>}
    <GestureBar />
  </div>
);

export const Btn: React.FC<{ label: React.ReactNode; f?: number; press?: number; tone?: Tone; kind?: 'solid' | 'back'; off?: boolean; h?: number; r?: number; size?: number; style?: React.CSSProperties }> = ({ label, f = 0, press, tone = 'client', kind = 'solid', off, h = 48, r = 14, size = 15, style }) => {
  const p = pal(tone);
  const k = press != null ? hit(f, press, 3) : 0;
  return (
    <div style={{ height: h, borderRadius: r, background: kind === 'back' ? p.tonal : p.primary, color: kind === 'back' ? p.deep : T.white, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: size, fontWeight: 700, opacity: off ? 0.5 : 1, transform: `scale(${1 - k * 0.04})`, ...style }}>{label}</div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; r?: number }> = ({ children, style, r = 18 }) => (
  <div style={{ background: T.surface, borderRadius: r, border: `1px solid ${T.line}`, padding: 14, ...style }}>{children}</div>
);

export const Avatar: React.FC<{ ini: string; size?: number; tone?: Tone; strong?: boolean; fs?: number }> = ({ ini, size = 44, tone = 'client', strong, fs }) => {
  const p = pal(tone);
  return <div style={{ width: size, height: size, borderRadius: size, background: strong ? p.tonalStrong : p.tonal, color: p.deep, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: fs ?? size * 0.33, flexShrink: 0 }}>{ini}</div>;
};

/** SectionHeader: 17/600 title, optional count badge, optional link. */
export const Section: React.FC<{ title: string; count?: number; link?: string; tone?: Tone; style?: React.CSSProperties; pop?: number }> = ({ title, count, link, tone = 'client', style, pop = 1 }) => {
  const p = pal(tone);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
        {count != null && <div style={{ minWidth: 24, height: 22, borderRadius: 11, padding: '0 7px', background: p.tonal, color: p.deep, fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center', transform: `scale(${pop})` }}>{count}</div>}
      </div>
      {link && <div style={{ fontSize: 14, fontWeight: 600, color: p.link }}>{link}</div>}
    </div>
  );
};

/** FilterPill. */
export const Pill: React.FC<{ label: string; count?: number; on?: boolean; tone?: Tone; scale?: number }> = ({ label, count, on, tone = 'client', scale = 1 }) => {
  const p = pal(tone);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 999, background: on ? p.primary : T.surface, border: on ? `1px solid ${p.primary}` : `1px solid ${T.line}`, whiteSpace: 'nowrap', transform: `scale(${scale})` }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: on ? T.white : T.ink700 }}>{label}</span>
      {count != null && <span style={{ fontSize: 12, fontWeight: 700, color: on ? T.white : T.ink500 }}>{count}</span>}
    </div>
  );
};

export const Radio: React.FC<{ on: boolean; tone?: Tone }> = ({ on, tone = 'client' }) => (
  <div style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${on ? pal(tone).primary : T.field}`, display: 'grid', placeItems: 'center', flexShrink: 0, background: T.surface }}>
    {on && <div style={{ width: 11, height: 11, borderRadius: 6, background: pal(tone).primary }} />}
  </div>
);

export const Box: React.FC<{ on: boolean; f?: number; at?: number; tone?: Tone; size?: number }> = ({ on, f = 0, at = -99, tone = 'client', size = 22 }) => (
  <div style={{ width: size, height: size, borderRadius: 6, border: `1.5px solid ${on ? pal(tone).primary : T.line}`, background: on ? pal(tone).primary : T.surface, display: 'grid', placeItems: 'center', flexShrink: 0, transform: `scale(${1 + hit(f, at, 4) * 0.3})` }}>
    {on && <Check size={size * 0.66} color={T.white} strokeWidth={3} />}
  </div>
);

export type StatusTone = 'attention' | 'booked' | 'action' | 'done';
/** StatusCard. `action` follows the app palette (Sky for clients, navy for providers). */
export const Status: React.FC<{ tone: StatusTone; over: string; title: string; body?: string; I: LucideIcon; app?: Tone; f?: number; at?: number; children?: React.ReactNode }> = ({ tone, over, title, body, I, app = 'client', f = 0, at = -99, children }) => {
  const p = pal(app);
  const t = tone === 'attention' ? { bg: T.warnSurface, border: T.warnBorder, fg: T.warnText }
    : tone === 'action' ? { bg: p.tonal, border: p.tonal, fg: p.deep }
      : { bg: T.okSurface, border: T.okBorder, fg: T.okText };
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, transform: `scale(${1 + hit(f, at, 6) * 0.035})` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.fg, fontSize: 10, fontWeight: 700, lineHeight: '14px', letterSpacing: 0.6 }}><I size={16} />{over.toUpperCase()}</div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{title}</div>
      {body && <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink700 }}>{body}</div>}
      {children}
    </div>
  );
};

/** ProgressStepper: Posted / Hired / Working / Done. */
export const Stepper: React.FC<{ n: number; tone?: Tone }> = ({ n, tone = 'client' }) => {
  const p = pal(tone);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {['Posted', 'Hired', 'Working', 'Done'].map((l, i) => (
        <div key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 6, borderRadius: 3, background: i <= n ? p.primary : T.line }} />
          <div style={{ fontSize: 11, lineHeight: '14px', fontWeight: i === n ? 600 : 500, color: i === n ? p.link : i < n ? T.ink700 : T.ink500 }}>{l}</div>
        </div>
      ))}
    </div>
  );
};

/** PersonCard: avatar, name, optional star + subtitle, optional message button. */
export const Person: React.FC<{ name: string; ini: string; sub?: string; star?: boolean; msg?: boolean; tone?: Tone; style?: React.CSSProperties }> = ({ name, ini, sub, star, msg, tone = 'client', style }) => {
  const p = pal(tone);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface, ...style }}>
      <Avatar ini={ini} tone={tone} fs={14} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{name}</div>
        {sub && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, lineHeight: '18px', color: T.ink500, marginTop: 2 }}>{star && <Star size={13} color={T.amber} fill={T.amber} />}{sub}</div>}
      </div>
      {msg && <div style={{ width: 40, height: 40, borderRadius: 20, background: p.tonal, display: 'grid', placeItems: 'center' }}><MessageCircle size={19} color={p.link} /></div>}
    </div>
  );
};

/** EmptyCard + EmptyRow. */
export const Empty: React.FC<{ I: LucideIcon; title: string; body: string; tone?: Tone; style?: React.CSSProperties }> = ({ I, title, body, tone = 'client', style }) => (
  <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18, padding: '0 16px', ...style }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: pal(tone).tonal, display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={20} color={pal(tone).link} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{title}</div><div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500 }}>{body}</div></div>
    </div>
  </div>
);

/** Android heads-up notification. */
export const Notice: React.FC<{ f: number; at: number; out: number; title: string; body: string }> = ({ f, at, out, title, body }) => {
  if (f < at || f > out + 12) return null;
  const p = sp(f, at, SNAPPY) * tw(f, out, out + 10, 1, 0);
  return (
    <div style={{ position: 'absolute', left: 10, right: 10, top: 40, padding: '14px 16px', borderRadius: 24, background: '#F3F4F7', boxShadow: '0 10px 30px rgba(8,24,40,0.22)', transform: `translateY(${(1 - p) * -130}px)`, zIndex: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.ink500 }}>
        <div style={{ width: 18, height: 18, borderRadius: 9, background: T.sky, color: T.white, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800 }}>T</div>TaskBuddy · now
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 7 }}>{title}</div>
      <div style={{ fontSize: 14, color: T.ink700, marginTop: 2, lineHeight: '19px' }}>{body}</div>
    </div>
  );
};

/** SheetFrame bottom sheet. `p` 0..1. */
export const Sheet: React.FC<{ p: number; children: React.ReactNode }> = ({ p, children }) => (
  <>
    <div style={{ position: 'absolute', inset: 0, background: `rgba(15,23,42,${0.5 * p})`, zIndex: 30 }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: T.surface, borderRadius: '24px 24px 0 0', padding: '0 24px 28px', transform: `translateY(${(1 - p) * 105}%)`, zIndex: 31 }}>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}><div style={{ width: 40, height: 4, borderRadius: 4, background: T.ink100 }} /></div>
      {children}
    </div>
  </>
);

export const Caret: React.FC<{ f: number; until: number; h?: number; tone?: Tone }> = ({ f, until, h = 19, tone = 'client' }) => (
  <span style={{ display: 'inline-block', width: 2, height: h, marginLeft: 1, verticalAlign: 'middle', background: pal(tone).link, opacity: f < until && Math.floor(f / 8) % 2 === 0 ? 1 : 0 }} />
);

/** Info card with When / Where rows. */
export const WhenWhere: React.FC<{ when: string; where: string; I1: LucideIcon; I2: LucideIcon; sub?: string; style?: React.CSSProperties }> = ({ when, where, I1, I2, sub, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface, ...style }}>
    {[[I1, 'When', when], [I2, 'Where', where]].map(([I, k, v]: any, i) => (
      <React.Fragment key={k}>
        {i === 1 && <div style={{ height: 1, background: T.line }} />}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <I size={18} color={T.ink700} style={{ marginTop: 2 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: T.ink500 }}>{k}</div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{v}</div>
            {i === 1 && sub && <div style={{ fontSize: 13, color: T.ink500 }}>{sub}</div>}
          </div>
        </div>
      </React.Fragment>
    ))}
  </div>
);
