import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { INTER } from '../theme';
import { inOut, sp, tw } from '../motion';
import { Phone, T, pal } from '../hero/ui';
import { ClientPhone } from '../hero/ClientPhone';
import { ProviderPhone } from '../hero/ProviderPhone';
import { SignupPhone } from '../hero/Signup';
import { makeWarp } from '../film/Film';
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

const Screen: React.FC<{ src: PhoneSrc; f: number; dur: number }> = ({ src, f, dur }) => {
  if (src.kind === 'screen') return <>{src.render(f, dur)}</>;
  const t = Math.min(dur, Math.max(0, f));
  if (src.kind === 'signup') return <SignupPhone f={src.from + (t / dur) * (src.to - src.from)} role={src.role} />;
  const w = makeWarp(src.role, src.from, src.to, dur);
  const hero = w.heroAt(t);
  return src.role === 'c' ? <ClientPhone f={hero} /> : <ProviderPhone f={hero} />;
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
