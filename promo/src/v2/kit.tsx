import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bell, Check, ClipboardList, House, MapPin, MessageCircle, Search, Star as StarIcon, User } from 'lucide-react';
import { INTER } from '../theme';
import { BOUNCY, FPS, SNAPPY, expoIn, expoOut, hit, sp, tw } from '../motion';

// ── Sky look (mobile/src/constants/palettes.ts + theme.ts), light mode only ───
// Flat: no gradients inside app screens, soft hairline borders.
export const S = {
  primary: '#0369A1',      // Sky primary: white text on it is 5.9:1
  primaryDeep: '#075985',
  brandDark: '#0C4A6E',    // brand dark, active tab text
  sky: '#0284C7',
  skyLight: '#BAE6FD',     // active tab pill (primaryTonalStrong)
  tonal: '#E0F2FE',        // primaryTonal: icon wells, tinted tiles
  ink: '#0F172A',
  ink700: '#334155',
  muted: '#526073',        // muted text, 4.5:1 on canvas
  inactive: '#64748B',     // inactive tab
  canvas: '#F6F8FA',
  surface: '#FFFFFF',
  line: '#E2E8F0',
  hairline: '#E8EDF2',
  well: '#F1F5F9',
  field: '#CBD5E1',
  danger: '#B91C1C',
  dangerSurface: '#FEF2F2',
  success: '#15803D',
  successSurface: '#F0FDF4',
  amber: '#F59E0B',
  warningText: '#92400E',
  navy: '#13283C',         // provider navy (providerHero / primary)
  navyTonal: '#E8EDF3',
  navyTonalStrong: '#D0DAE5',
  navyLink: '#2D4A68',
  white: '#FFFFFF',
} as const;

// Legacy token names kept for the older film files (Stage, HOScreens, SPScreens, Bookends, StoryClip).
export const A = {
  cyan50: S.tonal, cyan100: S.skyLight, cyan200: S.skyLight, cyan500: S.sky, cyan600: S.primary, cyan700: S.primary, cyan800: S.brandDark, cyan900: S.brandDark,
  ink25: '#F8FAFC', ink50: '#F1F5F9', ink100: S.line, ink200: S.field, ink300: '#94A3B8', ink400: S.muted, ink500: S.muted, ink700: S.ink700, ink900: S.ink,
  green500: '#22C55E', green600: S.success, amber500: S.amber, amber700: S.warningText, red500: '#EF4444', blue: '#3B82F6', purple: '#7C3AED',
  white: S.white, canvas: S.canvas, line: S.line, hairline: S.hairline, well: S.well,
  hoHero: S.primary, spHero: S.navy,
};

export const DP_W = 360;
export const DP_H = 776;
export const FONT = INTER;

