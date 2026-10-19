import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { INTER } from '../theme';
import { inOut, sp, tw } from '../motion';
import { Phone, T, pal } from '../hero/ui';
import { TapGate } from '../v2/kit';
import { ClientPhone } from '../hero/ClientPhone';
import { ProviderPhone } from '../hero/ProviderPhone';
import { SignupPhone, suTaps, suTyping } from '../hero/Signup';
import { TAPS, TYPING } from '../hero/story';
import { CUTS, FAST } from '../film/Film';
import { LESSONS, type GLesson, type PhoneSrc } from './lessons';

// Guide video: title card, one step at a time (STEP n OF N, headline, body) beside one phone doing exactly
// that step, a progress bar, and an end card pointing to the next guide. Narration: one mp3 per guide,
// split into [intro, step 1..N, outro] at the timings in public/guides/timing/<id>.json.
export const GUIDE_FPS = 30;
type Seg = { a: number; b: number }; // seconds in the mp3
export type GuideProps = { id: string; timing?: Seg[] | null };

const S = (s: number) => Math.round(s * GUIDE_FPS);
const estimate = (text: string) => Math.max(1.6, text.split(/\s+/).length / 2.7);

/** Frames for each part [title, steps..., end] and where its voice line starts. */
export const layout = (l: GLesson, timing?: Seg[] | null) => {
  const lines = [l.intro, ...l.steps.map((s) => s.say), l.outro];
  const segs: Seg[] = timing && timing.length === lines.length ? timing : (() => {
    let t = 0;
    return lines.map((x) => { const d = estimate(x); const r = { a: t, b: t + d }; t += d + 0.4; return r; });
  })();
  const parts = lines.map((_, i) => {
    const len = segs[i].b - segs[i].a;
    const pad = i === 0 ? 1.0 : i === lines.length - 1 ? 1.8 : 1.1;
    const min = i === 0 ? 3.2 : i === lines.length - 1 ? 3.4 : 3.6;
    return { voice: segs[i], dur: S(Math.max(min, len + pad)) };
  });
  let at = 0;
  const placed = parts.map((p) => { const r = { ...p, from: at, voiceAt: at + S(0.35) }; at += p.dur; return r; });
  return { parts: placed, total: at };
};

export const guideMetadata: CalculateMetadataFunction<GuideProps> = async ({ props }) => {
  const l = LESSONS.find((x) => x.id === props.id)!;
  let timing: Seg[] | null = null;
  try {
    const res = await fetch(staticFile(`guides/timing/${props.id}.json`));
    if (res.ok) timing = await res.json();
  } catch { /* no timing yet: estimate */ }
  return { durationInFrames: layout(l, timing).total, props: { ...props, timing } };
};

/**
 * Maps step time to phone frame. Taps (finger in, press, ring) and screen changes play at real speed,
 * calm parts (typing, reading) slow down at most 3x, and any time left becomes pauses: just before each
 * tap, just after each screen change, and a longer one at the end. A pause only lands where nothing is
 * moving, so nothing freezes half-way and nothing plays in slow motion.
 * Only this step's own taps count; the TapGate hides the ones that belong to the steps around it.
 */
