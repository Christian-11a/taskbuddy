import React from 'react';
import {
  ArrowDownLeft, ArrowRight, Award, Bell, Briefcase, CalendarCheck, CalendarDays, Camera, Check, ChevronRight, Circle, CircleCheck, Hourglass, IdCard, ImagePlus, Landmark, Lock, MapPin, Search, ShieldCheck, TrendingUp, UserRound, Wrench, Images,
} from 'lucide-react';
import { Screens, Tap, pop } from '../v2/kit';
import { expoOut, hit, sp, tw } from '../motion';
import { peso } from '../components/ui';
import { AppBar, Avatar, Box, Btn, Caret, Empty, Footer, Notice, Person, Pill, Radio, Section, Sheet, Status, StatusBar, StepTitle, Stepper, T, TabBar, WhenWhere, pal } from './ui';
import { ChatScreen, bg } from './ClientPhone';
import { CLIENT as C, JOB, K, MSG, PRO as P } from './story';

const N = pal('provider');
const typed = (f: number, a: number, b: number, s: string) => s.slice(0, Math.floor(tw(f, a, b, 0, s.length, (t) => t)));

// ── Feed header (SPHomeScreen) ──────────────────────────────────────────────
const Header: React.FC<{ dot?: boolean }> = ({ dot }) => (
  <div style={{ position: 'absolute', top: 93, left: 20, right: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
    <Avatar ini={P.ini} size={40} tone="provider" fs={14} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ fontSize: 13, lineHeight: '20px', color: T.ink500 }}>Hello</div><div style={{ fontSize: 18, lineHeight: '24px', fontWeight: 700 }}>{P.name}</div></div>
    <div style={{ width: 44, height: 44, borderRadius: 22, background: T.surface, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center', position: 'relative' }}>
      <Bell size={20} color={T.ink900} strokeWidth={2.2} />
      {dot && <div style={{ position: 'absolute', top: -4, right: -3, minWidth: 22, height: 18, borderRadius: 9, background: T.danger, border: `2px solid ${T.surface}`, color: T.white, fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>1</div>}
    </div>
  </div>
);

// Setup panel while the provider is not verified yet (SetupPanel + providerSetup.ts, 5 steps).
const SETUP = [
  ['Add your address', JOB.address, 'done'], ['Add a short bio', 'Licensed plumber, 8 years of home repairs.', 'done'],
  ['Verify your ID', 'ID photo + selfie · about 2 minutes', 'next'], ['Upload your certificate', 'TESDA, PRC or trade certificate for your service', 'later'],
  ['Link payout account', 'Linked', 'done'],
] as const;
const FeedSetup = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <Header />
    <div style={{ position: 'absolute', top: 158, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: N.primary, borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 8, color: T.white }}>
        <div style={{ alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 600, lineHeight: '16px', color: 'rgba(255,255,255,0.82)' }}>Finish setting up · 3 of 5</div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px' }}>Get verified to see jobs near you</div>
        <div style={{ fontSize: 13, lineHeight: '18px' }}>Clients only see verified providers. It takes about 2 minutes.</div>
        <div style={{ display: 'flex', gap: 6, paddingTop: 6 }}>{SETUP.map(([l, , s]) => <div key={l} style={{ flex: 1, height: 6, borderRadius: 3, background: s === 'done' ? T.white : 'rgba(255,255,255,0.22)' }} />)}</div>
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SETUP.map(([l, sub, s], i) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, background: s === 'done' ? T.okSurface : s === 'next' ? N.tonal : T.ink50, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {s === 'done' ? <Check size={16} color={T.okText} strokeWidth={2.6} /> : <span style={{ fontSize: 14, fontWeight: 700, color: s === 'next' ? N.deep : T.ink500 }}>{i + 1}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 15, lineHeight: '20px', fontWeight: s === 'next' ? 700 : 600, color: s === 'next' ? T.ink900 : s === 'later' ? T.ink500 : T.ink700 }}>{l}</div>
              <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
            </div>
          </div>
        ))}
        <div style={{ minHeight: 48, borderRadius: 16, background: N.primary, color: T.white, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, transform: `scale(${1 - hit(f, K.pVerifyTap, 3) * 0.04})` }}>Verify your ID <ArrowRight size={16} strokeWidth={2.4} /></div>
      </div>
      <Section title="Jobs near you" tone="provider" />
    </div>
    <TabBar tone="provider" active={0} />
    <Tap f={f} at={K.pVerifyTap} x={205} y={656} />
  </div>
);

