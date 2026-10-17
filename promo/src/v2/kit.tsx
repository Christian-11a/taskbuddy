import React from 'react';
import { CalendarDays, CirclePlus, ClipboardList, House, Search, Wallet } from 'lucide-react';
import { INTER } from '../theme';
import { BOUNCY, expoIn, expoOut, hit, sp, tw } from '../motion';

// Mobile design tokens (mobile/src/constants/theme.ts V6Colors + screen styles).
export const A = {
  cyan50: '#ecfeff', cyan100: '#cffafe', cyan200: '#a5f3fc', cyan500: '#06b6d4', cyan600: '#0891b2', cyan700: '#0e7490', cyan800: '#096f8b', cyan900: '#063e4d',
  ink25: '#f8fafc', ink50: '#f1f5f9', ink100: '#e2e8f0', ink200: '#cbd5e1', ink300: '#94a3b8', ink400: '#90a1b9', ink500: '#64748b', ink700: '#314158', ink900: '#0f172a',
  green500: '#22c55e', green600: '#16a34a', amber500: '#f59e0b', amber700: '#92400e', red500: '#ef4444', blue: '#3b82f6', purple: '#7c3aed',
  white: '#ffffff', canvas: '#f7f9fb', line: '#e8edf2', hairline: '#edf1f4', well: '#f5f8fa',
  hoHero: 'linear-gradient(160deg, #078eaa, #0b7288)',
  spHero: 'linear-gradient(160deg, #111827 0%, #18283b 72%, #0c4a6e 100%)',
};

export const DP_W = 360;
export const DP_H = 776;

// ── Phone shell: content is authored in dp (360 wide) and scaled to fit ─────
export const Phone: React.FC<{ w: number; children: React.ReactNode; glow?: string }> = ({ w, children, glow }) => {
  const pad = w * 0.028;
  const k = (w - pad * 2) / DP_W;
  const h = DP_H * k + pad * 2;
  return (
    <div
      style={{
        width: w, height: h, borderRadius: w * 0.14, background: '#0b1014', padding: pad, position: 'relative',
        boxShadow: `0 ${w * 0.1}px ${w * 0.22}px rgba(2,20,30,0.45), 0 0 0 ${w * 0.005}px rgba(255,255,255,0.14) inset${glow ? `, 0 0 ${w * 0.15}px ${glow}` : ''}`,
      }}
    >
      <div style={{ width: DP_W * k, height: DP_H * k, borderRadius: w * 0.115, overflow: 'hidden', position: 'relative', background: A.canvas }}>
        <div style={{ width: DP_W, height: DP_H, transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', fontFamily: INTER, color: A.ink900 }}>
          {children}
        </div>
        <div style={{ position: 'absolute', top: 11 * k, left: '50%', width: 92 * k, height: 26 * k, marginLeft: -46 * k, borderRadius: 20 * k, background: '#0b1014' }} />
      </div>
    </div>
  );
};

export const StatusBar: React.FC<{ light?: boolean }> = ({ light }) => (
  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 26px 0', fontSize: 14, fontWeight: 700, color: light ? A.white : A.ink900, zIndex: 5 }}>
    <span>9:41</span>
    <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <span style={{ width: 16, height: 10, borderRadius: 2, border: `1.5px solid ${light ? A.white : A.ink900}` }} />
    </span>
  </div>
);

// ── Bottom nav (App.tsx tab sets) ───────────────────────────────────────────
export const HONav: React.FC<{ active?: number; press?: number }> = ({ active = 0, press = 0 }) => {
  const tabs = [
    { l: 'Home', I: House }, { l: 'My Jobs', I: ClipboardList }, null, { l: 'Calendar', I: CalendarDays }, { l: 'Wallet', I: Wallet },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, background: A.white, borderTop: `1px solid ${A.hairline}`, display: 'flex', alignItems: 'center', padding: '0 6px 10px', zIndex: 6 }}>
      {tabs.map((t, i) =>
        t ? (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: i === active ? A.cyan800 : A.ink300 }}>
            <t.I size={21} strokeWidth={i === active ? 2.4 : 2} />
            <span style={{ fontSize: 11.5, fontWeight: i === active ? 800 : 600 }}>{t.l}</span>
          </div>
        ) : (
          <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 54, height: 54, borderRadius: 27, marginTop: -22, background: `linear-gradient(160deg, ${A.cyan500}, ${A.cyan700})`, display: 'grid', placeItems: 'center', boxShadow: '0 8px 18px rgba(8,145,178,0.4)', transform: `scale(${1 - press * 0.15})` }}>
              <CirclePlus size={25} color={A.white} strokeWidth={2.25} />
            </div>
          </div>
        ),
      )}
    </div>
  );
};

