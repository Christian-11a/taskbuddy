import React from 'react';
import {
  ArrowLeft, Bell, BriefcaseBusiness, CalendarClock, CalendarDays, Camera, Check, ChevronRight, CircleCheck, CircleHelp, CircleX, CreditCard, Eye, FileText,
  Hourglass, ImagePlus, Landmark, Mail, MapPin, Moon, Lock, Globe, Trash2, Phone as PhoneIcon, Plus, Settings, Smartphone, TriangleAlert, Wrench,
} from 'lucide-react';
import { Tap, TapGate, pop } from '../v2/kit';
import { hit, inOut, sp, tw } from '../motion';
import { AppBar, Avatar, Box, Btn, Caret, Footer, Person, Pill, Radio, Section, Sheet, Status, StatusBar, Stepper, T, TabBar, WhenWhere, pal, type Tone } from '../hero/ui';
import { ClientPhone } from '../hero/ClientPhone';
import { ProviderPhone, Detail as ProDetail } from '../hero/ProviderPhone';
import { CLIENT as C, JOB, K, PRO as P } from '../hero/story';
import { Dialog } from './screens';
import { peso } from '../components/ui';

// More screens for the guides, from the mobile code (labels and layout as in the app).
// Every screen is (f, dur) => node; times are fractions of dur so they fit any narration length.
type Screen = (f: number, dur: number) => React.ReactNode;
const at = (dur: number, x: number) => Math.round(dur * x);
const typed = (f: number, a: number, b: number, s: string) => s.slice(0, Math.max(0, Math.floor(tw(f, a, b, 0, s.length, (t) => t))));
const wrap = (n: React.ReactNode) => <div style={{ position: 'absolute', inset: 0, background: T.canvas }}>{n}<StatusBar /></div>;

// Provider booked job, after the Booking confirmed banner has gone; the Start job tap belongs to another guide
const QuietBooked: React.FC = () => <TapGate.Provider value={{ min: -Infinity, max: Infinity, o: 0 }}><ProviderPhone f={K.pBooked + 48} /></TapGate.Provider>;