// Verified feed with open jobs (JobRow + DateBlock).
const JobRow: React.FC<{ d: string; n: string; t: string; m: string; v: number; glow?: number }> = ({ d, n, t, m, v, glow = 0 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: T.surface, boxShadow: glow ? `0 0 0 ${2 + glow * 3}px rgba(45,74,104,${0.25 + glow * 0.5})` : '0 1px 3px rgba(15,23,42,0.12)' }}>
    <div style={{ width: 46, height: 48, borderRadius: 12, background: N.tonal, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: N.link }}>{d}</div><div style={{ fontSize: 18, fontWeight: 700, lineHeight: '20px', color: N.deep }}>{n}</div>
    </div>
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{t}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: 4, background: N.link }} />
        <div style={{ flex: 1, fontSize: 13, lineHeight: '18px', color: T.ink500 }}>{m}</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{peso(v)}</div>
      </div>
    </div>
  </div>
);
const OTHER = [{ d: 'THU', n: '22', t: 'Plumbing: Repair or replace pipes', m: '2.2 km away · Normal', v: 2150 }, { d: 'SAT', n: '24', t: 'Cleaning: Deep clean condo', m: '3.1 km away · Flexible', v: 1800 }];
const Feed = (f: number) => {
  const landed = f >= K.jobLand;
  const shift = landed ? (1 - tw(f, K.jobLand, K.jobLand + 14, 0, 1, expoOut)) * -80 : 0;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Header dot={landed} />
      <div style={{ position: 'absolute', top: 158, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ background: N.primary, borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 8, color: T.white }}>
          <div style={{ alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 600, lineHeight: '16px', color: 'rgba(255,255,255,0.82)' }}>No booking yet</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px' }}>Find your next job</div>
          <div style={{ fontSize: 13, lineHeight: '18px' }}>Browse open jobs near you.</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px 10px 16px', borderRadius: 999, background: T.white, color: N.primary, fontSize: 14, fontWeight: 600, lineHeight: '18px' }}>Find jobs <ArrowRight size={16} strokeWidth={2.4} /></div></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px', borderRadius: 18, background: T.surface, border: `1px solid ${T.line}` }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: T.okSolid }} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>Available for jobs</div><div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500, marginTop: 1 }}>Clients within 10 km can invite you</div></div>
          <div style={{ width: 44, height: 24, borderRadius: 12, background: T.okSolid, position: 'relative' }}><div style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, background: T.white }} /></div>
        </div>
        <div style={{ minHeight: 52, borderRadius: 999, background: T.surface, border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: T.ink500, fontSize: 15.5 }}><Search size={18} /> Search open jobs</div>
        <div style={{ display: 'flex', gap: 8 }}><Pill label="All" count={landed ? 3 : 2} on tone="provider" /><Pill label="Urgent" count={0} /><Pill label="Normal" count={landed ? 2 : 1} /><Pill label="Flexible" count={1} /></div>
        <Section title="Open jobs near you" count={landed ? 3 : 2} tone="provider" pop={1 + hit(f, K.jobLand, 5) * 0.4} />
      </div>
      <div style={{ position: 'absolute', top: 598, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {landed && <div style={{ transform: `scale(${1 + hit(f, K.jobLand, 6) * 0.05})` }}><JobRow d="TUE" n="20" t={JOB.title} m="1.2 km away · Normal" v={JOB.price} glow={Math.max(0.35, hit(f, K.jobLand, 22))} /></div>}
        {OTHER.map((j) => <div key={j.t} style={{ transform: `translateY(${shift}px)` }}><JobRow {...j} /></div>)}
      </div>
      <TabBar tone="provider" active={0} />
      <Tap f={f} at={K.pOpenJob} x={205} y={634} />
    </div>
  );
};