export const realSpeed = (from: number, to: number, dur: number, allTaps: number[], allCuts: number[], noEndPause = false, typing: [number, number][] = []) => {
  const taps = allTaps.filter((t) => t >= from && t <= to);
  const cuts = allCuts.filter((c) => c + FAST > from && c < to);
  const moving = [...taps.map((t) => [t - 12, t + 14]), ...cuts.map((c) => [c, c + FAST])];
  const raw = moving
    .map(([a, b]) => [Math.max(from, a), Math.min(to, b)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const wins: number[][] = [];
  for (const w of raw) {
    const last = wins[wins.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else wins.push([...w]);
  }
  const fastLen = wins.reduce((n, [a, b]) => n + (b - a), 0);
  const slowHero = to - from - fastLen;
  const linear = Object.assign((l: number) => from + Math.min(1, Math.max(0, l / dur)) * (to - from), { endAt: dur, hideUntil: 0, inv: (h: number) => ((h - from) / Math.max(1, to - from)) * dur });
  if (fastLen + slowHero > dur) return linear; // more action than time: play it evenly
  // calm parts (typing, reading) take most of the spare time, so a pause never freezes half-typed text;
  // a little is kept for the finger to settle on each button and for a short look at the start and end
  const nTaps = taps.length;
  const keep = Math.min(Math.max(0, dur - fastLen - slowHero), nTaps * 10 + 24);
  const stretch = slowHero > 0 ? Math.min(3, Math.max(1, (dur - fastLen - keep) / slowHero)) : 1;
  const spare = dur - fastLen - slowHero * stretch;
  // a pause may show a finger hovering just before its press, but never a sliding screen or a fading ring
  const sliding = (x: number) => cuts.some((c) => x >= c && x < c + FAST);
  // (another tap's ring is fine: rings keep playing in real time during a pause)
  const busy = (x: number, own?: number) => sliding(x) || typing.some(([a, b]) => x > a && x < b + 2) || taps.some((u) => u !== own && x > u - 12 && x < u);
  const tapHolds = taps.map((t) => {
    // pause with the finger right over the button, just before it presses
    for (let x = t - 2; x >= Math.max(from, t - 12); x--) if (!busy(x, t)) return x;
    return NaN;
  });
  const holds = [...new Set([...tapHolds, ...cuts.map((c) => c + FAST).filter((x) => !busy(x))])]
    .filter((x) => x >= from && x < to)
    .sort((x, y) => x - y);
  // a finger never hovers longer than 0.8 s; the rest is split between the start and the end of the step
  let unit = Math.min(24, spare / (holds.length + 1.5));
  let lead = (spare - unit * holds.length) / (noEndPause ? 1 : 2);
  const inFast = (x: number) => wins.some(([a, b]) => x >= a && x < b);
  // typing ends are good places to rest: the finished text is on screen
  const marks = [...new Set([from, to, ...wins.flat(), ...holds, ...typing.map(([, b]) => b + 2)])].filter((x) => x >= from && x <= to).sort((x, y) => x - y);
  // the opening pause sits on the first frame where nothing moves; if there is none it sits on the
  // first frame, with the finger hidden until the pause is over (it then glides in to its button)
  const idle = (x: number) => !busy(x) && !typing.some(([a, b]) => x >= a && x < b + 2) && !allCuts.some((c) => x >= c - 2 && x < c + FAST) && !allTaps.some((u) => x >= u - 12 && x < u + 8);
  // a step that ends mid-motion (typing, a slide) gets no closing pause: all spare time goes up front
  if (!idle(to)) lead = spare - unit * holds.length;
  // no calm frame at all: the spare time slows the calm parts (typing) down a little more instead
  const leadAt = marks.find((h) => idle(h) && h < to) ?? (idle(to) || slowHero <= 0 ? to : NaN);
  // no calm frame: the spare time becomes longer hovers before the taps; only with no taps does it slow the motion
  if (Number.isNaN(leadAt) && holds.length) { unit += lead / holds.length; lead = 0; }
  const extra = Number.isNaN(leadAt) ? lead / slowHero : 0;
  const hideUntil = 0;
  const pts: [number, number][] = [[0, from]];
  let l = 0;
  for (let i = 0; i < marks.length; i++) {
    const h = marks[i];
    if (i > 0) { const h0 = marks[i - 1]; l += (h - h0) * (inFast(h0) ? 1 : stretch + extra); pts.push([l, h]); }
    if (h === leadAt) { l += lead; pts.push([l, h]); }
    if (holds.includes(h)) { l += unit; pts.push([l, h]); }
  }
  // a closing pause still lets the last tap's ring play out (it counts as time after the end)
  const endAt = l - (leadAt === to ? lead : 0);
  if (l < dur && !idle(to)) { const k = dur / l; for (const pt of pts) pt[0] *= k; }
  pts.push([dur, to]);
  // step time at which the phone reaches frame h (first time)
  const inv = (h: number) => {
    for (let i = 1; i < pts.length; i++) if (h <= pts[i][1]) { const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; return y1 === y0 ? x0 : x0 + ((h - y0) / (y1 - y0)) * (x1 - x0); }
    return dur;
  };
  return Object.assign((x: number) => {
    if (x <= 0) return from;
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      }
    }
    return to;
  }, { endAt, hideUntil, inv });
};

/** The phone's time warp for one hero/signup step (exported for scripts/warp-one.ts). */
export const phoneWarp = (src: Exclude<PhoneSrc, { kind: 'screen' }>, dur: number) => {
  // a screen change that starts right at a step boundary belongs to the step whose tap caused it,
  // so a tap is answered at once instead of after a pause
  const cuts = src.kind === 'signup' ? [] : CUTS[src.role];
  // (never when a tap sits inside that change: then the tap and its result stay together in the next step)
  const taps = src.kind === 'signup' ? suTaps(src.role) : TAPS[src.role];
  const edge = (x: number) => {
    const c = cuts.find((k) => k >= x - 2 && k <= x + 8);
    const caused = c !== undefined && taps.some((t) => t <= c && t >= c - 20);
    // …unless the next screen's own tap follows within ~0.7 s (that step needs its screen)
    const typing = src.kind === 'signup' ? suTyping : TYPING[src.role];
    // …or when typing starts during it (a step must never stop on half-typed text)
    const blocked = caused && (taps.some((t) => t > x && t <= c! + FAST + 20) || typing.some(([a2]) => a2 < c! + FAST + 2 && a2 >= c! - 2));
    return { x: caused && !blocked ? c! + FAST : x, blocked };
  };
  const from = edge(src.from).x;
  const end = edge(src.to);
  const to = Math.max(from + 1, end.x);
  // when the answer to the last tap must wait for the next step, no pause after that tap
  const w = realSpeed(from, to, dur, taps, cuts, end.blocked, src.kind === 'signup' ? suTyping : TYPING[src.role]);
  return { w, from, to };
};

const Screen: React.FC<{ src: PhoneSrc; f: number; dur: number }> = ({ src, f, dur }) => {
  if (src.kind === 'screen') return <>{src.render(f, dur)}</>;
  const t = Math.min(dur, Math.max(0, f));
  const { w, from, to } = phoneWarp(src, dur);
  const h = w(t);
  // taps belong to the step that presses them; one still showing when the step pauses at its end fades out
  const gate = { min: from, max: to, o: t < w.hideUntil ? 0 : 1 - tw(t, w.endAt + 16, w.endAt + 22, 0, 1), real: (a: number, f0: number) => (f0 >= a ? a + Math.max(0, t - w.inv(a)) : Math.min(f0, a - (w.inv(a) - t))) };
  return (
    <TapGate.Provider value={gate}>
      {src.kind === 'signup' ? <SignupPhone f={h} role={src.role} /> : src.role === 'c' ? <ClientPhone f={h} /> : <ProviderPhone f={h} />}
    </TapGate.Provider>
  );
};

const Logo: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div style={{ position: 'absolute', top: 44, left: 60, display: 'flex', alignItems: 'center', gap: 14, fontFamily: INTER }}>
    <Img src={staticFile('taskbuddy-logo.png')} style={{ width: 44, height: 44, borderRadius: 12 }} />
    <span style={{ fontSize: 24, fontWeight: 800, color: dark ? T.white : T.ink900 }}>TaskBuddy</span>
    <span style={{ fontSize: 24, fontWeight: 500, color: dark ? 'rgba(255,255,255,0.7)' : T.ink500 }}>· Guide</span>
  </div>
);