// ── shared pieces ──────────────────────────────────────────────────────────
const DateBlock: React.FC<{ d: string; n: string; tone?: Tone; none?: boolean }> = ({ d, n, tone = 'client', none }) => {
  const p = pal(tone);
  return none
    ? <div style={{ width: 46, height: 48, borderRadius: 12, background: T.warnSurface, border: `1.5px dashed ${T.warnBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: T.warnText }}>NO<br />DATE</div>
    : <div style={{ width: 46, height: 48, borderRadius: 12, background: p.tonal, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: p.link }}>{d}</div><div style={{ fontSize: 18, fontWeight: 700, lineHeight: '20px', color: p.deep }}>{n}</div></div>;
};
const Row: React.FC<{ d: string; n: string; t: string; meta: string; dot: string; amt: string; tone?: Tone; glow?: number; none?: boolean }> = ({ d, n, t, meta, dot, amt, tone = 'client', glow = 0, none }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: T.surface, boxShadow: glow ? `0 0 0 ${2 + glow * 3}px rgba(3,105,161,${0.25 + glow * 0.5})` : '0 1px 3px rgba(15,23,42,0.12)' }}>
    <DateBlock d={d} n={n} tone={tone} none={none} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>{t}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 7, height: 7, borderRadius: 4, background: dot }} /><div style={{ flex: 1, fontSize: 13, color: T.ink500 }}>{meta}</div><div style={{ fontSize: 15, fontWeight: 600 }}>{amt}</div></div>
    </div>
  </div>
);
const Group: React.FC<{ label: string }> = ({ label }) => <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: T.ink500, margin: '14px 0 8px' }}>{label}</div>;
const Menu: React.FC<{ p: number; title: string; items: { l: string; I: React.ComponentType<any>; danger?: boolean; hint?: string }[]; press?: number; f: number; pick?: number }> = ({ p, title, items, f, press = -99, pick = -1 }) => (
  <Sheet p={p}>
    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, padding: '4px 0' }}>{title}</div>
    {items.map((it, i) => (
      <div key={it.l} style={{ borderRadius: 12, background: i === pick && f >= press ? T.ink50 : 'transparent' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 52, color: it.danger ? T.danger : T.ink900 }}><it.I size={20} /><span style={{ fontSize: 15, fontWeight: 500 }}>{it.l}</span></div>
        {it.hint && <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500, paddingLeft: 34, paddingBottom: 10 }}>{it.hint}</div>}
      </div>
    ))}
  </Sheet>
);
const Field: React.FC<{ label: string; value: string; ph: string; on?: boolean; h?: number; tone?: Tone; f?: number; until?: number }> = ({ label, value, ph, on, h = 48, tone = 'client', f = 0, until = 0 }) => (
  <div>
    <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginBottom: 6 }}>{label}</div>
    <div style={{ minHeight: h, borderRadius: 12, border: on ? `2px solid ${pal(tone).link}` : `1px solid ${T.field}`, background: T.surface, padding: '12px 14px', fontSize: 15, lineHeight: '21px', color: value ? T.ink900 : T.ink500 }}>{value || ph}{on && <Caret f={f} until={until} tone={tone} />}</div>
  </div>
);

// ── Client: Home and My Jobs ───────────────────────────────────────────────
const homeTour: Screen = (f) => <ClientPhone f={Math.min(90, f * 0.6)} />;
const MyJobs = (f: number, dur: number, filter: number, tap = true) => {
  const pills = [['All', 4], ['Needs you', 1], ['Booked', 1], ['Waiting', 1]] as const;
  return wrap(
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 92, left: 20, right: 20, display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 22, fontWeight: 800 }}>My Jobs</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15, fontWeight: 600, color: T.sky, marginRight: 12 }}><Plus size={16} /> New</div>
        <div style={{ display: 'flex', padding: 3, borderRadius: 999, background: T.ink50 }}><div style={{ padding: '6px 12px', borderRadius: 999, background: T.surface, fontSize: 13, fontWeight: 600 }}>List</div><div style={{ padding: '6px 12px', fontSize: 13, fontWeight: 600, color: T.ink500 }}>Calendar</div></div>
      </div>
      <div style={{ position: 'absolute', top: 146, left: 20, display: 'flex', gap: 8 }}>{pills.map(([l, c], i) => <Pill key={l} label={l} count={c} on={i === filter} scale={1 + (i === filter && filter > 0 ? hit(f, at(dur, 0.35), 4) * 0.08 : 0)} />)}</div>
      <div style={{ position: 'absolute', top: 196, left: 20, right: 20 }}>
        {(filter === 0 || filter === 1) && <><Group label="NEEDS YOU" /><Row d="TUE" n="20" t={JOB.title} meta="1 proposal waiting" dot="#D97706" amt={peso(JOB.price)} glow={filter === 1 ? Math.max(0.3, hit(f, at(dur, 0.35), 20)) : 0} /></>}
        {filter === 0 && <><Group label="THIS WEEK" /><Row d="THU" n="22" t="Cleaning: Deep clean condo" meta="Booked · Mark Santos" dot={T.okText} amt={peso(1800)} /><Group label="WAITING" /><Row d="SAT" n="24" t="Handyman: Install shelves" meta="Waiting for proposals" dot={T.sky} amt={peso(900)} /><Group label="FINISHED" /><Row d="MON" n="12" t="Plumbing: Unclog drain" meta="Done" dot={T.ink500} amt={peso(850)} /></>}
      </div>
      <TabBar tone="client" active={1} />
      {tap && <Tap f={f} at={at(dur, 0.35)} x={150} y={164} />}
    </div>,
  );
};
const myJobs: Screen = (f, dur) => MyJobs(f, dur, f >= at(dur, 0.35) ? 1 : 0);
// Home → tap the My Jobs tab → the full list (tabs switch instantly, like the app)
const myJobsOpen: Screen = (f, dur) => {
  const t = at(dur, 0.22);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {f < t + 3 ? <ClientPhone f={90} /> : MyJobs(f, dur, 0, false)}
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={t} x={154} y={828} /></div>
    </div>
  );
};

// ── Client: chat and change the date or time ───────────────────────────────
const openChat: Screen = (f, dur) => <ClientPhone f={K.chat - 30 + Math.min(1, f / dur) * 120} />;
const ChangeSheet = (f: number, dur: number, tone: Tone) => {
  const p = sp(f, 4, { damping: 18, stiffness: 190, mass: 0.7 });
  const d1 = at(dur, 0.25), d2 = at(dur, 0.4), r1 = at(dur, 0.5), r2 = at(dur, 0.75), send = at(dur, 0.86);
  return (
    <Sheet p={p}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Change date or time</div>
        <div style={{ background: T.ink50, borderRadius: 12, padding: '10px 12px' }}><div style={{ fontSize: 12, color: T.ink500 }}>Current schedule</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>Tue, Oct 20, 9:00 AM</div></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="New date" value={f >= d1 ? 'Wed, Oct 21' : ''} ph="Pick a date" tone={tone} on={f >= d1 - 4 && f < d1 + 6} /></div>
          <div style={{ flex: 1 }}><Field label="New time" value={f >= d2 ? '2:00 PM' : ''} ph="Pick a time" tone={tone} on={f >= d2 - 4 && f < d2 + 6} /></div>
        </div>
        <Field label="Reason" value={typed(f, r1, r2, tone === 'client' ? 'I have a family event in the morning.' : 'My earlier job runs late.')} ph="Why do you need a different time?" h={84} tone={tone} on={f >= r1 && f < r2 + 6} f={f} until={r2 + 6} />
        <Btn f={f} press={send} tone={tone} label="Send request" r={14} style={{ background: T.navy }} />
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: T.ink700 }}>Cancel</div>
      </div>
    </Sheet>
  );
};
const menuChange = (tone: Tone): Screen => (f, dur) => {
  // tap the menu button once the step has settled, then the menu opens and stays until the next step
  const p = sp(f, 18, { damping: 18, stiffness: 190, mass: 0.7 });
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {tone === 'client' ? <ClientPhone f={K.cBooked + 30} /> : <QuietBooked />}
      <Menu f={f} p={p} pick={0} press={at(dur, 0.6)} title={JOB.title} items={tone === 'client'
        ? [{ l: 'Change date or time', I: CalendarClock }, { l: 'Report a problem', I: TriangleAlert }, { l: 'Cancel job', I: CircleX, danger: true, hint: 'Cancelling after hiring asks the provider to agree. Your money comes back once they do.' }]
        : [{ l: 'Change date or time', I: CalendarClock }, { l: 'Report a problem', I: TriangleAlert }]} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={14} x={372} y={110} /><Tap f={f} at={at(dur, 0.6)} x={150} y={tone === 'client' ? 712 : 808} /></div>
    </div>
  );
};
const changeSheet = (tone: Tone): Screen => (f, dur) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    {tone === 'client' ? <ClientPhone f={K.cBooked + 30} /> : <QuietBooked />}
    <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>{ChangeSheet(f, dur, tone)}</div>
    <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={at(dur, 0.25) - 2} x={110} y={652} /><Tap f={f} at={at(dur, 0.4) - 2} x={300} y={652} /><Tap f={f} at={at(dur, 0.86)} x={205} y={833} /></div>
  </div>
);
const ChangeCard: React.FC<{ f: number; dur: number; mine?: boolean; who: string; tone: Tone; press?: number }> = ({ f, mine, who, tone, press = -99 }) => {
  const accepted = !mine && f >= press + 4;
  return (
    <div style={{ background: accepted ? T.okSurface : T.warnSurface, border: `1px solid ${accepted ? T.okBorder : T.warnBorder}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {accepted ? <div style={{ fontSize: 14, fontWeight: 600, color: T.okText }}>Date change accepted. The job has the new schedule.</div> : (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: '19px', color: T.warnText }}>{mine ? 'You' : who} asked to move this job to Wed, Oct 21, 2:00 PM.</div>
          <div style={{ fontSize: 14, lineHeight: '19px', color: T.warnText }}>Reason: {tone === 'client' ? 'I have a family event in the morning.' : 'My earlier job runs late.'}</div>
          {mine ? <div style={{ fontSize: 14, fontWeight: 600, color: T.warnText }}>Withdraw</div> : (
            <div style={{ display: 'flex', gap: 10 }}><div style={{ flex: 1, height: 40, borderRadius: 12, background: pal(tone).primary, color: T.white, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600, transform: `scale(${1 - hit(f, press, 3) * 0.05})` }}>Accept</div><div style={{ flex: 1, height: 40, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600, color: T.warnText }}>Decline</div></div>
          )}
        </>
      )}
    </div>
  );
};
const DetailWithCard = (f: number, dur: number, tone: Tone, mine: boolean, press = -99) => {
  // the new schedule only applies once the other side accepts
  const moved = press >= 0 && f >= press + 4;
  return wrap(
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="Job details" white menu y={113} size={19.5} />
      <div style={{ position: 'absolute', top: 166, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.9, color: pal(tone).link }}>PLUMBING</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px', letterSpacing: -0.3 }}>{JOB.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ fontSize: 18, fontWeight: 700 }}>{peso(JOB.price)}</div><div style={{ borderRadius: 999, padding: '4px 10px', background: T.ink50, fontSize: 12, fontWeight: 700, color: T.ink700 }}>Normal</div></div>
        </div>
        <div style={{ transform: `scale(${pop(f, 4)})`, transformOrigin: 'top center' }}><ChangeCard f={f} dur={dur} mine={mine} who={tone === 'client' ? P.first : C.first} tone={tone} press={press} /></div>
        <Status tone="booked" app={tone} over={moved ? 'Booked · Wed, Oct 21' : 'Booked'} title={tone === 'client' ? `${P.name} comes ${moved ? 'Wed, Oct 21' : 'Tue, Oct 20'}` : `Go to ${JOB.address}`} body={moved ? '2:00 PM' : '9:00 AM'} I={CalendarDays} />
        <Stepper n={1} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Section title={tone === 'client' ? 'Your provider' : 'Your client'} />
          {tone === 'client' ? <Person name={P.name} ini={P.ini} sub="4.8 · 38 jobs done" star msg /> : <Person name={C.name} ini={C.ini} sub="Client" msg tone="provider" />}
        </div>
        <WhenWhere when={moved ? 'Oct 21, 2026 · 2:00 PM' : JOB.when} where={JOB.address} I1={CalendarDays} I2={MapPin} />
      </div>
      <Tap f={f} at={press} x={117} y={366} />
    </div>,
  );
};
const requestSent: Screen = (f, dur) => DetailWithCard(f, dur, 'client', true);
const providerAccepts: Screen = (f, dur) => DetailWithCard(f, dur, 'provider', false, at(dur, 0.55));