// ── Get verified (SPVerificationScreen) ─────────────────────────────────────
const VBar = (n: number, label: string, f: number, at: number) => (
  <>
    <AppBar title="Get verified" y={111} />
    <div style={{ position: 'absolute', top: 146, left: 20, right: 20 }}>
      <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: T.ink100, overflow: 'hidden' }}><div style={{ height: '100%', width: `${i < n ? 100 : i === n ? tw(f, at, at + 10, 0, 100) : 0}%`, background: N.primary }} /></div>)}</div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: N.link }}>{`STEP ${n} OF 5 · ${label.toUpperCase()}`}</div>
    </div>
  </>
);
const VFooter: React.FC<{ f: number; press?: number; label: string; note?: string; link?: string; off?: boolean }> = ({ f, press, label, note, link, off }) => (
  <Footer note={note} link={link} tone="provider"><Btn f={f} press={press} tone="provider" off={off} label={label} h={46} r={16} size={14} style={{ flex: 1, fontWeight: 600 }} /></Footer>
);
const Ticks: React.FC<{ items: string[]; f: number; at: number }> = ({ items, f, at }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    {items.map((t, i) => (
      <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: tw(f, at + i * 3, at + i * 3 + 6) }}>
        <div style={{ width: 20, height: 20, borderRadius: 10, background: N.tonal, display: 'grid', placeItems: 'center', marginTop: 1 }}><Check size={12} color={N.deep} strokeWidth={3} /></div>
        <div style={{ fontSize: 15, fontWeight: 500, lineHeight: '20px' }}>{t}</div>
      </div>
    ))}
  </div>
);
const IDS = [['PhilSys National ID', 'Photo of the front'], ["Driver's licence", 'Photo of the front'], ['UMID', 'Photo of the front'], ['Passport', 'Photo page'], ['Postal ID', 'Photo of the front']];
const V1 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    {VBar(1, 'Your ID', f, K.pStep1)}
    <StepTitle top={208} size={21}>Which ID will you use?</StepTitle>
    <div style={{ position: 'absolute', top: 254, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {IDS.map(([t, s], i) => {
        const sel = i === 0 && f >= K.pPickId;
        return (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, border: sel ? `1.5px solid ${N.link}` : `1px solid ${T.line}`, background: sel ? N.tonal : T.surface, transform: `scale(${1 + (i === 0 ? hit(f, K.pPickId, 4) * 0.03 : 0)})` }}>
            <Radio on={sel} tone="provider" />
            <div style={{ width: 36, height: 36, borderRadius: 10, background: sel ? T.surface : T.skeleton, display: 'grid', placeItems: 'center' }}><IdCard size={18} color={T.ink700} /></div>
            <div><div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{t}</div><div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500 }}>{s}</div></div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 10, padding: 14, borderRadius: 14, background: T.ink50, marginTop: 6 }}><ShieldCheck size={18} color={T.ink500} style={{ flexShrink: 0 }} /><div style={{ fontSize: 14, lineHeight: '19px', color: T.ink700 }}>Use your original, valid ID. Photocopies, screenshots and expired IDs can&apos;t be accepted.</div></div>
    </div>
    <VFooter f={f} press={K.pStep1Next} label="Continue" note={f < K.pPickId ? 'Choose an ID to continue' : undefined} off={f < K.pPickId} />
    <Tap f={f} at={K.pPickId} x={190} y={288} />
    <Tap f={f} at={K.pStep1Next} x={205} y={851} />
  </div>
);

const SpecimenId: React.FC<{ w: number }> = ({ w }) => (
  <div style={{ width: w, height: w * 0.63, background: '#FFFFFF', borderTop: `3px solid ${N.link}`, borderBottom: `3px solid ${N.link}`, padding: w * 0.04, position: 'relative', overflow: 'hidden' }}>
    <div style={{ fontSize: w * 0.052, fontWeight: 600, color: '#B91C1C' }}>SPECIMEN - NOT A VALID ID</div>
    <div style={{ fontSize: w * 0.045, color: '#1D4ED8', marginTop: w * 0.02 }}>TaskBuddy sample</div>
    <div style={{ display: 'flex', gap: w * 0.06, marginTop: w * 0.05, alignItems: 'center' }}>
      <div style={{ width: w * 0.16, height: w * 0.24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}><div style={{ width: w * 0.12, height: w * 0.12, borderRadius: 99, background: '#64748B' }} /><div style={{ width: w * 0.16, height: w * 0.1, borderRadius: `${w * 0.08}px ${w * 0.08}px 0 0`, background: '#64748B', marginTop: 4 }} /></div>
      <div><div style={{ fontSize: w * 0.052 }}>{P.name}</div><div style={{ fontSize: w * 0.052, marginTop: w * 0.03 }}>DEMO-0000</div></div>
    </div>
    <div style={{ fontSize: w * 0.052, color: '#B91C1C', position: 'absolute', bottom: w * 0.04, left: w * 0.04 }}>FICTIONAL TEST DATA ONLY</div>
  </div>
);
const V2 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    {VBar(2, 'ID photo', f, K.pStep2)}
    <StepTitle top={208} size={21}>Is everything readable?</StepTitle>
    <div style={{ position: 'absolute', top: 258, left: 20, transform: `translateY(${(1 - sp(f, K.pStep2 + 2)) * 60}px)`, opacity: tw(f, K.pStep2 + 1, K.pStep2 + 6) }}><SpecimenId w={371} /></div>
    <div style={{ position: 'absolute', top: 550, left: 20, right: 20, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16 }}><Ticks f={f} at={K.pStep2 + 6} items={['Name and photo are sharp', 'All 4 corners are visible', 'No glare or shadows on the text']} /></div>
    <VFooter f={f} press={K.pUsePhoto} label="Use this photo" link="Retake" />
    <Tap f={f} at={K.pUsePhoto} x={205} y={825} />
  </div>
);

