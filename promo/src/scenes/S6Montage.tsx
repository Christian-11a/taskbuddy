import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BadgeCheck, CalendarCheck, CheckCheck, MapPin, MessageCircle, Plus, Search, ShieldCheck, Sparkles, Star, Users, Wallet, Wrench, Zap } from 'lucide-react';
import { C, INTER } from '../theme';
import { expoOut, tw } from '../motion';
import { Logo } from '../components/Logo';

// 660–780 (bars 11–12). The build: word cuts on eighths, then icon cuts on the
// accelerating snare roll (every 0.875 × 16th), then silence before the drop.
const WORDS = [
  { t: 'POST', Icon: Plus },
  { t: 'MATCH', Icon: Users },
  { t: 'CHAT', Icon: MessageCircle },
  { t: 'BOOK', Icon: CalendarCheck },
  { t: 'PAY', Icon: Wallet },
  { t: 'TRACK', Icon: MapPin },
  { t: 'RATE', Icon: Star },
  { t: 'DONE.', Icon: CheckCheck },
];
const THEMES = [
  { bg: C.brandCyan, fg: C.brandDark, ic: C.white },
  { bg: C.brandDark, fg: C.white, ic: C.brandCyan },
  { bg: C.white, fg: C.brandDark, ic: C.brandCyan },
  { bg: C.brandTeal, fg: C.white, ic: C.brandCyanLight },
];
const ICONS = [Wrench, Sparkles, Zap, Search, ShieldCheck, BadgeCheck, Star, Wallet, MapPin, MessageCircle, CalendarCheck, Users];
const WORD_CUTS = [0, 8, 15, 23, 30, 38, 45, 53];
const ROLL_CUTS = Array.from({ length: 16 }, (_, k) => 60 + k * 3.28125);

export const S6Montage: React.FC = () => {
  const f = useCurrentFrame();
  const push = 1 + f * 0.0035;

  if (f >= 112.5) {
    // the breath: near-black, one cyan point shrinking
    const s = 1 - tw(f, 112.5, 120, 0, 0.6);
    return (
      <AbsoluteFill style={{ background: '#021a21', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28 * s, height: 28 * s, borderRadius: 99, background: C.brandCyan, boxShadow: `0 0 ${40 * s}px ${C.brandCyan}` }} />
      </AbsoluteFill>
    );
  }

  if (f < 60) {
    let i = 0;
    WORD_CUTS.forEach((c, k) => { if (f >= c) i = k; });
    const l = f - WORD_CUTS[i];
    const th = THEMES[i % 4];
    const { Icon } = WORDS[i];
    const e = tw(l, 0, 6, 0, 1, expoOut);
    const dir = i % 2 ? 1 : -1;
    return (
      <AbsoluteFill style={{ background: th.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ transform: `scale(${push}) rotate(${dir * 2.5}deg)`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ transform: `scale(${0.4 + e * 0.6}) rotate(${(1 - e) * dir * 90}deg)`, marginBottom: 30 }}>
            <Icon size={230} color={th.ic} strokeWidth={2.4} />
          </div>
          <div
            style={{
              fontFamily: INTER, fontWeight: 900, fontSize: 270, letterSpacing: '-0.05em', color: th.fg, lineHeight: 0.9,
              transform: `translateX(${(1 - e) * dir * 160}px) scale(${1.25 - e * 0.25})`, filter: `blur(${(1 - e) * 10}px)`,
            }}
          >
            {WORDS[i].t}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  let i = 0;
  ROLL_CUTS.forEach((c, k) => { if (f >= c) i = k; });
  const l = f - ROLL_CUTS[i];
  const bg = i % 2 ? C.brandDark : C.brandTeal;
  const e = tw(l, 0, 3, 0, 1, expoOut);
  const late = i >= 11; // last cuts preview the mark, growing
  const Icon = ICONS[i % ICONS.length];
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: 99999, border: `${10 + i * 2}px solid ${C.brandCyan}`, opacity: 0.35, transform: `scale(${0.5 + e * 0.5 + i * 0.03})` }} />
      <div style={{ transform: `scale(${push * (0.6 + e * 0.4)}) rotate(${(i % 2 ? 1 : -1) * (6 + i)}deg)` }}>
        {late ? <Logo size={260 + (i - 11) * 70} /> : <Icon size={380} color={i % 2 ? C.brandCyan : C.white} strokeWidth={2.2} />}
      </div>
    </AbsoluteFill>
  );
};