// ── Client: cancel and report ──────────────────────────────────────────────
const cancelMenu: Screen = (f, dur) => {
  const p = sp(f, 18, { damping: 18, stiffness: 190, mass: 0.7 });
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ClientPhone f={K.cWaiting + 20} />
      <Menu f={f} p={p} pick={1} press={at(dur, 0.6)} title={JOB.title} items={[{ l: 'Report a problem', I: TriangleAlert }, { l: 'Cancel job', I: CircleX, danger: true }]} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={14} x={372} y={110} /><Tap f={f} at={at(dur, 0.6)} x={150} y={862} /></div>
    </div>
  );
};
const cancelDialog: Screen = (f, dur) => {
  const press = at(dur, 0.6);
  const p = sp(f, 2, { damping: 18, stiffness: 200, mass: 0.7 }) ;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ClientPhone f={K.cWaiting + 20} />
      {p > 0.01 && <Dialog f={f} p={p} press={press} danger title="Cancel this job?" message="This takes the job down so providers can no longer apply. It cannot be undone." confirm="Cancel Job" cancel="Keep Job" />}
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={press} x={205} y={507} /></div>
    </div>
  );
};
const REASONS = ['Payment or cancellation issue', 'Work not completed', 'Work quality issue', 'Participant did not arrive', 'Conduct issue', 'Other'];
const Report = (f: number, dur: number, stage: 'reason' | 'details') => {
  const pick = stage === 'reason' ? at(dur, 0.45) : -99;
  const chosen = stage === 'details' || f >= pick;
  const t1 = at(dur, 0.1), t2 = at(dur, 0.55), ph = at(dur, 0.62), send = at(dur, 0.82);
  const y = stage === 'details' ? tw(f, 2, 14, 0, 300, inOut) : 0;
  return wrap(
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-y}px)` }}>
        <div style={{ position: 'absolute', top: 166, left: 20, right: 20 }}>
          <div style={{ fontSize: 13, color: T.ink500 }}>{JOB.title}</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 18, marginBottom: 10 }}>What went wrong?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {REASONS.map((r, i) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14, border: i === 2 && chosen ? `1.5px solid ${T.sky}` : `1px solid ${T.line}`, background: i === 2 && chosen ? '#E0F2FE' : T.surface }}>
                <Radio on={i === 2 && chosen} /><span style={{ fontSize: 15 }}>{r}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18 }}><Field label="Tell us what happened" value={stage === 'details' ? typed(f, t1, t2, 'The faucet still leaks after the repair. Photo attached.') : ''} ph="Give support enough detail to review the issue…" h={96} on={stage === 'details' && f >= t1 && f < t2 + 6} f={f} until={t2 + 6} /></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginTop: 16, marginBottom: 8 }}>Photos (optional)</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {stage === 'details' && f >= ph && <div style={{ width: 68, height: 68, borderRadius: 14, background: 'linear-gradient(160deg,#CBD5E1,#94A3B8)', transform: `scale(${pop(f, ph)})` }} />}
            <div style={{ width: 68, height: 68, borderRadius: 14, border: `1.5px dashed ${T.field}`, display: 'grid', placeItems: 'center', background: T.surface }}><Camera size={22} color={T.sky} /></div>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 150, background: T.canvas }} />
      <AppBar title="Report a problem" y={113} size={19.5} />
      <Footer><Btn f={f} press={send} label="Send report" h={46} r={16} size={14} off={!chosen} style={{ flex: 1, fontWeight: 600 }} /></Footer>
      <Tap f={f} at={pick} x={150} y={377} />
      {stage === 'details' && <Tap f={f} at={ph - 2} x={53} y={490} />}
      {stage === 'details' && <Tap f={f} at={send} x={205} y={863} />}
    </div>,
  );
};
const reportReason: Screen = (f, dur) => Report(f, dur, 'reason');
const reportDetails: Screen = (f, dur) => Report(f, dur, 'details');

// ── Client: payments, notifications, settings ──────────────────────────────
const MenuRow: React.FC<{ I: React.ComponentType<any>; l: string; hi?: boolean }> = ({ I, l, hi }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 56, padding: '0 14px', borderRadius: 14, background: hi ? T.ink50 : 'transparent' }}>
    <div style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center' }}><I size={17} color={T.ink700} /></div>
    <div style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{l}</div><ChevronRight size={18} color={T.ink500} />
  </div>
);
const profile: Screen = (f, dur) => wrap(
  <div style={{ position: 'absolute', inset: 0 }}>
    <div style={{ position: 'absolute', top: 96, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Avatar ini={C.ini} size={88} fs={30} /><div style={{ fontSize: 19, fontWeight: 800, marginTop: 12 }}>{C.name}</div>
      <div style={{ marginTop: 12, padding: '10px 18px', borderRadius: 999, background: '#E0F2FE', fontSize: 14, fontWeight: 600 }}>Edit profile</div>
    </div>
    <div style={{ position: 'absolute', top: 300, left: 20, right: 20, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface, padding: '4px 0' }}>
      {[[Mail, 'Email', 'ana.reyes@example.com'], [PhoneIcon, 'Phone', 'Add phone number'], [MapPin, 'Location', JOB.address]].map(([I, k, v]: any) => (
        <div key={k} style={{ display: 'flex', gap: 12, padding: '10px 14px' }}><I size={18} color={T.ink700} /><div><div style={{ fontSize: 12, color: T.ink500 }}>{k}</div><div style={{ fontSize: 15, fontWeight: 500 }}>{v}</div></div></div>
      ))}
    </div>
    <div style={{ position: 'absolute', top: 506, left: 20, right: 20, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}>
      <MenuRow I={CreditCard} l="Payments" hi={f >= at(dur, 0.6)} /><MenuRow I={Settings} l="Settings" /><MenuRow I={CircleHelp} l="Help & support" />
    </div>
    <TabBar tone="client" active={3} />
    <Tap f={f} at={at(dur, 0.6)} x={150} y={534} />
  </div>,
);
const payments: Screen = (f) => wrap(
  <div style={{ position: 'absolute', inset: 0 }}>
    <AppBar title="Payments" y={113} size={19.5} />
    <div style={{ position: 'absolute', top: 166, left: 20, right: 20 }}>
      <div style={{ display: 'flex', gap: 8 }}>{[['Paid this month', 3250], ['On hold', 1200], ['Refunded this month', 0]].map(([l, v]: any, i) => <div key={l} style={{ flex: 1, padding: 10, borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface }}><div style={{ fontSize: 12, color: T.ink500, minHeight: 32 }}>{l}</div><div style={{ fontSize: 16, fontWeight: 700, color: i === 2 ? T.okText : T.ink900 }}>{peso(v)}</div></div>)}</div>
      <div style={{ fontSize: 13, color: T.ink500, marginTop: 10 }}>− money you paid · + money back to you</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Pill label="All" on /><Pill label="Paid" /><Pill label="On hold" /><Pill label="Refunds" /></div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 16 }}>October 2026</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {[[JOB.title, 'Oct 19, 2026', '−' + peso(JOB.price), 'Held until you confirm the job is done', true], ['Cleaning: Deep clean condo', 'Oct 12, 2026', '−' + peso(1800), 'Paid to Mark Santos', false], ['Plumbing: Unclog drain', 'Oct 9, 2026', '−' + peso(850), 'Paid to Mark Santos', false]].map(([t, d, a, s, hold]: any, i) => (
          <div key={t} style={{ padding: 14, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, opacity: tw(f, 6 + i * 4, 12 + i * 4) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 15, fontWeight: 600 }}>{t}</span><span style={{ fontSize: 15, fontWeight: 700 }}>{a}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span style={{ fontSize: 13, color: T.ink500 }}>{d}</span>{hold && <span style={{ fontSize: 12, fontWeight: 700, color: T.warnText, background: T.warnSurface, padding: '2px 8px', borderRadius: 999 }}>On hold</span>}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  </div>,
);
const notifications: Screen = (f) => wrap(
  <div style={{ position: 'absolute', inset: 0 }}>
    <AppBar title="Notifications" y={113} size={19.5} menu />
    <div style={{ position: 'absolute', top: 170, left: 20, right: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: T.ink500, marginBottom: 10 }}>THIS WEEK</div>
      {[[CalendarDays, 'Booking confirmed', `${P.name} accepted your booking.`, 'now'], [FileText, 'New application', `${P.name} applied to "${JOB.title}".`, '1 h ago'], [CircleCheck, 'Job update', 'Your job is open for proposals.', '2 h ago']].map(([I, t, b, w]: any, i) => (
        <div key={t} style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, marginBottom: 10, opacity: tw(f, 4 + i * 4, 10 + i * 4) }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: T.sky, display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={19} color={T.white} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{t}</div><div style={{ fontSize: 13, color: T.ink700, marginTop: 2 }}>{b}</div><div style={{ fontSize: 12, color: T.ink500, marginTop: 4 }}>{w}</div></div>
        </div>
      ))}
    </div>
  </div>,
);
// HOSettingsScreen: Appearance (Dark mode) · Notifications (Push) · Account (Change password, Language) · Delete account.
// Layout uses the screen's own spacing: body paddingTop 20, section title 13/18 + 8, card rows 14 + content + 14, card gap 20.
// Settings in the app's light and dark palettes (mobile/src/constants/palettes.ts, client roles)
type SP = { canvas: string; surface: string; well: string; line: string; ink900: string; ink700: string; ink500: string; off: string; on: string; danger: string };
const SET_LIGHT: SP = { canvas: T.canvas, surface: T.surface, well: T.well, line: T.line, ink900: T.ink900, ink700: T.ink700, ink500: T.ink500, off: '#CBD5E1', on: '#0284C7', danger: T.danger };
const SET_DARK: SP = { canvas: '#0e1113', surface: '#171b1f', well: '#1d2227', line: '#2c3238', ink900: '#f3f5f7', ink700: '#dce1e6', ink500: '#b9c1c9', off: '#3a4148', on: '#38bdf8', danger: '#fca5a5' };
const SwitchRN: React.FC<{ on: boolean; c?: SP }> = ({ on, c = SET_LIGHT }) => (
  <div style={{ width: 46, height: 26, borderRadius: 13, background: on ? c.on : c.off, position: 'relative', flexShrink: 0 }}><div style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 10, background: T.white, boxShadow: '0 1px 2px rgba(15,23,42,0.25)' }} /></div>
);
const SRow: React.FC<{ I: React.ComponentType<any>; l: string; hint?: string; right?: React.ReactNode; danger?: boolean; border?: boolean; c?: SP }> = ({ I, l, hint, right, danger, border, c = SET_LIGHT }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: border ? `1px solid ${c.line}` : undefined }}>
    <div style={{ width: 34, height: 34, borderRadius: 10, background: c.well, display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={18} color={danger ? c.danger : c.ink700} /></div>
    <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px', color: danger ? c.danger : c.ink900 }}>{l}</div>{hint && <div style={{ fontSize: 13, lineHeight: '18px', color: c.ink500, marginTop: 2 }}>{hint}</div>}</div>
    {right}
  </div>
);
const SHead: React.FC<{ t: string; c?: SP }> = ({ t, c = SET_LIGHT }) => <div style={{ fontSize: 13, lineHeight: '18px', fontWeight: 700, letterSpacing: 0.6, color: c.ink500, marginBottom: 8 }}>{t}</div>;
const SCard: React.FC<{ children: React.ReactNode; c?: SP }> = ({ children, c = SET_LIGHT }) => <div style={{ background: c.surface, borderRadius: 16, border: `1px solid ${c.line}`, overflow: 'hidden', marginBottom: 20 }}>{children}</div>;
export const SETTINGS_DARK = { x: 350, y: 237 }; // centre of the Dark mode switch
const SettingsPage: React.FC<{ c: SP; dark: boolean }> = ({ c, dark }) => (
  <div style={{ position: 'absolute', inset: 0, background: c.canvas, color: c.ink900 }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 26px 0 28px', fontSize: 14.5, fontWeight: 500, color: c.ink900, zIndex: 25 }}>
      <span>9:41</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>{[4, 7, 10, 13].map((h, i) => <span key={i} style={{ width: 3, height: h, borderRadius: 1, background: c.ink900 }} />)}</span>
        <svg width="17" height="13" viewBox="0 0 24 18"><path d="M12 17.5 0.8 6.3a16 16 0 0 1 22.4 0Z" fill={c.ink900} /></svg>
        <span style={{ width: 24, height: 12, borderRadius: 3.5, background: c.ink900 }} />
      </span>
    </div>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 155, padding: '93px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 12, background: c.surface, borderBottom: `1px solid ${c.line}`, zIndex: 4 }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: c.surface, border: `1px solid ${c.line}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><ArrowLeft size={20} color={c.ink700} /></div>
      <div style={{ flex: 1, fontSize: 19.5, fontWeight: 800, lineHeight: '40px' }}>Settings</div>
    </div>
    <div style={{ position: 'absolute', top: 175, left: 20, right: 20 }}>
      <SHead t="APPEARANCE" c={c} />
      <SCard c={c}><SRow c={c} I={Moon} l="Dark mode" hint="Easier on the eyes at night" right={<SwitchRN c={c} on={dark} />} /></SCard>
      <SHead t="NOTIFICATIONS" c={c} />
      <SCard c={c}><SRow c={c} I={Bell} l="Push notifications" hint="Proposals, bookings and messages" right={<SwitchRN c={c} on />} /></SCard>
      <SHead t="ACCOUNT" c={c} />
      <SCard c={c}>
        <SRow c={c} I={Lock} l="Change password" border right={<ChevronRight size={20} color={c.ink500} />} />
        <SRow c={c} I={Globe} l="Language" right={<><span style={{ fontSize: 14, color: c.ink500 }}>English</span><ChevronRight size={20} color={c.ink500} /></>} />
      </SCard>
      <SCard c={c}><SRow c={c} I={Trash2} l="Delete account" danger /></SCard>
    </div>
  </div>
);
// Tapping Dark mode flips the switch, then the whole app takes the dark palette, as in the app
const settings: Screen = (f, dur) => {
  const tap = at(dur, 0.55);
  const d = tw(f, tap + 3, tap + 9, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <SettingsPage c={SET_LIGHT} dark={f >= tap} />
      {d > 0 && <div style={{ position: 'absolute', inset: 0, opacity: d, zIndex: 30 }}><SettingsPage c={SET_DARK} dark /></div>}
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={tap} x={SETTINGS_DARK.x} y={SETTINGS_DARK.y} /></div>
    </div>
  );
};