const Selfie: React.FC<{ d: number }> = ({ d }) => (
  <div style={{ width: d, height: d, borderRadius: d, background: '#CFE8D2', overflow: 'hidden', position: 'relative' }}>
    <div style={{ position: 'absolute', left: d * 0.32, top: d * 0.2, width: d * 0.36, height: d * 0.36, borderRadius: d, background: '#7C8A99' }} />
    <div style={{ position: 'absolute', left: d * 0.14, top: d * 0.6, width: d * 0.72, height: d * 0.6, borderRadius: d, background: '#7C8A99' }} />
  </div>
);
const V3 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    {VBar(3, 'Selfie', f, K.pStep3)}
    <StepTitle top={208} size={21}>Now a quick selfie</StepTitle>
    <div style={{ position: 'absolute', top: 252, left: 20, fontSize: 15, color: T.ink500 }}>We match your face with the photo on your ID.</div>
    <div style={{ position: 'absolute', top: 292, left: 106, transform: `scale(${sp(f, K.pStep3 + 2)})` }}><Selfie d={198} /></div>
    <div style={{ position: 'absolute', top: 506, left: 20, right: 20 }}><Ticks f={f} at={K.pStep3 + 6} items={['Take off glasses, hat and face mask', 'Face a window or a bright light', 'Hold the phone at eye level', 'Only you in the photo']} /></div>
    <VFooter f={f} press={K.pSelfieNext} label="Continue" link="Retake" />
    <Tap f={f} at={K.pSelfieNext} x={205} y={825} />
  </div>
);

