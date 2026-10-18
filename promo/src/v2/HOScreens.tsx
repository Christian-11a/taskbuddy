import React from 'react';
import {
  ArrowLeft, Bell, BrushCleaning, Calendar, Check, ChevronRight, Clock, Hammer, LockKeyhole, MapPin, Palette, Send, ShieldCheck, Sparkles, Star, Wrench, BadgeCheck, Banknote,
} from 'lucide-react';
import { A, Avatar, Btn, Card, Caret, HONav, Pill, Screens, StatusBar, Tap, expoOut, hit, pop, sp, tw, typedRange } from './kit';
import { HOMEOWNER as H, JOB, PROVIDER as P } from './timeline';
import { peso } from '../components/ui';
import { countUp } from '../components/ui';

const TopBar: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <div style={{ position: 'absolute', top: 44, left: 0, right: 0, height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', background: A.white, borderBottom: `1px solid ${A.hairline}`, zIndex: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 11, background: A.well, display: 'grid', placeItems: 'center' }}><ArrowLeft size={19} color={A.ink700} /></div>
    <div style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>{title}</div>
    {right}
  </div>
);

const Steps: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ display: 'flex', gap: 5, padding: '0 20px', marginTop: 108 }}>
    {[0, 1, 2, 3, 4].map((i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= n ? A.cyan600 : A.ink100 }} />)}
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; active?: boolean; h?: number }> = ({ label, children, active, h = 46 }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: A.ink700, marginBottom: 6 }}>{label}</div>
    <div style={{ minHeight: h, borderRadius: 12, border: `1.5px solid ${active ? A.cyan600 : '#dce3e9'}`, background: A.white, padding: '12px 14px', fontSize: 14.5, fontWeight: 600, boxShadow: active ? '0 0 0 4px rgba(8,145,178,0.1)' : undefined }}>{children}</div>
  </div>
);