// ── Phone shell: content is authored in dp (360 wide) and scaled to fit ─────
export const Phone: React.FC<{ w: number; children: React.ReactNode; glow?: string }> = ({ w, children, glow }) => {
  const pad = w * 0.022;
  const k = (w - pad * 2) / DP_W;
  const h = DP_H * k + pad * 2;
  return (
    <div
      style={{
        width: w, height: h, borderRadius: w * 0.135, background: '#0B1220', padding: pad, position: 'relative',
        boxShadow: `0 ${w * 0.06}px ${w * 0.16}px rgba(12,26,40,0.28)${glow ? `, 0 0 ${w * 0.12}px ${glow}` : ''}`,
      }}
    >
      <div style={{ width: DP_W * k, height: DP_H * k, borderRadius: w * 0.115, overflow: 'hidden', position: 'relative', background: S.canvas }}>
        <div style={{ width: DP_W, height: DP_H, transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', fontFamily: INTER, color: S.ink }}>
          {children}
        </div>
        <div style={{ position: 'absolute', top: 10 * k, left: '50%', width: 96 * k, height: 28 * k, marginLeft: -48 * k, borderRadius: 20 * k, background: '#0B1220', zIndex: 20 }} />
      </div>
    </div>
  );
};

// Generic time, no carrier text.
export const StatusBar: React.FC<{ light?: boolean }> = ({ light }) => {
  const c = light ? S.white : S.ink;
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 28px 0', fontSize: 16, fontWeight: 700, color: c, zIndex: 5 }}>
      <span>9:41</span>
      <span style={{ width: 24, height: 12, borderRadius: 3, border: `1.5px solid ${c}`, position: 'relative' }}>
        <span style={{ position: 'absolute', top: 2, bottom: 2, left: 2, right: 7, borderRadius: 1, background: c }} />
      </span>
    </div>
  );
};

// ── Tab bars: 4 tabs, Messages included, no wallet tab, no plus button ──────
export type TabItem = { l: string; I: LucideIcon };
const CLIENT_TABS: TabItem[] = [{ l: 'Home', I: House }, { l: 'My Jobs', I: ClipboardList }, { l: 'Messages', I: MessageCircle }, { l: 'Profile', I: User }];
const PROVIDER_TABS: TabItem[] = [{ l: 'Feed', I: Search }, { l: 'My Work', I: ClipboardList }, { l: 'Messages', I: MessageCircle }, { l: 'Profile', I: User }];

export const TabBar: React.FC<{ tabs: TabItem[]; active: number; tone?: 'client' | 'provider' }> = ({ tabs, active, tone = 'client' }) => {
  const pill = tone === 'provider' ? S.navyTonalStrong : S.skyLight;
  const on = tone === 'provider' ? S.navy : S.brandDark;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 84, background: S.surface, borderTop: `1px solid ${S.hairline}`, display: 'flex', alignItems: 'flex-start', padding: '9px 8px 0', zIndex: 6 }}>
      {tabs.map((t, i) => {
        const isOn = i === active;
        return (
          <div key={t.l} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: isOn ? on : S.inactive }}>
            <div style={{ width: 64, height: 34, borderRadius: 17, background: isOn ? pill : 'transparent', display: 'grid', placeItems: 'center' }}>
              <t.I size={24} strokeWidth={isOn ? 2.4 : 2} />
            </div>
            <span style={{ fontSize: 14, fontWeight: isOn ? 800 : 600 }}>{t.l}</span>
          </div>
        );
      })}
    </div>
  );
};

export const HONav: React.FC<{ active?: number; press?: number }> = ({ active = 0 }) => <TabBar tabs={CLIENT_TABS} active={active} tone="client" />;
export const SPNav: React.FC<{ active?: number }> = ({ active = 0 }) => <TabBar tabs={PROVIDER_TABS} active={active} tone="provider" />;