const CertPhoto: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <div style={{ width: w, height: h, borderRadius: 10, background: '#FFFDF5', border: '2px solid #E7C873', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
    <Award size={h * 0.28} color="#B45309" />
    <div style={{ fontSize: Math.max(8, h * 0.09), fontWeight: 800, color: '#92400E', letterSpacing: 0.4 }}>SPECIMEN CERTIFICATE</div>
    <div style={{ fontSize: Math.max(7, h * 0.07), color: '#92400E' }}>Plumbing NC II · test only</div>
  </div>
);
const V4 = (f: number) => {
  const photo = f >= K.pStep4 + 6;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {VBar(4, 'Certificate', f, K.pStep4)}
      <StepTitle top={208} size={21}>Your Plumbing certificate</StepTitle>
      <div style={{ position: 'absolute', top: 254, left: 20, right: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginBottom: 10 }}>Type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{['TESDA NC', 'PRC licence', 'Trade certificate', 'Other'].map((l, i) => <div key={l} style={{ padding: '9px 14px', borderRadius: 999, background: i === 0 ? N.primary : T.surface, border: `1px solid ${i === 0 ? N.primary : T.line}`, color: i === 0 ? T.white : T.ink700, fontSize: 14, fontWeight: 600 }}>{l}</div>)}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink700, marginTop: 16 }}>Service: Plumbing</div>
        <div style={{ fontSize: 13.5, lineHeight: '19px', color: T.ink700, marginTop: 12 }}>TESDA Plumbing NC II. An admin checks it matches your service.</div>
        <div style={{ marginTop: 14, height: 140, borderRadius: 16, background: photo ? T.surface : N.tonal, border: photo ? `1px solid ${T.line}` : undefined, display: 'grid', placeItems: 'center' }}>
          {photo ? <div style={{ transform: `scale(${pop(f, K.pStep4 + 6)})` }}><CertPhoto w={190} h={116} /></div> : <div style={{ textAlign: 'center', color: N.deep, fontSize: 15, fontWeight: 600 }}><ImagePlus size={26} style={{ marginBottom: 6 }} /><div>Add certificate photo</div></div>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginTop: 18, marginBottom: 6 }}>Certificate name</div>
        <div style={{ minHeight: 48, borderRadius: 12, border: f < K.pCertNext - 2 && f >= K.pStep4 + 8 ? `2px solid ${N.link}` : `1px solid ${T.field}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 16 }}>{typed(f, K.pStep4 + 8, K.pStep4 + 18, 'Plumbing NC II')}<Caret f={f} until={K.pCertNext - 2} tone="provider" /></div>
        <div style={{ fontSize: 12.5, color: T.ink500, marginTop: 6 }}>e.g. Plumbing NC II</div>
      </div>
      <VFooter f={f} press={K.pCertNext} label="Upload certificate" />
      <Tap f={f} at={K.pCertNext} x={205} y={851} />
    </div>
  );
};

const PhotoCard: React.FC<{ title: string; children: React.ReactNode; f: number; at: number; note?: string; action?: string }> = ({ title, children, f, at, note, action = 'Retake' }) => (
  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, transform: `scale(${pop(f, at)})` }}>
    <div style={{ height: 104, borderRadius: 10, overflow: 'hidden', background: T.ink50, position: 'relative' }}>{children}</div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}><div style={{ width: 18, height: 18, borderRadius: 9, background: T.okSolid, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Check size={11} color={T.white} strokeWidth={3} /></div><span style={{ fontSize: 14, fontWeight: 600, lineHeight: '18px' }}>{title}</span></div>
    {note && <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink700 }}>{note}</div>}
    <div style={{ marginTop: 'auto', fontSize: 14, fontWeight: 600, color: N.link, padding: '4px 0' }}>{action}</div>
  </div>
);
const V5 = (f: number) => {
  const agreed = f >= K.pAgree;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {VBar(5, 'Review', f, K.pStep5)}
      <div style={{ position: 'absolute', top: 196, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 21, fontWeight: 800, lineHeight: '26px' }}>Ready to send</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <PhotoCard title="Front" f={f} at={K.pStep5 + 2}><div style={{ position: 'absolute', inset: 0, background: '#FFFFFF' }}><div style={{ position: 'absolute', left: 1, top: 22, transform: 'scale(0.255)', transformOrigin: '0 0' }}><SpecimenId w={371} /></div></div></PhotoCard>
          <PhotoCard title="Selfie" f={f} at={K.pStep5 + 4}><div style={{ position: 'absolute', inset: 0, background: '#CFE8D2', display: 'grid', placeItems: 'center' }}><UserRound size={50} color="#7C8A99" /></div></PhotoCard>
          <PhotoCard title="Certificate · Plumbing" note="Sent for review" action="Replace" f={f} at={K.pStep5 + 6}><div style={{ position: 'absolute', inset: 0, background: '#FFFDF5', display: 'grid', placeItems: 'center' }}><CertPhoto w={80} h={84} /></div></PhotoCard>
        </div>
        <div style={{ fontSize: 14.5, lineHeight: '20px', color: T.ink700 }}>Certificate for Plumbing: sent for review</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface }}>
          <Box on={agreed} f={f} at={K.pAgree} tone="provider" size={24} />
          <div style={{ fontSize: 14.5, lineHeight: '20px' }}>This is my own valid ID, and I agree to TaskBuddy using these photos to verify me.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: 14, borderRadius: 14, background: T.ink50 }}><Lock size={18} color={T.ink500} style={{ flexShrink: 0 }} /><div style={{ fontSize: 13.5, lineHeight: '19px', color: T.ink700 }}>Next, Stripe opens a secure page and asks you to scan your ID and face once more to confirm it&apos;s you. Only TaskBuddy admins can see the photos you took here.</div></div>
        <div style={{ fontSize: 14, lineHeight: '19px', color: T.ink700 }}>If Stripe isn&apos;t available, your photos go to a TaskBuddy admin for manual review.</div>
      </div>
      <VFooter f={f} press={K.pSecure} label="Continue to secure check" note={agreed ? undefined : 'Tick the box above to continue'} off={!agreed} />
      <Tap f={f} at={K.pAgree} x={46} y={554} />
      <Tap f={f} at={K.pSecure} x={205} y={851} />
    </div>
  );
};

const ROWS = [['Documents sent', 'Your ID and selfie reached TaskBuddy.'], ['Automated check', 'Running. This usually takes a couple of minutes.'], ['Admin review', 'Only if the automated check cannot decide.'], ['You can apply to jobs', 'After you are approved.']];
const Pending = (f: number) => {
  const passed = f >= K.pVerified;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="Verification" y={111} />
      <div style={{ position: 'absolute', top: 156, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Status tone="attention" app="provider" over="In review · sent Oct 19" title="We're checking your documents" body="The automated check is running — this usually takes a couple of minutes. You can leave this screen; we'll notify you when it finishes." I={Hourglass}>
          <div style={{ fontSize: 14, fontWeight: 600, color: N.link, marginTop: 4 }}>Check again</div>
        </Status>
        <div>
          {ROWS.map(([t, d], i) => {
            const state = i === 0 || (passed && i === 1) ? 'done' : (!passed && i === 1) || (passed && i === 3) ? 'current' : 'upcoming';
            return (
              <div key={t} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                <div style={{ width: 22, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 22, height: 22, display: 'grid', placeItems: 'center' }}>
                    {state === 'done' ? <CircleCheck size={20} color={T.okText} /> : state === 'current' ? <div style={{ width: 12, height: 12, borderRadius: 6, background: N.link }} /> : <Circle size={20} color={T.ink500} />}
                  </div>
                  {i < ROWS.length - 1 && <div style={{ flex: 1, width: 2, margin: '3px 0', background: T.line }} />}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 1 }}>
                  <div style={{ fontSize: 15, lineHeight: '20px', fontWeight: state === 'upcoming' ? 500 : 600, color: state === 'upcoming' ? T.ink700 : T.ink900 }}>{t}</div>
                  <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500 }}>{d}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Job details (SPJobDetailScreen + providerJobView) ───────────────────────
type Mode = 'new' | 'sent' | 'booked' | 'working';
const Earn: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}>
    {[['Job price', peso(JOB.price)], ['Platform fee', `−${peso(JOB.fee)}`], ['You receive', peso(JOB.net)]].map(([k, v]) => (
      <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 14, color: T.ink700 }}>{k}</span><span style={{ fontSize: 15, fontWeight: 700 }}>{v}</span></div>
    ))}
    <div style={{ height: 1, background: T.line }} />
    <div style={{ fontSize: 14, lineHeight: '20px' }}>You&apos;ll receive {peso(JOB.net)} when the client confirms the job is done.</div>
  </div>
);
const Detail = (f: number, mode: Mode) => {
  const ticks = [f >= K.pTick1, f >= K.pTick2];
  const all = ticks[1];
  const status = mode === 'new'
    ? <Status tone="action" app="provider" over="New job" title={`Client wants this done by ${JOB.day}`} body="Send a proposal. The client compares proposals and hires one provider." I={CircleCheck} />
    : mode === 'sent'
      ? <Status tone="attention" app="provider" over="Waiting for client" title="Your proposal is in" body="The client is comparing proposals. We'll notify you the moment they decide." I={Hourglass} f={f} at={K.pSent + 2} />
      : mode === 'booked'
        ? <Status tone="booked" app="provider" over={`Booked · ${JOB.dayUpper}`} title={`Go to ${JOB.address}`} body={`9:00 AM. The client already paid ${peso(JOB.price)}. It's held safely and released to you as soon as the client confirms the job is done.`} I={CalendarCheck} f={f} at={K.pBooked + 4} />
        : all
          ? <Status tone="booked" app="provider" over="Working" title="Waiting for client to confirm completion" body="All tasks are ticked. Payment is released as soon as the client confirms." I={CalendarCheck} f={f} at={K.pTick2} />
          : <Status tone="booked" app="provider" over="Working" title="Tick tasks as you finish them" body="When all are ticked, the client is asked to confirm. Payment is released as soon as the client confirms." I={CalendarCheck} />;
  const working = mode === 'working';
  const footer = mode === 'new' ? <VFooter f={f} press={K.pSendTap} label="Send proposal" />
    : mode === 'sent' ? <VFooter f={f} label="Find more jobs" link="Withdraw proposal" />
      : mode === 'booked' ? <VFooter f={f} press={K.pStart} label="Start job" link="Can't make it? Decline booking" />
        : <VFooter f={f} label="Message client" />;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="Job details" white menu y={110} size={19.5} />
      <div style={{ position: 'absolute', top: 160, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.9, color: N.link }}>PLUMBING</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px' }}>{JOB.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{peso(JOB.price)}</div><div style={{ borderRadius: 999, padding: '3px 9px', background: T.ink50, fontSize: 12, fontWeight: 700, color: T.ink700 }}>Normal</div></div>
        </div>
        {status}
        {mode === 'sent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Your proposal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}><div style={{ fontSize: 13, color: T.ink500 }}>Sent just now</div><div style={{ fontSize: 15, lineHeight: '22px', color: T.ink700 }}>{MSG}</div></div>
          </div>
        )}
        {(mode === 'booked' || working) && <Earn />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ fontSize: 14, fontWeight: 700 }}>{working ? 'Tasks' : 'What the job includes'}</div>{working && <div style={{ fontSize: 13, fontWeight: 600, color: T.ink500 }}>{ticks.filter(Boolean).length}/2 done</div>}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}>
            {JOB.tasks.map((t, i) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 36 }}>
                {working ? <Box on={ticks[i]} f={f} at={i ? K.pTick2 : K.pTick1} tone="provider" size={24} /> : <div style={{ width: 24, display: 'grid', placeItems: 'center' }}><div style={{ width: 6, height: 6, borderRadius: 3, background: T.ink500 }} /></div>}
                <span style={{ fontSize: 15, fontWeight: 500, lineHeight: '20px', color: working && ticks[i] ? T.ink500 : T.ink900, textDecoration: working && ticks[i] ? 'line-through' : undefined }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
        {mode !== 'new' && <Stepper n={mode === 'sent' ? 0 : mode === 'booked' ? 1 : 2} tone="provider" />}
        {(mode === 'booked' || working) && <Person name={C.name} ini={C.ini} sub="Client" msg tone="provider" />}
        {(mode === 'new' || mode === 'sent') && <WhenWhere when={`${JOB.day} · 9:00 AM`} where={JOB.address} sub="1.2 km away" I1={CalendarDays} I2={MapPin} />}
      </div>
      {footer}
      <Tap f={f} at={K.pSendTap} x={205} y={851} />
      <Tap f={f} at={K.pStart} x={205} y={825} />
      <Tap f={f} at={K.pTick1} x={46} y={640} />
      <Tap f={f} at={K.pTick2} x={46} y={688} />
    </div>
  );
};