export const JobCardUI: React.FC<{ status?: { label: string; color: string; bg: string }; urgent?: boolean; foot?: string; glow?: number; price?: string; title?: string; addr?: string }> = ({ status, urgent, foot, glow = 0, price, title = JOB.title, addr = JOB.address }) => (
  <Card style={{ boxShadow: glow ? `0 0 0 ${2 + glow * 3}px rgba(6,182,212,${0.6 * glow + 0.2}), 0 10px 26px rgba(8,145,178,${0.3 * glow})` : undefined }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
      <div style={{ fontSize: 15.5, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{price ?? peso(JOB.budget)}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: A.ink400, fontSize: 12.5, marginBottom: 10 }}><MapPin size={14} /> {addr}</div>
    <div style={{ display: 'flex', gap: 6, marginBottom: foot ? 11 : 0 }}>
      {status && <Pill {...status} dot />}
      {urgent && <Pill label="Urgent" color="#B91C1C" bg="#FEF2F2" />}
      <Pill label={JOB.service} color={A.cyan700} bg={A.cyan50} />
    </div>
    {foot && <div style={{ borderTop: `1px solid ${A.hairline}`, paddingTop: 10, display: 'flex', alignItems: 'center', gap: 5, color: A.ink500, fontSize: 12.5, fontWeight: 600 }}><Clock size={13} /> {foot}</div>}
  </Card>
);

// ── Screens ─────────────────────────────────────────────────────────────────
const Home = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <div style={{ background: A.hoHero, padding: '58px 20px 20px', borderRadius: '0 0 26px 26px', color: A.white }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ color: A.cyan100, fontSize: 14.5, fontWeight: 500 }}>Good morning</div>
          <div style={{ fontSize: 24.5, fontWeight: 800, marginTop: 3 }}>{H.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.12)', display: 'grid', placeItems: 'center' }}><Bell size={20} /></div>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.16)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14.5 }}>{H.ini}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 13, background: 'rgba(255,255,255,0.11)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14 }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13.5 }}>Wallet balance</div>
          <div style={{ fontSize: 21.5, fontWeight: 800 }}>{peso(2500)}</div>
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>Manage wallet</div>
      </div>
    </div>
    <div style={{ padding: '18px 20px' }}>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 11 }}>Find a service</div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 22 }}>
        {[{ l: 'Plumbing', I: Wrench }, { l: 'Cleaning', I: BrushCleaning }, { l: 'Handyman', I: Hammer }, { l: 'Manicure', I: Sparkles }].map(({ l, I }) => (
          <div key={l} style={{ width: 76, padding: '12px 0', borderRadius: 16, background: A.white, border: `1px solid ${A.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: A.well, display: 'grid', placeItems: 'center' }}><I size={19} color={A.cyan700} /></div>
            <div style={{ fontSize: 11.5, fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 11 }}>Active Jobs</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: A.white, border: `1px solid ${A.cyan100}`, borderRadius: 17, padding: 17 }}>
        <div style={{ width: 42, height: 42, borderRadius: 14, border: `1px solid ${A.cyan100}`, display: 'grid', placeItems: 'center' }}><Sparkles size={22} color={A.cyan700} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16.5, fontWeight: 800, marginBottom: 3 }}>Need something done?</div>
          <div style={{ fontSize: 13, color: A.ink500, lineHeight: '16px' }}>Post a task and connect with a nearby verified provider.</div>
        </div>
        <div style={{ background: A.cyan700, color: A.white, borderRadius: 13, padding: '10px 12px', fontSize: 14.5, fontWeight: 700 }}>+ Post</div>
      </div>
    </div>
    <HONav active={0} press={hit(f, 434, 3)} />
    <Tap f={f} at={434} x={180} y={740} />
  </div>
);

const SERVICES = [
  { l: 'Plumbing', I: Wrench }, { l: 'Cleaning', I: BrushCleaning }, { l: 'Handyman', I: Hammer }, { l: 'Manicure', I: Sparkles }, { l: 'Pedicure', I: Palette },
];
const Step1 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
    <TopBar title="Post a Job" />
    <Steps n={0} />
    <div style={{ padding: '20px 20px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, marginBottom: 16 }}>What service do you need?</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
        {SERVICES.map(({ l, I }, i) => {
          const sel = i === 0 && f >= 470;
          return (
            <div key={l} style={{ height: 96, borderRadius: 16, background: sel ? A.cyan50 : A.white, border: `1.5px solid ${sel ? A.cyan600 : A.line}`, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: `scale(${pop(f, 446 + i * 3) * (1 + (i === 0 ? hit(f, 470, 4) * 0.06 : 0))})` }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: sel ? A.cyan600 : A.well, display: 'grid', placeItems: 'center' }}><I size={20} color={sel ? A.white : A.cyan700} /></div>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>{l}</div>
            </div>
          );
        })}
      </div>
    </div>
    <Tap f={f} at={470} x={95} y={225} />
  </div>
);

const Step2 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
    <TopBar title="Post a Job" />
    <Steps n={1} />
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, marginBottom: 16 }}>What Needs Doing</div>
      <Field label="Job Title" active={f < 508}>{typedRange(f, 488, 506, JOB.title)}<Caret f={f} until={508} /></Field>
      <Field label="Description" active={f >= 508} h={96}>
        <span style={{ fontWeight: 500, color: A.ink700 }}>{typedRange(f, 510, 526, 'Water is leaking under the sink cabinet.')}</span>
      </Field>
      <Btn f={f} press={528} label="Next" style={{ marginTop: 18 }} />
    </div>
    <Tap f={f} at={528} x={180} y={430} />
  </div>
);

const Step3 = (f: number) => {
  const pin = tw(f, 544, 552, 1, 0, (t) => t * t);
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <TopBar title="Post a Job" />
      <Steps n={2} />
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, marginBottom: 16 }}>Where does the work need to happen?</div>
        <Field label="Address"><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><MapPin size={16} color={A.cyan700} />{typedRange(f, 538, 548, JOB.address)}</span></Field>
        <div style={{ height: 190, borderRadius: 16, overflow: 'hidden', position: 'relative', background: '#e3f3f8', border: `1px solid ${A.line}` }}>
          {[40, 120, 210, 290].map((x, i) => <div key={i} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: i % 2 ? 10 : 16, background: A.white }} />)}
          {[50, 110, 160].map((y, i) => <div key={i} style={{ position: 'absolute', top: y, left: 0, right: 0, height: i % 2 ? 16 : 10, background: A.white }} />)}
          <div style={{ position: 'absolute', left: 160, top: 60 - pin * 120, transform: `scale(${1 + hit(f, 552, 3) * 0.3}, ${1 - hit(f, 552, 3) * 0.25})`, transformOrigin: '50% 100%' }}>
            <MapPin size={40} color={A.white} fill={A.cyan700} />
          </div>
        </div>
        <div style={{ marginTop: 12, transform: `scale(${pop(f, 556)})`, transformOrigin: 'left center' }}>
          <Pill label="Location confirmed" color={A.green600} bg="#dcfce7" dot size={12.5} />
        </div>
        <Btn f={f} press={568} label="Next" style={{ marginTop: 18 }} />
      </div>
      <Tap f={f} at={568} x={180} y={528} />
    </div>
  );
};

const Step4 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
    <TopBar title="Post a Job" />
    <Steps n={3} />
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, marginBottom: 14 }}>How Soon?</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['Flexible', 'Normal', 'Urgent'].map((l, i) => {
          const sel = i === 2 && f >= 584;
          return <div key={l} style={{ flex: 1, textAlign: 'center', padding: '11px 0', borderRadius: 12, fontSize: 14, fontWeight: 800, border: `1.5px solid ${sel ? '#B91C1C' : A.line}`, background: sel ? '#FEF2F2' : A.white, color: sel ? '#B91C1C' : A.ink700, transform: `scale(${1 + (i === 2 ? hit(f, 584, 4) * 0.08 : 0)})` }}>{l}</div>;
        })}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Preferred Date"><span style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Calendar size={15} color={A.cyan700} />Tomorrow</span></Field></div>
        <div style={{ flex: 1 }}><Field label="Preferred Time"><span style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Clock size={15} color={A.cyan700} />9:00 AM</span></Field></div>
      </div>
      <Field label="Budget" active={f >= 588 && f < 600}><span style={{ fontSize: 20, fontWeight: 800 }}>{peso(countUp(f, 588, 600, JOB.budget))}</span></Field>
      <Btn f={f} press={604} label="Next" style={{ marginTop: 10 }} />
    </div>
    <Tap f={f} at={584} x={300} y={205} />
    <Tap f={f} at={604} x={180} y={500} />
  </div>
);

const Step5 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
    <TopBar title="Review & Post" />
    <Steps n={4} />
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 13.5, color: A.ink500, fontWeight: 600, marginBottom: 12 }}>Check everything before posting</div>
      <Card>
        {[
          ['Service', JOB.service], ['Job Title', JOB.title], ['Location', JOB.address], ['Schedule', 'Tomorrow · 9:00 AM'], ['Urgency', 'Urgent'], ['Budget', peso(JOB.budget)],
        ].map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: i ? `1px solid ${A.hairline}` : undefined, fontSize: 13.5 }}>
            <span style={{ color: A.ink500, fontWeight: 600 }}>{k}</span><span style={{ fontWeight: 800, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </Card>
      <Btn f={f} press={624} label="Post Job" style={{ marginTop: 18 }} />
    </div>
    <Tap f={f} at={624} x={180} y={480} />
  </div>
);

export const Posted = (f: number, cardHidden = false) => (
  <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
    <div style={{ padding: '90px 24px 0', textAlign: 'center' }}>
      <div style={{ width: 92, height: 92, borderRadius: 92, margin: '0 auto', background: A.green500, display: 'grid', placeItems: 'center', transform: `scale(${pop(f, 630)})`, boxShadow: `0 0 0 ${14 * tw(f, 630, 650, 0, 1, expoOut)}px rgba(34,197,94,0.15)` }}>
        <Check size={50} color={A.white} strokeWidth={3} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 20, opacity: tw(f, 633, 640) }}>Job Posted!</div>
      <div style={{ fontSize: 14, color: A.ink500, marginTop: 6, opacity: tw(f, 636, 644) }}>Nearby verified providers can now send proposals.</div>
    </div>
    <div style={{ padding: '26px 20px 0', opacity: cardHidden ? 0 : 1 }}>
      <div style={{ transform: `translateY(${(1 - sp(f, 636)) * 60}px)` }}><JobCardUI status={{ label: 'Open', color: '#F59E0B', bg: '#FFF7ED' }} urgent /></div>
    </div>
    <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Btn f={f} label="View My Jobs" />
      <Btn f={f} label="Post Another Job" bg={A.white} color={A.cyan700} style={{ border: `1.5px solid ${A.cyan100}` }} />
    </div>
  </div>
);

const JobDetail = (f: number, mode: 'offers' | 'awaiting' | 'progress') => {
  const offers = f < 905 ? 0 : f < 912 ? 1 : f < 918 ? 2 : 3;
  const confirmed = f >= 1096;
  const doneAsk = f >= 1305;
  const status = mode === 'offers'
    ? { label: 'Open', color: '#F59E0B', bg: '#FFF7ED' }
    : mode === 'awaiting'
      ? confirmed ? { label: 'Confirmed', color: '#3B82F6', bg: '#EFF6FF' } : { label: 'Awaiting Provider', color: '#F59E0B', bg: '#FFF7ED' }
      : { label: 'In Progress', color: '#22C55E', bg: '#F0FDF4' };
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <TopBar title="Job Details" />
      <div style={{ padding: '112px 20px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>{JOB.title}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, transform: `scale(${1 + hit(f, 1096, 5) * 0.12})`, transformOrigin: 'left center' }}>
          <Pill {...status} dot size={12.5} /><Pill label="Urgent" color="#B91C1C" bg="#FEF2F2" size={12.5} />
        </div>
        <Card style={{ marginTop: 16 }}>
          {[[MapPin, JOB.address], [Calendar, 'Tomorrow · 9:00 AM'], [Banknote, peso(mode === 'offers' ? JOB.budget : JOB.offer)]].map(([I, t]: any, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', fontSize: 14, fontWeight: 600 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: A.well, display: 'grid', placeItems: 'center' }}><I size={16} color={A.cyan700} /></div>{t}
            </div>
          ))}
        </Card>
        {mode === 'offers' && (
          <div style={{ marginTop: 16, position: 'relative' }}>
            <Btn f={f} label={<>View Offers <span style={{ minWidth: 26, height: 26, borderRadius: 13, background: A.white, color: A.cyan700, display: 'inline-grid', placeItems: 'center', fontSize: 14, transform: `scale(${offers ? 1 + hits3(f) * 0.5 : 0})` }}>{offers}</span></>} press={922} />
            <div style={{ fontSize: 13, color: A.ink500, fontWeight: 600, textAlign: 'center', marginTop: 10 }}>{offers ? `${offers} provider${offers > 1 ? 's' : ''} sent a proposal` : 'Finding providers near you…'}</div>
          </div>
        )}
        {mode !== 'offers' && (
          <Card style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, color: A.ink500, fontWeight: 700, marginBottom: 10 }}>Hired Provider</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar ini={P.ini} size={42} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', gap: 5, alignItems: 'center' }}>{P.name} <BadgeCheck size={16} color={A.cyan600} /></div>
                <div style={{ fontSize: 12.5, color: A.ink500, display: 'flex', gap: 4, alignItems: 'center' }}><Star size={12} color={A.amber500} fill={A.amber500} /> 4.8 · 38 jobs</div>
              </div>
            </div>
          </Card>
        )}
        {mode === 'progress' && doneAsk && (
          <div style={{ marginTop: 14, transform: `translateY(${(1 - sp(f, 1305)) * 200}px)` }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: 13, fontSize: 13.5, fontWeight: 700, color: A.green600, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}><Check size={16} /> {P.first} marked the job as done</div>
            <Btn f={f} press={1330} label="Confirm Completion" bg={A.green500} />
          </div>
        )}
      </div>
      <Tap f={f} at={922} x={180} y={392} />
      <Tap f={f} at={1330} x={180} y={528} />
    </div>
  );
};
const hits3 = (f: number) => Math.max(hit(f, 905, 4), hit(f, 912, 4), hit(f, 918, 4));

const PROPOSALS = [
  { ...P, rating: '4.8', jobs: 38, offer: JOB.offer, bg: A.cyan700, msg: 'Hi! I can fix this tomorrow at 9 AM. I will bring the parts.' },
  { name: 'Juan Dela Cruz', ini: 'JD', rating: '4.6', jobs: 21, offer: 1300, bg: A.amber500, msg: 'Available tomorrow afternoon.' },
  { name: 'Rico Bautista', ini: 'RB', rating: '4.7', jobs: 27, offer: 1600, bg: A.purple, msg: 'Licensed plumber, 10 years.' },
];
const Proposals = (f: number) => (
  <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
    <TopBar title="Proposals" />
    <div style={{ padding: '108px 20px 0' }}>
      <div style={{ fontSize: 13.5, color: A.ink500, fontWeight: 700, marginBottom: 12 }}>3 providers applied</div>
      {PROPOSALS.map((p, i) => (
        <div key={p.name} style={{ marginBottom: 10, transform: `translateY(${(1 - sp(f, 928 + i * 5)) * 400}px)` }}>
          <Card style={{ boxShadow: i === 0 && f >= 985 ? `0 0 0 3px ${A.cyan500}` : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar ini={p.ini} size={42} bg={p.bg} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', gap: 5, alignItems: 'center' }}>{p.name} <BadgeCheck size={16} color={A.cyan600} /></div>
                <div style={{ fontSize: 12.5, color: A.ink500, display: 'flex', gap: 4, alignItems: 'center' }}><Star size={12} color={A.amber500} fill={A.amber500} /> {p.rating} · {p.jobs} jobs</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{peso(p.offer)}</div>
            </div>
            {i === 0 && (
              <>
                <div style={{ background: A.ink25, borderRadius: 11, padding: 11, margin: '11px 0', fontSize: 13, color: A.ink700, lineHeight: '17px' }}>{p.msg}</div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <Btn f={f} label="Reject" bg={A.white} color={A.ink700} h={40} style={{ flex: 1, border: `1.5px solid ${A.line}` }} />
                  <Btn f={f} press={985} label="Hire" h={40} style={{ flex: 1 }} />
                </div>
              </>
            )}
          </Card>
        </div>
      ))}
    </div>
    <Tap f={f} at={985} x={250} y={300} />
  </div>
);

const HireModal = (f: number) => {
  const s = sp(f, 990, { damping: 18, stiffness: 200, mass: 0.7 });
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {Proposals(f)}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(15,23,42,${0.45 * s})` }} />
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 24, background: A.white, borderRadius: 24, padding: 22, transform: `translateY(${(1 - s) * 420}px)` }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: A.cyan50, display: 'grid', placeItems: 'center', marginBottom: 14 }}><ShieldCheck size={26} color={A.cyan700} /></div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Hire this provider?</div>
        <div style={{ fontSize: 13.5, color: A.ink500, marginTop: 6, lineHeight: '19px' }}>{P.name} will be asked to confirm the booking. {peso(JOB.offer)} is held in escrow until the job is done.</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <Btn f={f} label="Cancel" bg={A.white} color={A.ink700} style={{ flex: 1, border: `1.5px solid ${A.line}` }} />
          <Btn f={f} press={1012} label="Hire" style={{ flex: 1 }} />
        </div>
      </div>
      <Tap f={f} at={1012} x={265} y={712} />
    </div>
  );
};