// ── Provider: payout account ───────────────────────────────────────────────
const Payout = (f: number, dur: number, stage: 'empty' | 'form' | 'saved') => {
  const N = pal('provider');
  const n1 = at(dur, 0.2), n2 = at(dur, 0.45), m1 = at(dur, 0.5), m2 = at(dur, 0.72), save = at(dur, 0.85);
  return wrap(
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="Payout account" y={113} size={19.5} />
      <div style={{ position: 'absolute', top: 166, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 14, lineHeight: '20px', color: T.ink700 }}>When a client confirms the job is done, your pay is sent to this account, less the platform fee.</div>
        <div style={{ padding: 16, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}>
          {stage === 'saved' ? (
            <div style={{ transform: `scale(${pop(f, 2)})` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 40, height: 40, borderRadius: 12, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center' }}><Smartphone size={20} color={T.ink700} /></div><div><div style={{ fontSize: 16, fontWeight: 700 }}>GCash</div><div style={{ fontSize: 13, color: T.ink500 }}>{P.name}</div><div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 2 }}>•••• 4567</div></div></div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>Payouts go here</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}><div style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${T.line}`, fontSize: 14, fontWeight: 600 }}>Change account</div><div style={{ padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${T.danger}`, color: T.danger, fontSize: 14, fontWeight: 600 }}>Remove</div></div>
            </div>
          ) : (
            <><div style={{ fontSize: 16, fontWeight: 700 }}>No payout account yet</div><div style={{ fontSize: 14, lineHeight: '20px', color: T.ink700, marginTop: 6 }}>Payouts go to your GCash, Maya or a bank account when the client confirms the job is done. Add one below.</div></>
          )}
        </div>
        {stage !== 'saved' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: stage === 'form' ? 1 : tw(f, at(dur, 0.4), at(dur, 0.55)) }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Link an account</div>
            <div style={{ display: 'flex', gap: 8 }}>{['GCash', 'Maya', 'Bank'].map((m, i) => <div key={m} style={{ padding: '9px 16px', borderRadius: 999, background: i === 0 ? N.primary : T.surface, border: `1px solid ${i === 0 ? N.primary : T.line}`, color: i === 0 ? T.white : T.ink700, fontSize: 14, fontWeight: 600 }}>{m}</div>)}</div>
            <Field label="Account holder name" value={stage === 'form' ? typed(f, n1, n2, P.name) : ''} ph="Name on the account" tone="provider" on={stage === 'form' && f >= n1 && f < n2 + 4} f={f} until={n2 + 4} />
            <Field label="GCash mobile number" value={stage === 'form' ? typed(f, m1, m2, '0917 123 4567') : ''} ph="09XX XXX XXXX" tone="provider" on={stage === 'form' && f >= m1 && f < m2 + 4} f={f} until={m2 + 4} />
            <Btn f={f} press={stage === 'form' ? save : undefined} tone="provider" label="Save account" r={14} />
          </div>
        )}
      </div>
      {stage === 'form' && <Tap f={f} at={save} x={205} y={625} />}
    </div>,
  );
};
// Profile → tap Payout account (row 5 of Your work) → the page pushes in, as in the app
const payoutOpen: Screen = (f, dur) => {
  const tap = at(dur, 0.3), open = tap + 6;
  const x = tw(f, open, open + 12, 1, 0, inOut);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {f < open + 12 && <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-(1 - x) * 30}%)` }}>{ProfileP(f, tap / 0.55, 4)}</div>}
      {f >= open && <div style={{ position: 'absolute', inset: 0, transform: `translateX(${x * 100}%)`, boxShadow: '-8px 0 24px rgba(15,23,42,0.12)' }}>{Payout(f - open, dur - open, 'empty')}</div>}
    </div>
  );
};
const payoutForm: Screen = (f, dur) => Payout(f, dur, 'form');
const payoutSaved: Screen = (f, dur) => Payout(f, dur, 'saved');
const setupPayout: Screen = (f) => <ProviderPhone f={Math.min(17, f * 0.2)} />;

// ── Provider: feed and availability ────────────────────────────────────────
// the new job lands at the top; the Open job tap belongs to the proposal guide, so it stays hidden
const feedTour: Screen = (f, dur) => <TapGate.Provider value={{ min: -Infinity, max: Infinity, o: 0 }}><ProviderPhone f={300 + Math.min(1, f / dur) * 62} /></TapGate.Provider>;
const availability: Screen = (f, dur) => {
  const off = f >= at(dur, 0.35) && f < at(dur, 0.75);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ProviderPhone f={300} />
      <div style={{ position: 'absolute', top: 351, left: 20, right: 20, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px', borderRadius: 18, background: T.surface, border: `1px solid ${T.line}`, zIndex: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: off ? T.ink300 : T.okSolid }} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{off ? 'Not available' : 'Available for jobs'}</div><div style={{ fontSize: 13, color: T.ink500, marginTop: 1 }}>{off ? "You won't be invited to new jobs" : 'Clients within 10 km can invite you'}</div></div>
        <div style={{ width: 44, height: 24, borderRadius: 12, background: off ? T.field : T.okSolid, position: 'relative' }}><div style={{ position: 'absolute', top: 2, left: off ? 2 : 22, width: 20, height: 20, borderRadius: 10, background: T.white }} /></div>
      </div>
      <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}><Tap f={f} at={at(dur, 0.35)} x={360} y={380} /><Tap f={f} at={at(dur, 0.75)} x={360} y={380} /></div>
    </div>
  );
};

// ── Provider: decline a booking ────────────────────────────────────────────
const QUICK = ['Already booked at that time', 'Too far from my service area', 'Job needs skills I do not offer', 'Budget is too low for this work'];
const decline: Screen = (f, dur) => {
  const p = sp(f, 4, { damping: 18, stiffness: 190, mass: 0.7 });
  const pick = at(dur, 0.35), press = at(dur, 0.8);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <QuietBooked />
      <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
        <Sheet p={p}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Decline booking</div>
            {QUICK.map((q, i) => <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: i === 0 && f >= pick ? `1.5px solid #2D4A68` : `1px solid ${T.line}`, background: i === 0 && f >= pick ? '#E8EDF3' : T.surface }}><Radio on={i === 0 && f >= pick} tone="provider" /><span style={{ fontSize: 15 }}>{q}</span></div>)}
            <Field label="Add a note (optional)" value="" ph="Anything the client should know" tone="provider" />
            <Btn f={f} press={press} label="Decline Booking" r={14} style={{ background: T.danger }} />
            <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#2D4A68' }}>Keep booking</div>
          </div>
        </Sheet>
      </div>
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={pick} x={150} y={517} /><Tap f={f} at={press} x={205} y={835} /></div>
    </div>
  );
};
// Tap Start job → the job turns Working, no task ticked yet (the app's Job details in working mode)
const startJob: Screen = (f, dur) => {
  const tap = at(dur, 0.35), swap = tap + 5;
  const o = tw(f, swap, swap + 8, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <QuietBooked />
      {o > 0 && <div style={{ position: 'absolute', inset: 0, opacity: o, background: T.canvas, zIndex: 30 }}><TapGate.Provider value={{ min: -Infinity, max: Infinity, o: 0 }}>{ProDetail(741, 'working')}</TapGate.Provider><StatusBar /></div>}
      <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={tap} x={205} y={845} /></div>
    </div>
  );
};
const bookedDecline: Screen = (f, dur) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <QuietBooked />
    <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}><Tap f={f} at={at(dur, 0.72)} x={205} y={887} /></div>
  </div>
);