export const SPNav: React.FC<{ active?: number }> = ({ active = 0 }) => {
  const tabs = [{ l: 'Feed', I: Search }, { l: 'My Work', I: ClipboardList }, { l: 'Calendar', I: CalendarDays }, { l: 'Wallet', I: Wallet }];
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, background: A.white, borderTop: `1px solid ${A.hairline}`, display: 'flex', alignItems: 'center', padding: '0 6px 10px', zIndex: 6 }}>
      {tabs.map((t, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: i === active ? A.cyan800 : A.ink300 }}>
          <t.I size={21} strokeWidth={i === active ? 2.4 : 2} />
          <span style={{ fontSize: 11.5, fontWeight: i === active ? 800 : 600 }}>{t.l}</span>
        </div>
      ))}
    </div>
  );
};

// ── Small pieces ────────────────────────────────────────────────────────────
export const Pill: React.FC<{ label: string; color: string; bg: string; dot?: boolean; size?: number; style?: React.CSSProperties; border?: string }> = ({ label, color, bg, dot, size = 11.5, style, border }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: `${size * 0.42}px ${size * 0.8}px`, borderRadius: 999, background: bg, color, fontWeight: 800, fontSize: size, whiteSpace: 'nowrap', border, ...style }}>
    {dot && <span style={{ width: size * 0.6, height: size * 0.6, borderRadius: 9, background: color }} />}
    {label}
  </div>
);

export const Btn: React.FC<{ label: React.ReactNode; f: number; press?: number; bg?: string; color?: string; h?: number; style?: React.CSSProperties }> = ({ label, f, press, bg = A.cyan700, color = A.white, h = 48, style }) => {
  const p = press != null ? hit(f, press, 3) : 0;
  return (
    <div style={{ height: h, borderRadius: 13, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15.5, fontWeight: 800, transform: `scale(${1 - p * 0.06}, ${1 - p * 0.1})`, boxShadow: bg === A.cyan700 ? '0 5px 14px rgba(8,145,178,0.25)' : undefined, ...style }}>
      {label}
    </div>
  );
};

export const Avatar: React.FC<{ ini: string; size?: number; bg?: string }> = ({ ini, size = 44, bg = A.cyan700 }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: bg, color: A.white, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>{ini}</div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: A.white, borderRadius: 16, border: `1px solid ${A.line}`, padding: 15, boxShadow: '0 1px 2px rgba(15,23,42,0.03)', ...style }}>{children}</div>
);

// ── Tap indicator: finger dot glides in, presses at `at`, ripple ────────────
export const Tap: React.FC<{ f: number; at: number; x: number; y: number; from?: [number, number] }> = ({ f, at, x, y, from = [60, 90] }) => {
  if (f < at - 12 || f > at + 14) return null;
  const m = tw(f, at - 12, at - 1, 0, 1, expoOut);
  const press = hit(f, at, 3);
  const ring = tw(f, at, at + 12, 0, 1, expoOut);
  const out = tw(f, at + 6, at + 14, 1, 0);
  const cx = x + (1 - m) * from[0], cy = y + (1 - m) * from[1];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 50, opacity: out }}>
      <div style={{ position: 'absolute', left: cx - 22, top: cy - 22, width: 44, height: 44, borderRadius: 44, background: 'rgba(15,23,42,0.18)', border: '2.5px solid rgba(255,255,255,0.95)', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', transform: `scale(${1 - press * 0.3})` }} />
      {f >= at && <div style={{ position: 'absolute', left: x - 40 * ring, top: y - 40 * ring, width: 80 * ring, height: 80 * ring, borderRadius: 99, border: `3px solid rgba(8,145,178,${1 - ring})` }} />}
    </div>
  );
};

// ── Screen stack: push transitions between app screens ─────────────────────
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
  const kind = cur.kind ?? 'push';
  const inT = kind === 'push' ? `translateX(${(1 - p) * 100}%)` : kind === 'up' ? `translateY(${(1 - p) * 100}%)` : 'none';
  const outT = kind === 'push' ? `translateX(${-p * 30}%)` : 'none';
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, transform: outT, filter: `brightness(${1 - p * 0.15})` }}>{prev.render(f)}</div>
      <div style={{ position: 'absolute', inset: 0, transform: inT, opacity: kind === 'fade' ? p : 1, boxShadow: '-10px 0 30px rgba(0,0,0,0.12)' }}>{cur.render(f)}</div>
    </>
  );
};

/** Typewriter helper. */
export const typed = (f: number, a: number, b: number, text: string) => text.slice(0, Math.floor(tw(f, a, b, 0, text.length, (t) => t)));
export const Caret: React.FC<{ f: number; until: number }> = ({ f, until }) => (
  <span style={{ opacity: f < until && Math.floor(f / 5) % 2 === 0 ? 1 : 0, color: A.cyan600, fontWeight: 400 }}>|</span>
);

export const pop = (f: number, at: number) => sp(f, at, BOUNCY);
export { expoIn, expoOut, hit, sp, tw };