// ── Chat (shared by both phones) ────────────────────────────────────────────
export const CHAT = [
  { at: 1152, from: 'ho', t: `Hi ${P.first}! Can you come tomorrow at 9?` },
  { at: 1182, from: 'sp', t: "Yes! I'll bring the parts. See you!" },
  { at: 1212, from: 'ho', t: 'Perfect, thank you!' },
];
export const Chat = (f: number, me: 'ho' | 'sp') => {
  const other = me === 'ho' ? P : H;
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <div style={{ position: 'absolute', top: 44, left: 0, right: 0, height: 60, display: 'flex', alignItems: 'center', gap: 11, padding: '0 16px', background: A.white, borderBottom: `1px solid ${A.hairline}` }}>
        <ArrowLeft size={19} color={A.ink700} />
        <Avatar ini={other.ini} size={36} bg={me === 'ho' ? A.cyan700 : A.amber500} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{other.name}</div>
          <div style={{ fontSize: 11.5, color: A.green600, fontWeight: 700 }}>{JOB.title}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 120, left: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CHAT.map((m, i) => {
          const mine = m.from === me;
          const at = mine ? m.at : m.at + 8;
          if (f < at) return null;
          const p = sp(f, at, { damping: 13, stiffness: 240, mass: 0.6 });
          return (
            <div key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: 250, padding: '11px 14px', borderRadius: 18, [mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 5, background: mine ? A.cyan700 : A.white, color: mine ? A.white : A.ink900, border: mine ? undefined : `1px solid ${A.line}`, fontSize: 14, fontWeight: 600, lineHeight: '19px', transform: `scale(${p})`, transformOrigin: mine ? '100% 100%' : '0% 100%' }}>
              {m.t}
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 22, height: 48, borderRadius: 24, background: A.white, border: `1px solid ${A.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 0 18px', color: A.ink300, fontSize: 14 }}>
        Message…
        <div style={{ width: 38, height: 38, borderRadius: 19, background: A.cyan700, display: 'grid', placeItems: 'center' }}><Send size={17} color={A.white} /></div>
      </div>
    </div>
  );
};

const WalletScr = (f: number) => {
  const released = f >= 1372;
  const esc = released ? Math.round(JOB.offer * (1 - tw(f, 1372, 1390))) : JOB.offer;
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <div style={{ background: `linear-gradient(160deg, ${A.cyan600}, ${A.cyan700})`, padding: '60px 20px 22px', borderRadius: '0 0 26px 26px', color: A.white }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Wallet</div>
        <div style={{ fontSize: 13.5, opacity: 0.8 }}>Available Balance</div>
        <div style={{ fontSize: 32, fontWeight: 800 }}>{peso(1050)}</div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ background: '#f5fbfc', border: '1px solid #d5eef3', borderRadius: 17, padding: 16, transform: `scale(${1 + hit(f, 1372, 5) * 0.05})` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: released ? A.green500 : A.cyan700, display: 'grid', placeItems: 'center' }}>
              {released ? <Check size={22} color={A.white} strokeWidth={3} /> : <LockKeyhole size={20} color={A.white} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1, color: released ? A.green600 : A.cyan700 }}>{released ? 'RELEASED' : 'IN ESCROW'}</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{peso(esc)}</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: A.ink500, marginTop: 10 }}>{released ? `Paid to ${P.name}.` : 'Funds held securely until you approve completed work.'}</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, margin: '20px 0 10px' }}>Transaction History</div>
        {released && (
          <div style={{ transform: `translateX(${(1 - sp(f, 1380)) * 360}px)` }}>
            <Card style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: A.well, display: 'grid', placeItems: 'center' }}><Send size={17} color={A.cyan700} /></div>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Payment released<div style={{ fontSize: 12, color: A.ink500, fontWeight: 600 }}>{JOB.title}</div></div>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>−{peso(JOB.offer)}</div>
            </Card>
          </div>
        )}
      </div>
      <HONav active={4} />
    </div>
  );
};

export const STARS = [1440, 1455, 1470, 1485, 1500];
const Review = (f: number) => (
  <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
    <TopBar title="Rate Your Provider" />
    <div style={{ padding: '120px 22px 0', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar ini={P.ini} size={72} /></div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 12 }}>{P.name}</div>
      <div style={{ fontSize: 14, color: A.ink500, marginTop: 4 }}>How was your experience?</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }}>
        {STARS.map((at, i) => {
          const on = f >= at;
          return <div key={i} style={{ transform: `scale(${on ? 1 + hit(f, at, 4) * 0.45 : 1}) rotate(${on ? hit(f, at, 5) * 20 : 0}deg)` }}><Star size={40} color={on ? A.amber500 : A.ink200} fill={on ? A.amber500 : 'none'} strokeWidth={1.8} /></div>;
        })}
      </div>
      <div style={{ textAlign: 'left', marginTop: 22 }}>
        <Field label="Write a review" h={90}><span style={{ fontWeight: 500, color: A.ink700 }}>{typedRange(f, 1502, 1526, 'Fast, clean and friendly. Highly recommended!')}</span></Field>
      </div>
      <Btn f={f} press={1536} label={f >= 1538 ? <><Check size={18} strokeWidth={3} /> Review submitted</> : 'Submit Review'} bg={f >= 1538 ? A.green500 : A.cyan700} />
    </div>
    <Tap f={f} at={1536} x={180} y={475} />
  </div>
);

export const HOPhoneContent: React.FC<{ f: number }> = ({ f }) => (
  <>
    <Screens
      f={f}
      list={[
        { at: 0, render: Home },
        { at: 440, render: Step1, kind: 'up' },
        { at: 482, render: Step2 },
        { at: 534, render: Step3 },
        { at: 574, render: Step4 },
        { at: 610, render: Step5 },
        { at: 628, render: (g) => Posted(g, g >= 645), kind: 'fade' },
        { at: 850, render: (g) => JobDetail(g, 'offers'), kind: 'none' },
        { at: 926, render: Proposals },
        { at: 990, render: HireModal, kind: 'none' },
        { at: 1020, render: (g) => JobDetail(g, 'awaiting'), kind: 'fade' },
        { at: 1144, render: (g) => Chat(g, 'ho') },
        { at: 1262, render: (g) => JobDetail(g, 'progress') },
        { at: 1340, render: WalletScr },
        { at: 1440, render: Review, kind: 'up' },
      ]}
    />
    <StatusBar light={f < 440 || (f >= 1340 && f < 1440)} />
  </>
);