// ── Provider: services, certificates, portfolio ────────────────────────────
const ProfileP = (f: number, dur: number, hi: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <ProviderPhone f={K.review + 20} />
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 460 + 56 * hi, left: 20, right: 20, height: 56, borderRadius: 14, background: `rgba(15,23,42,${0.06 * tw(f, at(dur, 0.55), at(dur, 0.6))})` }} />
      <Tap f={f} at={at(dur, 0.55)} x={150} y={488 + 56 * hi} />
    </div>
  </div>
);
const toServices: Screen = (f, dur) => ProfileP(f, dur, 1);
const toPortfolio: Screen = (f, dur) => ProfileP(f, dur, 2);
const services: Screen = (f, dur) => {
  const pick = at(dur, 0.3), t1 = at(dur, 0.45), t2 = at(dur, 0.78), send = at(dur, 0.88);
  const N = pal('provider');
  return wrap(
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="My Services" y={113} size={19.5} />
      <div style={{ position: 'absolute', top: 166, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 18, border: `1px solid ${T.line}`, background: T.surface }}><div style={{ fontSize: 12, color: T.ink500 }}>What clients see now</div><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}><Wrench size={18} color={N.link} /><span style={{ fontSize: 15, fontWeight: 600 }}>Plumbing</span><span style={{ fontSize: 12, fontWeight: 700, color: T.okText, background: T.okSurface, padding: '2px 8px', borderRadius: 999 }}>ID verified</span></div></div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Request a change</div>
        {[['Change my main service', 'Replace the service clients see on your profile.'], ['Add another service', 'Offer a second service alongside your main one.']].map(([l, h], i) => (
          <div key={l} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 14, border: i === 1 ? `1.5px solid ${N.link}` : `1px solid ${T.line}`, background: i === 1 ? N.tonal : T.surface }}><Radio on={i === 1} tone="provider" /><div><div style={{ fontSize: 15, fontWeight: 600 }}>{l}</div><div style={{ fontSize: 13, color: T.ink500, marginTop: 2 }}>{h}</div></div></div>
        ))}
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700 }}>Service</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{['Cleaning', 'Handyman', 'Manicure', 'Pedicure'].map((c, i) => <div key={c} style={{ padding: '9px 14px', borderRadius: 999, background: i === 0 && f >= pick ? N.primary : T.surface, border: `1px solid ${i === 0 && f >= pick ? N.primary : T.line}`, color: i === 0 && f >= pick ? T.white : T.ink700, fontSize: 14, fontWeight: 600, transform: `scale(${1 + (i === 0 ? hit(f, pick, 4) * 0.08 : 0)})` }}>{c}</div>)}</div>
        <Field label="Why are you qualified?" value={typed(f, t1, t2, '5 years of home cleaning; TESDA Housekeeping NC II.')} ph="Years of experience, licences or certificates, past jobs…" h={84} tone="provider" on={f >= t1 && f < t2 + 4} f={f} until={t2 + 4} />
      </div>
      <Footer tone="provider"><Btn f={f} press={send} tone="provider" label="Send request" h={46} r={16} size={14} style={{ flex: 1, fontWeight: 600 }} /></Footer>
      <Tap f={f} at={pick} x={70} y={480} />
      <Tap f={f} at={send} x={205} y={863} />
    </div>,
  );
};
const underReview: Screen = (f) => wrap(
  <div style={{ position: 'absolute', inset: 0 }}>
    <AppBar title="My Services" y={113} size={19.5} />
    <div style={{ position: 'absolute', top: 166, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 14, transform: `scale(${pop(f, 2)})`, transformOrigin: 'top center' }}>
      <Status tone="attention" app="provider" over="Under review" title="Add Cleaning" body="Sent Oct 19" I={Hourglass}>
        <div style={{ fontSize: 14, fontStyle: 'italic', color: T.ink700 }}>“5 years of home cleaning; TESDA Housekeeping NC II.”</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#2D4A68' }}>Cancel request</div>
      </Status>
      <div style={{ fontSize: 14, lineHeight: '20px', color: T.ink700 }}>Once it's approved, add a certificate for Cleaning in Certifications so you can send proposals for those jobs.</div>
    </div>
  </div>,
);
const portfolio: Screen = (f, dur) => {
  const add = at(dur, 0.35), cap1 = at(dur, 0.5), cap2 = at(dur, 0.78);
  return wrap(
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="My Portfolio" y={113} size={19.5} />
      <div style={{ position: 'absolute', top: 166, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 14, lineHeight: '20px', color: T.ink700 }}>Photos of your past work help clients choose you.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {f >= add && <div style={{ height: 150, borderRadius: 14, background: 'linear-gradient(160deg,#D6DEE6,#94A3B8)', position: 'relative', transform: `scale(${pop(f, add)})` }}><div style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11, fontWeight: 700, color: T.white, background: 'rgba(15,23,42,0.55)', padding: '2px 8px', borderRadius: 999 }}>Published</div></div>}
          <div style={{ height: 150, borderRadius: 14, border: `1.5px dashed ${T.field}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#2D4A68', fontSize: 14, fontWeight: 600, background: T.surface }}><ImagePlus size={24} /> Add photo</div>
        </div>
        {f >= add && <Field label="Caption" value={typed(f, cap1, cap2, 'Kitchen sink replaced, Lipa City')} ph="What did you do?" tone="provider" on={f >= cap1 && f < cap2 + 4} f={f} until={cap2 + 4} />}
        {f >= add && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 14, fontWeight: 600, color: T.ink700 }}>Service</span><span style={{ padding: '6px 12px', borderRadius: 999, background: T.navy, color: T.white, fontSize: 13, fontWeight: 600 }}>Plumbing</span></div>}
      </div>
      <Tap f={f} at={add - 4} x={109} y={253} />
    </div>,
  );
};

// unused imports kept tidy
void [BriefcaseBusiness, Landmark, Check, ArrowLeft, Box];

export const CUSTOM2 = {
  homeTour, myJobs, myJobsOpen, startJob, openChat, menuChangeC: menuChange('client'), changeSheetC: changeSheet('client'), requestSent, providerAccepts,
  menuChangeP: menuChange('provider'), changeSheetP: changeSheet('provider'),
  cancelMenu, cancelDialog, reportReason, reportDetails, profile, payments, notifications, settings,
  setupPayout, payoutOpen, payoutForm, payoutSaved, feedTour, availability, bookedDecline, decline,
  toServices, services, underReview, toPortfolio, portfolio,
} satisfies Record<string, Screen>;
