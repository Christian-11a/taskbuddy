import React from 'react';
import { AbsoluteFill, Audio, CalculateMetadataFunction, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Download } from 'lucide-react';
import { INTER } from '../theme';
import { expoOut, tw } from '../motion';
import {
  AndroidPhone, Captions, captionPages, G, PHONE_FRAME_H, SCREEN_H, SCREEN_W, GuideLessonData, GuideTiming, ProgressBar, ScreenShot, TapMarker,
} from './parts';

export const GUIDE_FPS = 30;
export const TITLE_FRAMES = 90; // ~3 s title card
export const END_FRAMES = 120; // 4 s end card
const FADE = 14; // step cross-fade length
const BASE_W = 1920;
const BASE_H = 1080;

export type GuideLessonProps = {
  lessonId: string;
  lesson?: GuideLessonData;
  timing?: GuideTiming;
  hasAudio?: boolean;
};

declare const require: any;
// Lesson and timing JSON live in promo/guides/{lessons,timing}; webpack bundles them by id.
const lessonCtx = require.context('../../guides/lessons', false, /\.json$/);
const timingCtx = require.context('../../guides/timing', false, /\.timing\.json$/);

export const calculateGuideMetadata: CalculateMetadataFunction<GuideLessonProps> = async ({ props }) => {
  const id = props.lessonId;
  let lesson: GuideLessonData;
  let timing: GuideTiming;
  try {
    lesson = lessonCtx(`./${id}.json`);
    timing = timingCtx(`./${id}.timing.json`);
  } catch {
    throw new Error(`GuideLesson: no guides/lessons/${id}.json and guides/timing/${id}.timing.json found`);
  }
  if (lesson.steps.length !== timing.steps.length) {
    throw new Error(`GuideLesson: lesson has ${lesson.steps.length} steps but timing has ${timing.steps.length}`);
  }
  // Audio is optional: public/guides/audio/<id>.mp3. Only mount <Audio> if the file is really there.
  let hasAudio = false;
  try {
    const res = await fetch(staticFile(`guides/audio/${id}.mp3`), { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    hasAudio = res.ok && !type.includes('text/html');
  } catch {
    hasAudio = false;
  }
  return {
    durationInFrames: TITLE_FRAMES + timing.durationFrames + END_FRAMES,
    fps: GUIDE_FPS,
    props: { ...props, lesson, timing, hasAudio },
  };
};

const fadeUp = (f: number, at: number, dist = 22) => {
  const p = tw(f, at, at + 22, 0, 1, expoOut);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(1100px 800px at 18% 45%, ${G.tint} 0%, ${G.paper} 60%, ${G.white} 100%)` }} />
);

const tagText = (l: GuideLessonData) => {
  const who = l.track === 'providers' ? 'FOR PROVIDERS' : l.track === 'clients' ? 'FOR CLIENTS' : 'GUIDE';
  return l.number != null ? `${who} · ${l.number}` : who;
};

const Mascot: React.FC<{ f: number; size: number }> = ({ f, size }) => {
  const p = tw(f, 0, 30, 0, 1, expoOut);
  const float = Math.sin(f / 28) * 6;
  return (
    <div style={{ width: size, height: size, opacity: p, transform: `translateY(${(1 - p) * 26 + float}px)` }}>
      <Img src={staticFile('taskbuddy-mascot.webp')} style={{ width: size, height: size, objectFit: 'contain' }} />
    </div>
  );
};

const TitleCard: React.FC<{ lesson: GuideLessonData; f: number }> = ({ lesson, f }) => (
  <AbsoluteFill style={{ fontFamily: INTER }}>
    <Backdrop />
    <div style={{ position: 'absolute', left: 190, top: 220 }}><Mascot f={f} size={640} /></div>
    <div style={{ position: 'absolute', left: 900, top: 330, width: 860 }}>
      <div style={{ ...fadeUp(f, 8), display: 'inline-block', padding: '10px 22px', borderRadius: 999, background: G.primaryTonal, color: G.primary, fontSize: 24, fontWeight: 800, letterSpacing: 3 }}>
        {tagText(lesson)}
      </div>
      <div style={{ ...fadeUp(f, 16), marginTop: 28, fontSize: 108, fontWeight: 800, lineHeight: 1.04, color: G.ink, letterSpacing: -2 }}>{lesson.title}</div>
      {lesson.summary && (
        <div style={{ ...fadeUp(f, 26), marginTop: 26, fontSize: 38, fontWeight: 500, lineHeight: 1.35, color: G.muted, textWrap: 'balance' as any }}>{lesson.summary}</div>
      )}
    </div>
  </AbsoluteFill>
);

const EndCard: React.FC<{ lesson: GuideLessonData; f: number }> = ({ lesson, f }) => (
  <AbsoluteFill style={{ fontFamily: INTER }}>
    <Backdrop />
    <div style={{ position: 'absolute', left: 220, top: 250 }}><Mascot f={f} size={600} /></div>
    <div style={{ position: 'absolute', left: 900, top: 290, width: 860 }}>
      <div style={fadeUp(f, 6)}>
        <Img src={staticFile('taskbuddy-logo.png')} style={{ width: 84, height: 84, borderRadius: 20 }} />
      </div>
      <div style={{ ...fadeUp(f, 14), marginTop: 28, fontSize: 104, fontWeight: 800, lineHeight: 1.05, color: G.ink, letterSpacing: -2 }}>You did it.</div>
      {lesson.next && (
        <div style={{ ...fadeUp(f, 24), marginTop: 24, fontSize: 40, fontWeight: 500, color: G.muted, lineHeight: 1.3 }}>
          Next: <span style={{ color: G.primaryDeep, fontWeight: 700 }}>{lesson.next}</span>
        </div>
      )}
      <div style={{ ...fadeUp(f, 34), marginTop: 44, display: 'inline-flex', alignItems: 'center', gap: 16, padding: '22px 40px', borderRadius: 999, background: G.primary, color: G.white, fontSize: 36, fontWeight: 700, boxShadow: '0 14px 34px rgba(3,105,161,0.28)' }}>
        <Download size={36} strokeWidth={2.4} />
        Get the app
      </div>
    </div>
  </AbsoluteFill>
);

// ── Steps ───────────────────────────────────────────────────────────────────
const PHONE_W = 428;
const PHONE_X = 190;
const PHONE_TOP = 56;
const COL_X = 800;
const COL_W = 920;

const activeIndex = (t: number, timing: GuideTiming) => {
  let i = 0;
  timing.steps.forEach((s, k) => { if (t >= s.startFrame) i = k; });
  return i;
};

const StepScene: React.FC<{ lesson: GuideLessonData; timing: GuideTiming; t: number }> = ({ lesson, timing, t }) => {
  const n = lesson.steps.length;
  const cur = activeIndex(t, timing);
  const pages = React.useMemo(() => captionPages(timing.words), [timing]);
  const starts = timing.steps.map((s) => s.startFrame);

  // Show the current step plus the previous one while it cross-fades.
  const visible = [cur - 1, cur].filter((i) => i >= 0);
  const phoneH = PHONE_FRAME_H;

  return (
    <AbsoluteFill style={{ fontFamily: INTER }}>
      <Backdrop />
      <div style={{ position: 'absolute', left: PHONE_X - 90, top: PHONE_TOP + 70, width: PHONE_W + 180, height: phoneH - 140, borderRadius: 200, background: G.primaryTonal, opacity: 0.55 }} />
      <div style={{ position: 'absolute', left: PHONE_X, top: PHONE_TOP }}>
        <AndroidPhone>
          {visible.map((i) => {
            const s = timing.steps[i];
            const step = lesson.steps[i];
            const p = i === cur && i > 0 ? tw(t, s.startFrame, s.startFrame + FADE, 0, 1, expoOut) : 1;
            const tapAt = s.tapFrame ?? s.startFrame + 24;
            return (
              <div key={i} style={{ position: 'absolute', inset: 0, opacity: p }}>
                <ScreenShot src={step.screenshot} />
                {step.tap && i === cur && <TapMarker t={t} at={tapAt} x={step.tap.x * SCREEN_W} y={step.tap.y * SCREEN_H} />}
              </div>
            );
          })}
        </AndroidPhone>
      </div>

      <div style={{ position: 'absolute', left: COL_X, top: 200, width: COL_W, height: 520 }}>
        {visible.map((i) => {
          const s = timing.steps[i];
          const step = lesson.steps[i];
          const isCur = i === cur;
          const inP = isCur ? tw(t, s.startFrame, s.startFrame + FADE, 0, 1, expoOut) : 1;
          const outP = isCur ? 0 : tw(t, timing.steps[cur].startFrame, timing.steps[cur].startFrame + 10, 0, 1);
          const o = i === 0 && isCur ? 1 : isCur ? inP : 1 - outP;
          const dy = isCur ? (1 - inP) * 18 : -outP * 12;
          return (
            <div key={i} style={{ position: 'absolute', inset: 0, opacity: o, transform: `translateY(${dy}px)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ width: 60, height: 60, borderRadius: 30, background: G.primary, color: G.white, display: 'grid', placeItems: 'center', fontSize: 30, fontWeight: 800 }}>{i + 1}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 3, color: G.primary }}>STEP {i + 1} OF {n}</div>
              </div>
              <div style={{ marginTop: 30, fontSize: 80, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1.5, color: G.ink }}>{step.headline}</div>
              <div style={{ marginTop: 26, fontSize: 34, fontWeight: 500, lineHeight: 1.45, color: G.muted, maxWidth: 840 }}>{step.body}</div>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', left: COL_X, top: 800 }}>
        <Captions t={t} pages={pages} width={COL_W} />
      </div>

      <div style={{ position: 'absolute', left: PHONE_X, top: 1018 }}>
        <ProgressBar t={t} starts={starts} end={timing.durationFrames} width={COL_X + COL_W - PHONE_X} />
      </div>
    </AbsoluteFill>
  );
};