export const GuideVideo: React.FC<GuideProps> = ({ id, timing }) => {
  const f = useCurrentFrame();
  const l = LESSONS.find((x) => x.id === id)!;
  const tone = l.track === 'providers' ? 'provider' : 'client';
  const p = pal(tone);
  const { parts, total } = layout(l, timing);
  const N = l.steps.length;
  let idx = 0;
  parts.forEach((pt, i) => { if (f >= pt.from) idx = i; });
  const cur = parts[idx];
  const lf = f - cur.from;
  const isStep = idx >= 1 && idx <= N;
  const stepI = idx - 1;

  // phone side alternates: odd steps right, even steps left; it glides between sides
  const sideOf = (i: number) => (i % 2 === 0 ? 1 : -1); // step 0 (STEP 1) → right
  const prevSide = isStep && stepI > 0 ? sideOf(stepI - 1) : sideOf(0);
  const side = isStep ? sideOf(stepI) : sideOf(0);
  const glide = isStep ? sp(lf, 0, { damping: 20, stiffness: 90, mass: 1 }) : 1;
  const phoneX = 960 + (prevSide + (side - prevSide) * glide) * 400;
  const phoneIn = idx === 0 ? 0 : sp(f - parts[1].from, 0, { damping: 18, stiffness: 100, mass: 0.9 });
  const phoneOut = idx === N + 1 ? 1 - tw(lf, 0, 14, 0, 1, inOut) : 1;
  const step = isStep ? l.steps[stepI] : null;
  const zoom = step?.zoom ? 1 + (step.zoom.s - 1) * tw(lf, 10, 28, 0, 1, inOut) : 1;

  return (
    <AbsoluteFill style={{ background: '#F7FAFD', fontFamily: INTER }}>
      <div style={{ position: 'absolute', left: -240, top: -300, width: 1000, height: 1000, borderRadius: 1000, background: `radial-gradient(circle, ${tone === 'provider' ? 'rgba(208,218,229,0.75)' : 'rgba(186,230,253,0.6)'}, rgba(255,255,255,0) 70%)` }} />
      <div style={{ position: 'absolute', right: -300, bottom: -360, width: 1100, height: 1100, borderRadius: 1100, background: `radial-gradient(circle, ${tone === 'provider' ? 'rgba(232,237,243,0.95)' : 'rgba(224,242,254,0.9)'}, rgba(255,255,255,0) 70%)` }} />
      <Logo />
      <div style={{ position: 'absolute', top: 46, right: 60, padding: '8px 18px', borderRadius: 999, background: p.tonal, color: p.deep, fontSize: 20, fontWeight: 700 }}>{l.track === 'providers' ? 'For providers' : 'For clients'} · Guide {l.n}</div>

      {/* title card */}
      {idx === 0 && (
        <AbsoluteFill>
          <Img src={staticFile(l.track === 'providers' ? 'mascot-new/mascot-default.png' : 'mascot-new/mascot-thumbs.png')} style={{ position: 'absolute', left: 250, top: 250, width: 520, height: 520, transform: `scale(${sp(f, 2, { damping: 12, stiffness: 120, mass: 0.8 })}) rotate(${(1 - sp(f, 2)) * -8}deg)` }} />
          <div style={{ position: 'absolute', left: 860, top: 360, width: 860 }}>
            <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 999, background: p.primary, color: T.white, fontSize: 20, fontWeight: 800, letterSpacing: 1.4, opacity: tw(f, 4, 12) }}>{l.group.toUpperCase()}</div>
            <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.04, marginTop: 22, opacity: tw(f, 6, 16), transform: `translateY(${tw(f, 6, 22, 30, 0)}px)` }}>{l.title}</div>
            <div style={{ fontSize: 34, color: T.ink500, marginTop: 22, lineHeight: '46px', opacity: tw(f, 12, 22) }}>{l.summary}</div>
          </div>
        </AbsoluteFill>
      )}

      {/* phone */}
      {idx > 0 && (
        <div style={{ position: 'absolute', left: phoneX - 220, top: 92 + (1 - phoneIn) * 200, opacity: Math.min(phoneIn, phoneOut), transform: `perspective(2400px) rotateY(${-side * 5}deg) scale(${zoom})`, transformOrigin: `50% ${step?.zoom ? (step.zoom.y / 914) * 100 : 50}%` }}>
          <Phone w={420}>
            {(() => {
              const pt = isStep ? cur : parts[N];
              const s = isStep ? l.steps[stepI] : l.steps[N - 1];
              const local = isStep ? lf : pt.dur;
              return <Screen src={s.phone} f={local} dur={pt.dur - S(0.5)} />;
            })()}
          </Phone>
          {step?.spot && (() => {
            const k = 400 / 411; const sp0 = step.spot;
            const on = tw(lf, sp0.at ?? 12, (sp0.at ?? 12) + 10, 0, 1, inOut);
            return <div style={{ position: 'absolute', left: 9, top: 9, width: 402, height: 894, borderRadius: 40, overflow: 'hidden', pointerEvents: 'none' }}><div style={{ position: 'absolute', left: sp0.x * k - 6, top: sp0.y * k - 6, width: sp0.w * k + 12, height: sp0.h * k + 12, borderRadius: 18, border: `4px solid ${tone === 'provider' ? '#38BDF8' : '#F59E0B'}`, boxShadow: `0 0 0 2000px rgba(15,23,42,${0.22 * on}), 0 0 24px ${tone === 'provider' ? 'rgba(56,189,248,0.6)' : 'rgba(245,158,11,0.6)'}`, opacity: on, transform: `scale(${1.06 - on * 0.06})` }} /></div>;
          })()}
        </div>
      )}

      {/* step text */}
      {step && (() => {
        const x = side > 0 ? 170 : 1110;
        const a = sp(lf, 4, { damping: 16, stiffness: 160, mass: 0.7 });
        const b = sp(lf, 9, { damping: 16, stiffness: 160, mass: 0.7 });
        return (
          <div style={{ position: 'absolute', left: x, top: 330, width: 660 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: p.primary, color: T.white, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800 }}>{stepI + 1}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1.6, color: p.link }}>STEP {stepI + 1} OF {N}</div>
            </div>
            <div style={{ fontSize: 66, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.08, marginTop: 22, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>{step.headline}</div>
            <div style={{ fontSize: 32, color: T.ink700, lineHeight: '46px', marginTop: 22, opacity: b, transform: `translateY(${(1 - b) * 20}px)` }}>{step.body}</div>
          </div>
        );
      })()}

      {/* progress */}
      {isStep && (
        <div style={{ position: 'absolute', left: side > 0 ? 170 : 1110, top: 980, width: 640, display: 'flex', gap: 8 }}>
          {l.steps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: T.ink100, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${i < stepI ? 100 : i === stepI ? Math.min(100, (lf / cur.dur) * 100) : 0}%`, background: p.primary }} />
            </div>
          ))}
        </div>
      )}

      {/* end card */}
      {idx === N + 1 && (
        <AbsoluteFill style={{ opacity: tw(lf, 6, 18) }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Img src={staticFile('taskbuddy-logo.png')} style={{ width: 120, height: 120, borderRadius: 30, transform: `scale(${sp(lf, 8, { damping: 12, stiffness: 160, mass: 0.7 })})` }} />
            <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.035em', marginTop: 30 }}>{l.endLine}</div>
            {l.next && <div style={{ fontSize: 30, color: T.ink500, marginTop: 14 }}>Next guide: <b style={{ color: p.link }}>{l.next}</b></div>}
          </div>
        </AbsoluteFill>
      )}

      {/* narration */}
      {parts.map((pt, i) => (
        <Sequence key={i} from={pt.voiceAt} durationInFrames={S(pt.voice.b - pt.voice.a) + 4}>
          {timing && <Audio src={staticFile(`guides/audio/${id}.mp3`)} trimBefore={S(pt.voice.a)} trimAfter={S(pt.voice.b)} />}
        </Sequence>
      ))}
      <AbsoluteFill style={{ background: '#F7FAFD', opacity: interpolate(f, [total - 8, total], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