const Proposal = (f: number) => {
  const p = sp(f, K.pSheet, { damping: 18, stiffness: 190, mass: 0.7 });
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {Detail(f, 'new')}
      <Sheet p={p}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Send a proposal</div><div style={{ fontSize: 14, color: T.ink500, marginTop: 4 }}>For &quot;{JOB.title}&quot;</div></div>
          <div style={{ background: T.well, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[['Job price', peso(JOB.price)], ['Platform fee', `−${peso(JOB.fee)}`], ['You receive', peso(JOB.net)]].map(([k, v], i) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span style={{ color: T.ink700 }}>{k}</span><span style={{ fontWeight: 700, fontSize: i === 2 ? 15 : 14 }}>{v}</span></div>)}
            <div style={{ fontSize: 12.5, color: T.ink500 }}>You receive {peso(JOB.net)} when the client confirms the job is done</div>
          </div>
          <div style={{ background: N.tonal, borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Good proposals mention:</div>
            {['When you can come', "What's included (tools, parts)", "Similar jobs you've done"].map((t) => <div key={t} style={{ fontSize: 13.5, color: T.ink700, marginTop: 4 }}>• {t}</div>)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginBottom: 6 }}>Your message</div>
            <div style={{ minHeight: 88, borderRadius: 12, border: f >= K.pTypeA && f < K.pTypeB + 4 ? `2px solid ${N.link}` : `1px solid ${T.field}`, padding: '12px 14px', fontSize: 15, lineHeight: '21px' }}>{f < K.pTypeA ? <span style={{ color: T.ink500 }}>Hi! I can come on Oct 14 at 2 PM…</span> : typed(f, K.pTypeA, K.pTypeB, MSG)}<Caret f={f} until={K.pTypeB + 4} tone="provider" /></div>
          </div>
          <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500 }}>The client compares proposals and hires one provider. You&apos;ll be notified.</div>
          <Btn f={f} press={K.pSend} tone="provider" label="Send proposal" r={16} style={{ fontWeight: 600 }} />
          <div style={{ height: 40, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, color: T.ink700, marginTop: -6 }}>Cancel</div>
        </div>
      </Sheet>
      <Tap f={f} at={K.pSend} x={205} y={820} />
    </div>
  );
};