// ── Header bar: round button + title (Post a job pattern) ───────────────────
export const HeaderBar: React.FC<{ title: string; leading?: LucideIcon; trailing?: React.ReactNode; style?: React.CSSProperties }> = ({ title, leading: Lead, trailing, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', height: 64, ...style }}>
    {Lead && (
      <div style={{ width: 44, height: 44, borderRadius: 22, background: S.surface, border: `1px solid ${S.line}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Lead size={22} color={S.ink700} />
      </div>
    )}
    <div style={{ fontSize: 24, fontWeight: 800, flex: 1, letterSpacing: -0.2 }}>{title}</div>
    {trailing}
  </div>
);

/** Five segments filled up to the current step, then "STEP n OF N · NAME" (PostProgress). */
export const StepBars: React.FC<{ step: number; total: number; label: string; tone?: 'client' | 'provider' }> = ({ step, total, label, tone = 'client' }) => (
  <div style={{ padding: '0 20px' }}>
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < step ? S.primary : S.line }} />
      ))}
    </div>
    <div style={{ marginTop: 9, fontSize: 14, fontWeight: 800, letterSpacing: 0.6, color: tone === 'provider' ? S.navyLink : S.primary }}>
      {`STEP ${step} OF ${total} · ${label.toUpperCase()}`}
    </div>
  </div>
);

// ── Small pieces ────────────────────────────────────────────────────────────
export const Pill: React.FC<{ label: string; color: string; bg: string; dot?: boolean; size?: number; style?: React.CSSProperties; border?: string }> = ({ label, color, bg, dot, size = 13, style, border }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: `${size * 0.36}px ${size * 0.8}px`, borderRadius: 999, background: bg, color, fontWeight: 800, fontSize: size, whiteSpace: 'nowrap', border, ...style }}>
    {dot && <span style={{ width: size * 0.6, height: size * 0.6, borderRadius: 9, background: color }} />}
    {label}
  </div>
);

/** Filter chip (All / Urgent / Normal). Selected = filled tone, else outlined. */
export const Chip: React.FC<{ label: string; count?: number; on?: boolean; tone?: 'client' | 'provider'; style?: React.CSSProperties }> = ({ label, count, on, tone = 'provider', style }) => {
  const fill = tone === 'provider' ? S.navy : S.primary;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 999, background: on ? fill : S.surface, border: on ? `1px solid ${fill}` : `1px solid ${S.line}`, color: on ? S.white : S.ink700, fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', ...style }}>
      {label}
      {count != null && <span style={{ fontWeight: 800, opacity: on ? 1 : 0.75 }}>{count}</span>}
    </div>
  );
};

export const Btn: React.FC<{ label: React.ReactNode; f?: number; press?: number; bg?: string; color?: string; h?: number; style?: React.CSSProperties }> = ({ label, f = 0, press, bg = S.primary, color = S.white, h = 52, style }) => {
  const p = press != null ? hit(f, press, 3) : 0;
  return (
    <div style={{ height: h, borderRadius: 13, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 19, fontWeight: 800, transform: `scale(${1 - p * 0.04})`, boxShadow: bg === S.primary ? '0 6px 14px rgba(3,105,161,0.22)' : undefined, ...style }}>
      {label}
    </div>
  );
};
export const SecondaryBtn: React.FC<React.ComponentProps<typeof Btn>> = (props) => <Btn bg={S.tonal} color={S.primary} {...props} />;
export const DangerBtn: React.FC<React.ComponentProps<typeof Btn>> = (props) => <Btn bg={S.danger} {...props} />;

export const Avatar: React.FC<{ ini: string; size?: number; bg?: string; color?: string }> = ({ ini, size = 44, bg = S.primary, color = S.white }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: bg, color, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>{ini}</div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: S.surface, borderRadius: 17, border: `1px solid ${S.line}`, padding: 16, boxShadow: '0 1px 2px rgba(12,74,110,0.05)', ...style }}>{children}</div>
);

/** Date tile used on job rows, e.g. MON / 19. */
export const DateTile: React.FC<{ d: string; n: string; tone?: 'client' | 'provider' }> = ({ d, n, tone = 'provider' }) => (
  <div style={{ width: 62, height: 66, borderRadius: 14, background: tone === 'provider' ? S.navyTonal : S.tonal, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 0.4, color: S.muted }}>{d}</div>
    <div style={{ fontSize: 24, fontWeight: 800, lineHeight: '26px' }}>{n}</div>
  </div>
);

/** A row in a list: optional date tile, title, meta line, optional right slot. `glow` 0..1 adds a highlight ring. */
export const ListRow: React.FC<{ title: string; meta: React.ReactNode; date?: { d: string; n: string }; tag?: React.ReactNode; right?: React.ReactNode; glow?: number; tone?: 'client' | 'provider'; style?: React.CSSProperties }> = ({ title, meta, date, tag, right, glow = 0, tone = 'provider', style }) => (
  <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, boxShadow: glow ? `0 0 0 ${2 + glow * 3}px rgba(3,105,161,${0.25 + 0.5 * glow})` : undefined, ...style }}>
    {date && <DateTile d={date.d} n={date.n} tone={tone} />}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 19, fontWeight: 800, lineHeight: '24px' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, color: S.muted, fontSize: 15.5, fontWeight: 600 }}>{meta}</div>
      {tag && <div style={{ marginTop: 8 }}>{tag}</div>}
    </div>
    {right}
  </Card>
);

/** Labelled form field. `text` is what is typed so far (use `typed` to drive it). */
export const FormField: React.FC<{ label: string; text: string; active?: boolean; f?: number; caretUntil?: number; h?: number; icon?: LucideIcon; placeholder?: string }> = ({ label, text, active, f = 0, caretUntil = 0, h = 56, icon: Icon, placeholder }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 15, fontWeight: 700, color: S.ink700, marginBottom: 7 }}>{label}</div>
    <div style={{ minHeight: h, borderRadius: 14, border: `1.5px solid ${active ? S.primary : S.field}`, background: S.surface, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 600, boxShadow: active ? `0 0 0 4px rgba(3,105,161,0.12)` : undefined }}>
      {Icon && <Icon size={20} color={S.primary} />}
      <span style={{ color: text ? S.ink : S.muted, fontWeight: text ? 600 : 500 }}>{text || placeholder || ''}</span>
      {active && <Caret f={f} until={caretUntil} />}
    </div>
  </div>
);

/** Toggle: p = 0 (off) .. 1 (on). Drive p with tw/sp from the screen. */
export const Toggle: React.FC<{ p: number }> = ({ p }) => {
  const on = p > 0.5;
  return (
    <div style={{ width: 56, height: 32, borderRadius: 16, background: on ? S.success : S.field, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 4, left: 4 + p * 24, width: 24, height: 24, borderRadius: 12, background: S.white, boxShadow: '0 1px 3px rgba(15,23,42,0.25)' }} />
    </div>
  );
};

/** Tile in a 2-column grid. `scale` lets the screen press it. */
export const ServiceTile: React.FC<{ label: string; I: LucideIcon; selected?: boolean; scale?: number; height?: number }> = ({ label, I, selected, scale = 1, height = 122 }) => (
  <div style={{ height, borderRadius: 16, background: selected ? S.tonal : S.surface, border: `1.5px solid ${selected ? S.primary : S.line}`, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', transform: `scale(${scale})` }}>
    <div style={{ width: 46, height: 46, borderRadius: 13, background: selected ? S.surface : S.tonal, display: 'grid', placeItems: 'center' }}>
      <I size={24} color={S.primary} strokeWidth={2.1} />
    </div>
    <div style={{ fontSize: 19, fontWeight: 800 }}>{label}</div>
    {selected && (
      <div style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, background: S.primary, display: 'grid', placeItems: 'center', transform: `scale(${scale})` }}>
        <Check size={17} color={S.white} strokeWidth={3} />
      </div>
    )}
  </div>
);
export const TileGrid: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...style }}>{children}</div>
);

export const Stars: React.FC<{ n: number; size?: number }> = ({ n, size = 22 }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {[0, 1, 2, 3, 4].map((i) => (
      <StarIcon key={i} size={size} color={S.amber} fill={i < n ? S.amber : 'transparent'} strokeWidth={2} />
    ))}
  </div>
);

/** Top-down toast: slides in at `at`, holds, then fades at `out`. */
export const Toast: React.FC<{ f: number; at: number; out?: number; title: string; body?: string; I?: LucideIcon }> = ({ f, at, out = 9999, title, body, I = Bell }) => {
  if (f < at) return null;
  const p = sp(f, at, SNAPPY);
  const fade = tw(f, out, out + 10, 1, 0);
  return (
    <div style={{ position: 'absolute', left: 16, right: 16, top: 58, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 17, background: S.surface, border: `1px solid ${S.line}`, boxShadow: '0 12px 28px rgba(12,26,40,0.18)', transform: `translateY(${(1 - p) * -90}px)`, opacity: Math.min(p, fade), zIndex: 30 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: S.tonal, display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={21} color={S.primary} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
        {body && <div style={{ fontSize: 14.5, color: S.muted, fontWeight: 600, marginTop: 2 }}>{body}</div>}
      </div>
    </div>
  );
};

// ── Tap indicator: finger glides in, presses at `at`, ripple ───────────────
/** Set to false to hide the finger (poster frames). */
export const ShowTaps = React.createContext(true);
/**
 * Lets a guide step show only its own taps (pressed between min and max), fade them out (o), and keep a
 * pressed tap's ring playing for `late` extra frames while the phone itself is paused.
 */
export const TapGate = React.createContext<{ min: number; max: number; o: number; late?: number; real?: (at: number, f: number) => number }>({ min: -Infinity, max: Infinity, o: 1 });
export const Tap: React.FC<{ f: number; at: number; x: number; y: number; from?: [number, number] }> = ({ f: f0, at, x, y, from = [60, 90] }) => {
  const show = React.useContext(ShowTaps);
  const gate = React.useContext(TapGate);
  // the finger's glide and the ring both play in real time, even while the phone is paused
  const f = gate.real ? gate.real(at, f0) : f0 >= at ? f0 + (gate.late ?? 0) : f0;
  if (!show || f <= at - 12 || f > at + 14 || at < gate.min || at > gate.max || gate.o <= 0) return null;
  const m = tw(f, at - 12, at - 1, 0, 1, expoOut);
  const press = hit(f, at, 3);
  const ring = tw(f, at, at + 12, 0, 1, expoOut);
  const out = tw(f, at + 6, at + 14, 1, 0);
  const cx = x + (1 - m) * from[0], cy = y + (1 - m) * from[1];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 50, opacity: out * gate.o }}>
      <div style={{ position: 'absolute', left: cx - 24, top: cy - 24, width: 48, height: 48, borderRadius: 48, background: 'rgba(15,23,42,0.22)', border: '3px solid rgba(255,255,255,0.95)', boxShadow: '0 4px 14px rgba(0,0,0,0.28)', transform: `scale(${1 - press * 0.3})` }} />
      {f >= at && <div style={{ position: 'absolute', left: x - 40 * ring, top: y - 40 * ring, width: 80 * ring, height: 80 * ring, borderRadius: 99, border: `3px solid rgba(3,105,161,${1 - ring})` }} />}
    </div>
  );
};

// ── Screen stack: push / up / fade transitions between app screens ─────────
export type Scr = { at: number; render: (f: number) => React.ReactNode; kind?: 'push' | 'up' | 'fade' | 'none' };
export const Screens: React.FC<{ f: number; list: Scr[] }> = ({ f, list }) => {
  let i = 0;
  list.forEach((s, k) => { if (f >= s.at) i = k; });
  const cur = list[i];
  const prev = list[i - 1];
  const t = f - cur.at;
  const dur = 12;
  if (!prev || t >= dur || cur.kind === 'none') return <div style={{ position: 'absolute', inset: 0 }}>{cur.render(f)}</div>;
  const p = tw(f, cur.at, cur.at + dur, 0, 1, expoOut);
  const lin = tw(f, cur.at, cur.at + dur, 0, 1, (x) => x);
  const kind = cur.kind ?? 'push';
  const inT = kind === 'push' ? `translateX(${(1 - p) * 100}%)` : kind === 'up' ? `translateY(${(1 - p) * 100}%)` : 'none';
  const outT = kind === 'push' ? `translateX(${-p * 30}%)` : 'none';
  return (
    <>
      {/* fade = dip: the old screen fades out, then the new one fades in, never both at once (no double image) */}
      <div style={{ position: 'absolute', inset: 0, transform: outT, filter: kind === 'fade' ? undefined : `brightness(${1 - p * 0.12})`, opacity: kind === 'fade' ? Math.max(0, 1 - lin * 2) : 1 }}>{prev.render(f)}</div>
      <div style={{ position: 'absolute', inset: 0, transform: inT, opacity: kind === 'fade' ? Math.max(0, lin * 2 - 1) : 1, boxShadow: kind === 'fade' ? undefined : '-10px 0 30px rgba(0,0,0,0.12)' }}>{cur.render(f)}</div>
    </>
  );
};

/** Typing helper: the first characters of `text` typed by frame `f`, starting at `start`, at `cps` characters per second. */
export const typed = (text: string, f: number, start: number, cps = 14) =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor(((f - start) / FPS) * cps))));
/** Legacy typing helper for the older film files: types `text` between frames a and b. */
export const typedRange = (f: number, a: number, b: number, text: string) => text.slice(0, Math.floor(tw(f, a, b, 0, text.length, (t) => t)));

export const Caret: React.FC<{ f: number; until: number }> = ({ f, until }) => (
  <span style={{ display: 'inline-block', width: 2, height: 22, marginLeft: 2, background: S.primary, opacity: f < until && Math.floor(f / 8) % 2 === 0 ? 1 : 0 }} />
);

export const pop = (f: number, at: number) => sp(f, at, BOUNCY);
export { expoIn, expoOut, hit, sp, tw };
