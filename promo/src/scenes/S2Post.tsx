import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ArrowLeft, Calendar, Check, MapPin, Snowflake, Sparkles, Wrench, Zap } from 'lucide-react';
import { C, INTER } from '../theme';
import { BOUNCY, expoIn, hit, hits, shake, sp, spVel, squash, tw } from '../motion';
import { Burst, Headline, Phone, Pill, Rings, countUp, peso } from '../components/ui';

// 180–300 (bars 3–4). "Post a job in minutes" — UI rebuilt from the
// Create Job flow; chips pop on the chord stabs, the job card assembles on the
// kicks, the Post button is tapped on beat 2 of bar 4.
const CHIPS = [
  { label: 'Plumbing', Icon: Wrench, at: 11 },
  { label: 'Cleaning', Icon: Sparkles, at: 22 },
  { label: 'Electrical', Icon: Zap, at: 37 },
  { label: 'Aircon', Icon: Snowflake, at: 49 },
];
const TITLE = 'Fix leaking kitchen sink';

export const S2Post: React.FC = () => {
  const f = useCurrentFrame();
  const enter = sp(f, 0, { damping: 18, stiffness: 110, mass: 0.9 });
  const exit = tw(f, 106, 120, 0, 1, expoIn);
  const kick = hits(f, [0, 15, 30, 45, 60, 75, 90, 105], 4);
  const cam = shake(f, 90, 16, 4);

  const card = sp(f, 60, { damping: 13, stiffness: 220, mass: 0.6 });
  const cv = squash(spVel(f, 60, { damping: 13, stiffness: 220, mass: 0.6 }), 1.2);
  const typed = TITLE.slice(0, Math.floor(tw(f, 62, 80, 0, TITLE.length, (t) => t)));
  const press = hit(f, 90, 3);
  const posted = f >= 92;
  const toast = sp(f, 95, BOUNCY);
  const cursor = tw(f, 78, 89, 0, 1);

  return (
    <AbsoluteFill style={{ background: C.brandCyan, overflow: 'hidden' }}>
      {/* rotating shape play */}
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: i ? -380 : 620, top: i ? 1150 : -260, width: 900, height: 900, borderRadius: 220,
            border: `70px solid ${i ? C.brandTeal : C.brandCyanLight}`, opacity: 0.22,
            transform: `rotate(${f * (i ? -0.9 : 0.7) + 20}deg) scale(${0.9 + kick * 0.03})`,
          }}
        />
      ))}

      <div style={{ position: 'absolute', top: 150, width: '100%', transform: `translateY(${-exit * 400}px)` }}>
        <Headline f={f} at={1} size={132} words={[[{ t: 'Post', c: C.white }, { t: 'a', c: C.white }, { t: 'job', c: C.white }], [{ t: 'in', c: C.brandDark }, { t: 'minutes', c: C.brandDark }]]} />
      </div>

      <AbsoluteFill style={{ perspective: 2400 }}>
        <div
          style={{
            position: 'absolute', left: 240, top: 520,
            transform: `translate(${cam.x - exit * 1500}px, ${(1 - enter) * 1500 + cam.y}px) rotateX(${(1 - enter) * 40}deg) rotateY(${-10 + f * 0.08 + exit * 70}deg) rotateZ(${(1 - enter) * -8 + 2}deg) scale(${1 + kick * 0.012})`,
            transformStyle: 'preserve-3d',
          }}
        >
          <Phone>
            <div style={{ position: 'absolute', inset: 0, fontFamily: INTER, color: C.ink900 }}>
              {/* top bar */}
              <div style={{ position: 'absolute', top: 84, left: 36, right: 36, display: 'flex', alignItems: 'center', gap: 18 }}>
                <ArrowLeft size={36} color={C.ink900} strokeWidth={2.4} />
                <div style={{ fontSize: 32, fontWeight: 800 }}>Post a Job</div>
              </div>
              <div style={{ position: 'absolute', top: 158, left: 36, right: 36, fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em' }}>
                What service do you need?
              </div>
              {/* category chips */}
              <div style={{ position: 'absolute', top: 232, left: 36, right: 36, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {CHIPS.map(({ label, Icon, at }, i) => {
                  const p = sp(f, at, BOUNCY);
                  const sel = i === 0 && f >= 45;
                  const bump = i === 0 ? hit(f, 45, 4) : 0;
                  return (
                    <div
                      key={label}
                      style={{
                        height: 150, borderRadius: 24, background: sel ? C.cyan50 : C.white,
                        border: `3px solid ${sel ? C.brandCyan : C.line}`, padding: 20,
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        transform: `scale(${p * (1 + bump * 0.08)}) rotate(${(1 - p) * (i % 2 ? 14 : -14)}deg)`,
                        boxShadow: '0 6px 18px rgba(15,23,42,0.06)',
                      }}
                    >
                      <div style={{ width: 62, height: 62, borderRadius: 18, background: sel ? C.brandCyan : C.cyan50, display: 'grid', placeItems: 'center' }}>
                        <Icon size={34} color={sel ? C.white : C.cyan600} strokeWidth={2.4} />
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800 }}>{label}</div>
                    </div>
                  );
                })}
              </div>

              {/* job card assembling */}
              <div
                style={{
                  position: 'absolute', top: 600, left: 36, right: 36, borderRadius: 26, background: C.white,
                  border: `2px solid ${C.line}`, padding: 28, boxShadow: '0 18px 40px rgba(6,61,77,0.12)',
                  transform: `translateY(${(1 - card) * -300}px) scale(${card * cv.sx}, ${card * cv.sy})`, transformOrigin: '25% 0%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 30, fontWeight: 800, minHeight: 38 }}>
                    {typed}
                    <span style={{ opacity: f < 84 && Math.floor(f / 4) % 2 === 0 ? 1 : 0, color: C.brandCyan }}>|</span>
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: C.brandTeal }}>{peso(countUp(f, 64, 84, 1500))}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: C.ink400, fontSize: 24, opacity: tw(f, 70, 76), transform: `translateX(${tw(f, 70, 80, -60, 0)}px)` }}>
                  <MapPin size={24} color={C.ink400} /> Brgy. San Antonio, Makati City
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  {[
                    { at: 75, el: <Pill label="Open" color={C.blue} bg="#dbeafe" dot /> },
                    { at: 82, el: <Pill label="Urgent" color={C.red} bg="#fee2e2" /> },
                    { at: 86, el: <Pill label="Plumbing" color={C.cyan600} bg={C.cyan50} /> },
                  ].map(({ at, el }, k) => (
                    <div key={k} style={{ transform: `scale(${sp(f, at, BOUNCY)})` }}>{el}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, paddingTop: 16, borderTop: `2px solid ${C.line}`, color: C.ink500, fontSize: 23, fontWeight: 600, opacity: tw(f, 86, 92) }}>
                  <Calendar size={24} color={C.ink500} /> Tomorrow, 9:00 AM
                </div>
              </div>

              {/* post button */}
              <div
                style={{
                  position: 'absolute', left: 36, right: 36, bottom: 70, height: 104, borderRadius: 30,
                  background: posted ? C.green : `linear-gradient(90deg, ${C.brandCyan}, ${C.brandTeal})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
                  color: C.white, fontSize: 34, fontWeight: 800,
                  transform: `scale(${(1 - press * 0.1) * sp(f, 56, BOUNCY)}, ${(1 - press * 0.16) * sp(f, 56, BOUNCY)})`,
                  boxShadow: '0 14px 30px rgba(8,145,178,0.35)', overflow: 'hidden',
                }}
              >
                {posted ? (
                  <>
                    <Check size={40} color={C.white} strokeWidth={3.2} style={{ transform: `scale(${sp(f, 92, BOUNCY)})` }} /> Posted!
                  </>
                ) : (
                  'Post Job'
                )}
              </div>
              <Rings f={f} at={90} x={284} y={1188 - 70 - 52} color={C.white} max={320} count={2} width={10} />
              {/* finger */}
              <div
                style={{
                  position: 'absolute', width: 70, height: 70, borderRadius: 99, background: 'rgba(255,255,255,0.55)',
                  border: '4px solid rgba(255,255,255,0.9)',
                  left: 284 - 35 + (1 - cursor) * 180, top: 1188 - 122 - 35 + (1 - cursor) * 160,
                  opacity: tw(f, 78, 82) * (1 - tw(f, 96, 100)), transform: `scale(${1 - press * 0.3})`,
                }}
              />
              <Burst f={f} at={91} x={284} y={1066} n={22} radius={300} colors={[C.green, C.brandCyan, C.amber, C.brandCyanLight]} size={18} />

              {/* toast */}
              <div
                style={{
                  position: 'absolute', left: 30, right: 30, top: 70, borderRadius: 26, background: C.ink900, color: C.white,
                  padding: '24px 26px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 25, fontWeight: 700,
                  transform: `translateY(${(1 - toast) * -260}px)`,
                  boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                }}
              >
                <div style={{ width: 50, height: 50, borderRadius: 99, background: C.green, display: 'grid', placeItems: 'center' }}>
                  <Check size={30} color={C.white} strokeWidth={3} />
                </div>
                Job posted! Nearby providers notified.
              </div>
            </div>
          </Phone>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