// ── Earnings (SPEarningsScreen) ─────────────────────────────────────────────
const Earnings = (f: number) => {
  const got = f >= K.coinLand;
  const add = got ? Math.round(JOB.net * tw(f, K.coinLand, K.coinLand + 16, 0, 1, expoOut)) : 0;
  const glow = got ? Math.max(0.3, hit(f, K.coinLand, 20)) : 0;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="Earnings" y={113} size={19.5} />
      <div style={{ position: 'absolute', top: 166, left: 20, right: 20 }}>
        <div style={{ fontSize: 14, lineHeight: '20px', color: T.ink700 }}>Payouts go to your GCash, Maya or bank account automatically when the client confirms the job is done.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 16 }}>
          {[['Released to you this month', 3250 + add], ['Released to you in total', 18420 + add], ['On its way', 0], ['Platform fees this month', 575 + (got ? JOB.fee : 0)]].map(([l, v]: any, i) => (
            <div key={l} style={{ padding: 14, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, boxShadow: i < 2 && glow ? `0 0 0 ${2 * glow}px ${T.okSolid}` : undefined }}>
              <div style={{ fontSize: 13, lineHeight: '17px', color: T.ink500, minHeight: 34 }}>{l}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, color: i < 2 && hit(f, K.coinLand, 18) > 0.15 ? T.okText : T.ink900, transform: `scale(${1 + (i < 2 ? hit(f, K.coinLand, 6) * 0.12 : 0)})`, transformOrigin: 'left center' }}>{peso(v)}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 26 }}>Released to you</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 16 }}>October 2026</div>
        <div style={{ fontSize: 13, color: T.ink500, marginTop: 2 }}>Released {peso(3250 + add)} · Fees {peso(575 + (got ? JOB.fee : 0))}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {[...(got ? [[JOB.title, 'Oct 20, 2026', JOB.fee, JOB.net, true]] : []), ['Cleaning: Aircon cleaning', 'Oct 12, 2026', 180, 1020, false], ['Plumbing: Unclog drain', 'Oct 9, 2026', 150, 850, false]].map(([t, d, fee, v, isNew]: any) => (
            <div key={t} style={{ padding: 14, borderRadius: 16, border: `1px solid ${isNew ? T.okBorder : T.line}`, background: T.surface, display: 'flex', gap: 10, transform: isNew ? `translateX(${(1 - sp(f, K.coinLand + 2)) * 380}px)` : undefined }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 13, color: T.ink700, marginTop: 4 }}>{d}</div><div style={{ fontSize: 13, color: T.ink500, marginTop: 2 }}>Platform fee −{peso(fee)}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.okText, fontSize: 16, fontWeight: 700, alignSelf: 'flex-start' }}><ArrowDownLeft size={15} />+{peso(v)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Profile (SPProfileScreen) ───────────────────────────────────────────────
const Profile = (f: number) => {
  const up = f >= K.starLand;
  const flash = hit(f, K.starLand, 18) > 0.15;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 96, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Avatar ini={P.ini} size={96} tone="provider" fs={32} />
          <div style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, background: N.primary, border: `2px solid ${T.canvas}`, display: 'grid', placeItems: 'center' }}><Camera size={14} color={T.white} /></div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, marginTop: 14 }}>{P.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 14, color: T.ink500 }}>Plumbing · Cleaning</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: T.okSurface, border: `1px solid ${T.okBorder}`, color: T.okText, fontSize: 12, fontWeight: 700 }}><ShieldCheck size={12} /> Verified</span>
        </div>
        <div style={{ marginTop: 14, padding: '10px 18px', borderRadius: 999, background: N.tonal, fontSize: 14, fontWeight: 600 }}>Edit profile</div>
      </div>
      <div style={{ position: 'absolute', top: 334, left: 20, right: 20, display: 'flex', padding: '14px 0', borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}>
        {[['Jobs done', up ? '39' : '38'], ['Rating', up ? '4.9' : '4.8'], ['Active', up ? '0' : '1']].map(([l, v], i) => (
          <div key={l} style={{ flex: 1, textAlign: 'center', borderLeft: i ? `1px solid ${T.line}` : undefined }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: flash && i < 2 ? T.okText : T.ink900, transform: `scale(${1 + (i < 2 ? hit(f, K.starLand, 6) * 0.3 : 0)})` }}>{v}</div>
            <div style={{ fontSize: 13, color: T.ink500, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 436, left: 24, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: T.ink500 }}>YOUR WORK</div>
      <div style={{ position: 'absolute', top: 460, left: 20, right: 20, padding: '0 14px', borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}>
        {[['Get verified', ShieldCheck], ['My services', Wrench], ['Portfolio', Images], ['Certifications', Award], ['Payout account', Landmark], ['Earnings', TrendingUp]].map(([l, I]: any, i) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, borderTop: i ? `1px solid ${T.line}` : undefined }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center' }}><I size={17} color={T.ink700} /></div>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{l}</div>
            <ChevronRight size={18} color={T.ink500} />
          </div>
        ))}
      </div>
      <TabBar tone="provider" active={3} />
    </div>
  );
};

