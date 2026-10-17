import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BadgeCheck, Check, MapPin, Snowflake } from 'lucide-react';
import { C, INTER } from '../theme';
import { BOUNCY, expoIn, expoOut, hit, hits, shake, sp, tw } from '../motion';
import { Burst, Headline, Pill, Rings, countUp, peso } from '../components/ui';

// 540–660 (bars 9–10). Provider side: radar pulses on kicks, pins drop on the
// chord stabs, then a booking is accepted, verified badge stamps, earnings grow.
const PINS = [
  { x: 250, y: 300, at: 0, price: '₱800' },
  { x: 700, y: 210, at: 11, price: '₱1,500' },
  { x: 760, y: 590, at: 22, price: '₱650' },
  { x: 300, y: 660, at: 37, price: '₱2,000' },
  { x: 560, y: 450, at: 49, price: '₱1,200' },
];
const MAP = { x: 80, y: 500, w: 920, h: 920 };

export const S5Near: React.FC = () => {
  const f = useCurrentFrame();
  const exit = tw(f, 108, 120, 0, 1, expoIn);
  const kicks = [0, 15, 30, 45];
  const cam = shake(f, 75, 18, 4);

  const mapIn = sp(f, 0, { damping: 16, stiffness: 150, mass: 0.8 });
  const mapBack = tw(f, 56, 72, 0, 1, expoOut);
  const zoom = 1 + tw(f, 0, 60, 0, 0.12, (t) => t);

  const sheet = sp(f, 58, { damping: 16, stiffness: 190, mass: 0.7 });
  const accepted = f >= 75;
  const earn = sp(f, 88, { damping: 15, stiffness: 180, mass: 0.7 });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, ${C.brandTeal}, ${C.brandDark})`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 96, width: '100%', display: 'flex', justifyContent: 'center', transform: `scale(${sp(f, 0, BOUNCY)})` }}>
        <Pill label="FOR PROVIDERS" color={C.brandDark} bg={C.brandCyanLight} size={28} style={{ letterSpacing: '0.12em' }} />
      </div>
      <div style={{ position: 'absolute', top: 190, width: '100%' }}>
        <Headline f={f} at={2} out={52} size={128} words={[[{ t: 'Find', c: C.white }, { t: 'jobs', c: C.white }], [{ t: 'near', c: C.brandCyanLight }, { t: 'you', c: C.brandCyanLight }]]} />
      </div>
      <div style={{ position: 'absolute', top: 190, width: '100%', transform: `translateY(${-exit * 400}px)` }}>
        <Headline f={f} at={60} size={128} words={[[{ t: 'Confirm', c: C.white }, { t: 'and', c: C.white }], [{ t: 'get', c: C.brandCyanLight }, { t: 'paid', c: C.brandCyanLight }]]} />
      </div>

      <AbsoluteFill style={{ transform: `translate(${cam.x}px, ${cam.y}px)`, opacity: 1 - exit }}>
        {/* map card */}
        <div
          style={{
            position: 'absolute', left: MAP.x, top: MAP.y, width: MAP.w, height: MAP.h, borderRadius: 64, overflow: 'hidden',
            background: '#e3f3f8', boxShadow: '0 40px 90px rgba(0,0,0,0.35)',
            transform: `translateY(${(1 - mapIn) * 1400 - mapBack * 60}px) scale(${1 - mapBack * 0.14}) rotate(${(1 - mapIn) * 10}deg)`,
            filter: `brightness(${1 - mapBack * 0.25})`,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom}) rotate(${-4 + f * 0.05}deg)` }}>
            <svg width={MAP.w} height={MAP.h} style={{ position: 'absolute' }}>
              <path d="M -50 700 C 200 640 360 820 600 760 S 900 640 1000 700" stroke={C.brandCyanLight} strokeWidth={70} fill="none" opacity={0.9} />
              <ellipse cx={180} cy={180} rx={120} ry={90} fill="#c9ecd4" />
              <ellipse cx={820} cy={420} rx={110} ry={150} fill="#c9ecd4" />
              {[120, 360, 600, 820].map((x, i) => (
                <line key={'v' + i} x1={x} y1={0} x2={x} y2={MAP.h} stroke={C.white} strokeWidth={i % 2 ? 22 : 34} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tw(f, i * 2, i * 2 + 18)} />
              ))}
              {[140, 380, 560, 860].map((y, i) => (
                <line key={'h' + i} x1={0} y1={y} x2={MAP.w} y2={y} stroke={C.white} strokeWidth={i % 2 ? 34 : 22} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tw(f, 4 + i * 2, 22 + i * 2)} />
              ))}
            </svg>
            {/* me + radar */}
            <Rings f={f} at={kicks[0]} x={460} y={470} color={C.brandCyan} max={380} count={1} width={14} />
            <Rings f={f} at={kicks[1]} x={460} y={470} color={C.brandCyan} max={380} count={1} width={14} />
            <Rings f={f} at={kicks[2]} x={460} y={470} color={C.brandCyan} max={380} count={1} width={14} />
            <Rings f={f} at={kicks[3]} x={460} y={470} color={C.brandCyan} max={380} count={1} width={14} />
            <div style={{ position: 'absolute', left: 460 - 26, top: 470 - 26, width: 52, height: 52, borderRadius: 99, background: C.brandCyan, border: '8px solid white', boxShadow: '0 6px 16px rgba(0,0,0,0.25)', transform: `scale(${sp(f, 2, BOUNCY) * (1 + hits(f, kicks, 4) * 0.25)})` }} />
            {/* pins drop with squash on land */}
            {PINS.map((p, i) => {
              const fall = tw(f, p.at, p.at + 7, 1, 0, expoIn);
              const land = hit(f, p.at + 7, 4);
              const shown = f >= p.at;
              const tag = sp(f, p.at + 8, BOUNCY);
              return shown ? (
                <div key={i}>
                  <div style={{ position: 'absolute', left: p.x - 36, top: p.y - 6, width: 72, height: 18, borderRadius: '50%', background: 'rgba(6,61,77,0.25)', transform: `scale(${1 - fall * 0.7})` }} />
                  <div style={{ position: 'absolute', left: p.x - 50, top: p.y - 100 - fall * 700, transform: `scale(${1 + land * 0.35}, ${1 - land * 0.3})`, transformOrigin: '50% 100%' }}>
                    <MapPin size={100} color={C.white} fill={i === 4 ? C.brandRed : C.brandTeal} strokeWidth={1.8} />
                  </div>
                  <div style={{ position: 'absolute', left: p.x + 36, top: p.y - 150, transform: `scale(${tag})`, transformOrigin: '0% 100%' }}>
                    <Pill label={p.price} color={C.ink900} bg={C.white} size={30} style={{ boxShadow: '0 8px 20px rgba(6,61,77,0.2)' }} />
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </div>

        {/* booking sheet */}
        <div
          style={{
            position: 'absolute', left: 60, right: 60, top: 1000, borderRadius: 48, background: C.white, padding: 44,
            fontFamily: INTER, color: C.ink900, boxShadow: '0 -20px 80px rgba(0,0,0,0.35)',
            transform: `translateY(${(1 - sheet) * 1100}px)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 96, height: 96, borderRadius: 26, background: C.cyan50, display: 'grid', placeItems: 'center' }}>
              <Snowflake size={56} color={C.cyan600} strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 44, fontWeight: 900 }}>Aircon cleaning</div>
              <div style={{ fontSize: 30, fontWeight: 600, color: C.ink500, marginTop: 6 }}>1.2 km away · Today, 2:00 PM</div>
            </div>
            <div style={{ fontSize: 46, fontWeight: 900, color: C.brandTeal }}>₱1,200</div>
          </div>
          <div
            style={{
              marginTop: 34, height: 110, borderRadius: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
              background: accepted ? C.green : `linear-gradient(90deg, ${C.brandCyan}, ${C.brandTeal})`, color: C.white, fontSize: 38, fontWeight: 800,
              transform: `scale(${1 - hit(f, 75, 3) * 0.08}, ${1 - hit(f, 75, 3) * 0.14})`,
            }}
          >
            {accepted ? <><Check size={44} color={C.white} strokeWidth={3.2} /> Booking accepted</> : 'Accept Booking'}
          </div>
          <Burst f={f} at={75} x={480} y={250} n={20} radius={320} colors={[C.green, C.brandCyan, C.amber]} size={18} />
          {/* verified stamp */}
          <div style={{ position: 'absolute', right: -20, top: -70, transform: `scale(${f >= 82 ? 1 + (1 - sp(f, 82, { damping: 11, stiffness: 320, mass: 0.6 })) * 2 : 0}) rotate(${-10}deg)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.brandCyan, color: C.white, padding: '14px 26px', borderRadius: 99, fontSize: 32, fontWeight: 900, boxShadow: '0 14px 30px rgba(10,162,203,0.5)' }}>
              <BadgeCheck size={40} color={C.white} strokeWidth={2.6} /> Verified
            </div>
          </div>
        </div>

        {/* earnings */}
        <div
          style={{
            position: 'absolute', left: 60, right: 60, top: 1460, borderRadius: 48, background: C.brandDark, padding: '40px 44px',
            fontFamily: INTER, color: C.white, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            border: `3px solid rgba(153,222,241,0.25)`, transform: `translateY(${(1 - earn) * 800}px)`,
          }}
        >
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.brandCyanLight }}>Total Earned</div>
            <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: '-0.04em' }}>{peso(countUp(f, 88, 112, 12450))}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150 }}>
            {[0.35, 0.55, 0.45, 0.75, 1].map((h, i) => (
              <div key={i} style={{ width: 34, borderRadius: 12, background: i === 4 ? C.brandCyan : C.brandTeal, height: 150 * h * sp(f, 90 + i * 3, BOUNCY) }} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