export const GuideLesson: React.FC<GuideLessonProps> = ({ lessonId, lesson, timing, hasAudio }) => {
  const f = useCurrentFrame();
  const { width } = useVideoConfig();
  if (!lesson || !timing) return <AbsoluteFill style={{ background: G.paper }} />;

  const k = width / BASE_W;
  const E = TITLE_FRAMES + timing.durationFrames; // end card starts here
  const t = f - TITLE_FRAMES; // frames relative to the narration start

  const titleO = tw(f, TITLE_FRAMES - 10, TITLE_FRAMES + 8, 1, 0, (x) => x);
  const stepsO = Math.min(tw(f, TITLE_FRAMES - 4, TITLE_FRAMES + 14, 0, 1, (x) => x), tw(f, E - 12, E + 6, 1, 0, (x) => x));
  const endO = tw(f, E - 4, E + 14, 0, 1, (x) => x);

  return (
    <AbsoluteFill style={{ background: G.paper }}>
      <div style={{ width: BASE_W, height: BASE_H, transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', left: 0, top: 0 }}>
        {titleO > 0 && <AbsoluteFill style={{ opacity: titleO }}><TitleCard lesson={lesson} f={f} /></AbsoluteFill>}
        {stepsO > 0 && <AbsoluteFill style={{ opacity: stepsO }}><StepScene lesson={lesson} timing={timing} t={t} /></AbsoluteFill>}
        {endO > 0 && <AbsoluteFill style={{ opacity: endO }}><EndCard lesson={lesson} f={Math.max(0, f - (E - 4))} /></AbsoluteFill>}
      </div>
      {hasAudio && (
        <Sequence from={TITLE_FRAMES}>
          <Audio src={staticFile(`guides/audio/${lessonId}.mp3`)} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