export const ProviderPhone: React.FC<{ f: number }> = ({ f }) => (
  <>
    <Screens
      f={f}
      list={bg([
        { at: 0, render: FeedSetup },
        { at: K.pStep1, render: V1 },
        { at: K.pStep2, render: V2 },
        { at: K.pStep3, render: V3 },
        { at: K.pStep4, render: V4 },
        { at: K.pStep5, render: V5 },
        { at: K.pPending, render: Pending, kind: 'fade' },
        { at: K.pFeed, render: Feed, kind: 'fade' },
        { at: K.pDetail, render: (g) => Detail(g, 'new') },
        { at: K.pSheet, render: Proposal, kind: 'none' },
        { at: K.pSent, render: (g) => Detail(g, 'sent'), kind: 'fade' },
        { at: K.pBooked, render: (g) => Detail(g, 'booked'), kind: 'fade' },
        { at: K.chat, render: (g) => ChatScreen(g, 'p') },
        { at: K.work, render: (g) => Detail(g, 'working') },
        { at: K.paid + 2, render: Earnings },
        { at: K.review, render: Profile, kind: 'up' },
      ])}
    />
    <Notice f={f} at={K.pVerified} out={K.pVerified + 26} title="You are verified" body="Your ID and certificate were approved." />
    <Notice f={f} at={K.pBooked} out={K.pBooked + 34} title="Booking confirmed" body={`You were hired for "${JOB.title}". Open the job to start work when you are ready.`} />
    <Notice f={f} at={K.starLand} out={K.starLand + 34} title="You received a review" body={`${C.name} rated your work on "${JOB.title}" 5 out of 5.`} />
    <StatusBar />
  </>
);

