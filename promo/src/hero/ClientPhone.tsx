import React from 'react';
import {
  ArrowRight, Bell, Brush, CalendarCheck, CalendarDays, Camera, Check, ChevronRight, CircleCheck, ClipboardList, Clock, CreditCard, Footprints, Hammer, Hand, Hourglass, LocateFixed, MapPin, Plus, ShieldCheck, Sparkles, Star, Wrench, Zap, BadgeCheck, Award,
} from 'lucide-react';
import { Screens, Tap, pop, type Scr } from '../v2/kit';
import { expoOut, hit, inOut, sp, tw } from '../motion';
import { peso } from '../components/ui';
import { AppBar, Avatar, Box, Btn, Caret, Empty, Footer, Person, Pill, Radio, Section, Sheet, Status, StatusBar, StepTitle, Steps, Stepper, T, TabBar, WhenWhere, pal } from './ui';
import { CHAT, CLIENT as C, JOB, K, MSG, PRO as P } from './story';

const S = pal('client');
const typed = (f: number, a: number, b: number, s: string) => s.slice(0, Math.floor(tw(f, a, b, 0, s.length, (t) => t)));

// ── Home (HOHomeScreen) ─────────────────────────────────────────────────────
const Home = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <div style={{ position: 'absolute', top: 93, left: 20, right: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar ini={C.ini} size={40} fs={14} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 13, lineHeight: '20px', color: T.ink500 }}>Good morning</div>
        <div style={{ fontSize: 18, lineHeight: '24px', fontWeight: 700 }}>{C.name}</div>
      </div>
      <div style={{ width: 44, height: 44, borderRadius: 22, background: T.surface, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center' }}><Bell size={20} color={T.ink900} strokeWidth={2.2} /></div>
    </div>
    <div style={{ position: 'absolute', top: 157, left: 20, right: 20, minHeight: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 10px 10px', borderRadius: 18, background: T.surface, border: `1px solid ${T.line}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 12, background: S.primary, display: 'grid', placeItems: 'center' }}><Plus size={18} color={T.white} strokeWidth={2.4} /></div>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: T.ink500 }}>What do you need done?</div>
      <ChevronRight size={18} color={T.ink500} />
    </div>
    <div style={{ position: 'absolute', top: 230, left: 20, right: 20, borderRadius: 20, background: S.primary, padding: 18, display: 'flex', flexDirection: 'column', gap: 8, color: T.white }}>
      <div style={{ alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', fontSize: 12, fontWeight: 600, lineHeight: '16px', color: 'rgba(255,255,255,0.82)' }}>Ready when you are</div>
      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px' }}>Post your first job</div>
      <div style={{ fontSize: 13, lineHeight: '18px' }}>It takes about a minute.</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
        <div style={{ padding: '10px 16px', borderRadius: 999, background: T.white, color: S.primary, fontSize: 14, fontWeight: 600, lineHeight: '18px', transform: `scale(${1 - hit(f, K.cPostTap, 3) * 0.08})` }}>Post a job</div>
      </div>
    </div>
    <Section title="Book a service" style={{ position: 'absolute', top: 424, left: 20, right: 20 }} />
    <div style={{ position: 'absolute', top: 462, left: 20, display: 'flex', gap: 10 }}>
      {[['Plumbing', Wrench], ['Cleaning', Brush], ['Handyman', Hammer], ['Manicure', Hand]].map(([l, I]: any) => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 6px', borderRadius: 999, background: T.surface, border: `1px solid ${T.line}` }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: S.tonal, display: 'grid', placeItems: 'center' }}><I size={17} color={S.link} /></div>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink700 }}>{l}</span>
        </div>
      ))}
    </div>
    <Section title="Active jobs" link="See all" style={{ position: 'absolute', top: 530, left: 20, right: 20 }} />
    <Empty I={ClipboardList} title="No active jobs" body="Jobs you post show up here." style={{ position: 'absolute', top: 568, left: 20, right: 20 }} />
    <TabBar tone="client" active={0} />
    <Tap f={f} at={K.cPostTap} x={325} y={367} />
  </div>
);

// ── Post a job (HOCreateJobScreen) ──────────────────────────────────────────
const SERVICES = [
  ['Plumbing', 'Pipes, fixtures & repairs', Wrench], ['Cleaning', 'Home & deep cleaning', Brush], ['Handyman', 'Repairs & odd jobs', Hammer],
  ['Manicure', 'Nail care & manicure', Sparkles], ['Pedicure', 'Foot care & pedicure', Footprints],
] as const;
const PostBar = (n: number, label: string, f: number, at: number) => (<><AppBar title="Post a job" icon="close" y={123} /><Steps n={n} label={label} tone="client" f={f} at={at} /></>);
const PostFooter: React.FC<{ f: number; press: number; label: string; back?: boolean; off?: boolean }> = ({ f, press, label, back = true, off }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '12px 20px 24px', background: T.surface, borderTop: `1px solid ${T.line}`, display: 'flex', gap: 12, zIndex: 5 }}>
    {back && <div style={{ minWidth: 96, height: 48, borderRadius: 14, background: S.tonal, color: S.deep, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700 }}>Back</div>}
    <Btn f={f} press={press} label={label} off={off} style={{ flex: 1 }} />
  </div>
);

const Post1 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    {PostBar(1, 'Service', f, K.cStep1)}
    <StepTitle top={228}>What do you need help with?</StepTitle>
    <div style={{ position: 'absolute', top: 268, left: 20, right: 20, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {SERVICES.map(([l, d, I], i) => {
        const sel = i === 0 && f >= K.cPickSvc;
        return (
          <div key={l} style={{ width: 179, minHeight: 124, padding: 14, borderRadius: 16, border: `1.5px solid ${sel ? S.primary : T.line}`, background: sel ? S.tonal : T.surface, display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', transform: `scale(${pop(f, K.cStep1 + 4 + i * 2) * (1 + (i === 0 ? hit(f, K.cPickSvc, 4) * 0.04 : 0))})` }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 8, background: sel ? T.surface : S.tonal, display: 'grid', placeItems: 'center' }}><I size={22} color={S.primary} /></div>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: '21px' }}>{l}</div>
            <div style={{ fontSize: 13.5, lineHeight: '18px', color: T.ink500 }}>{d}</div>
            {sel && <div style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, background: S.primary, display: 'grid', placeItems: 'center', transform: `scale(${pop(f, K.cPickSvc)})` }}><Check size={14} color={T.white} strokeWidth={3} /></div>}
          </div>
        );
      })}
    </div>
    <PostFooter f={f} press={K.cStep1Next} label="Next" back={false} off={f < K.cPickSvc} />
    <Tap f={f} at={K.cPickSvc} x={110} y={335} />
    <Tap f={f} at={K.cStep1Next} x={205} y={866} />
  </div>
);

const Post2 = (f: number) => {
  const typedEnd = K.cStep2 + 20;
  const ok = f >= typedEnd + 4;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {PostBar(2, 'Where', f, K.cStep2)}
      <StepTitle top={228} sub="Providers see this on the job.">Where is the job?</StepTitle>
      <div style={{ position: 'absolute', top: 306, left: 20, right: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginBottom: 6 }}>Address</div>
        <div style={{ minHeight: 68, borderRadius: 12, border: ok ? `1px solid ${T.field}` : `2px solid ${S.link}`, background: T.surface, padding: '14px 14px', fontSize: 17, lineHeight: '24px' }}>
          {f < K.cStep2 + 4 ? <span style={{ color: T.ink500 }}>House no., street, barangay, city</span> : typed(f, K.cStep2 + 4, typedEnd, JOB.address)}<Caret f={f} until={typedEnd + 2} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, color: S.link, fontSize: 15, fontWeight: 600 }}><LocateFixed size={17} /> Use my current location</div>
        {ok && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, transform: `scale(${pop(f, typedEnd + 4)})`, transformOrigin: 'left center' }}><Check size={14} color={T.okText} strokeWidth={3} /><span style={{ fontSize: 14, fontWeight: 600, color: T.ink700 }}>Location confirmed</span></div>}
        {!ok && (
          <div style={{ marginTop: 22, display: 'flex', gap: 10, padding: 14, borderRadius: 14, background: T.ink50 }}>
            <MapPin size={18} color={T.ink500} style={{ flexShrink: 0 }} /><div style={{ fontSize: 14, lineHeight: '19px', color: T.ink700 }}>Location is off, so we couldn&apos;t find you. Typing the address works just as well.</div>
          </div>
        )}
      </div>
      <PostFooter f={f} press={K.cStep2Next} label="Next" />
      <Tap f={f} at={K.cStep2Next} x={260} y={866} />
    </div>
  );
};

const TASKS = ['Fix leaking faucet', 'Unclog drain', 'Repair or replace pipes', 'Fix toilet', 'Install new fixture', 'Check water heater'];
const Post3 = (f: number) => {
  const on = [f >= K.cTask1, f >= K.cTask2];
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {PostBar(3, 'Tasks', f, K.cStep3)}
      <StepTitle top={228} sub="Pick the tasks for this job. Your provider ticks these off as they work.">What needs doing?</StepTitle>
      <div style={{ position: 'absolute', top: 326, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TASKS.map((t, i) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 14, border: on[i] ? `1.5px solid ${S.link}` : `1px solid ${T.line}`, background: on[i] ? S.tonal : T.surface }}>
            <Box on={!!on[i]} f={f} at={i ? K.cTask2 : K.cTask1} /><span style={{ fontSize: 15, fontWeight: 500, lineHeight: '20px' }}>{t}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderRadius: 14, border: `1.5px dashed ${T.field}`, background: T.surface, color: T.ink500, fontSize: 15 }}><Plus size={18} color={S.link} /> Add your own task</div>
        <div style={{ fontSize: 13, color: T.ink500, marginTop: 2 }}>{on.filter(Boolean).length}/20 tasks selected</div>
      </div>
      <PostFooter f={f} press={K.cStep3Next} label="Next" />
      <Tap f={f} at={K.cTask1} x={46} y={350} />
      <Tap f={f} at={K.cTask2} x={46} y={408} />
      <Tap f={f} at={K.cStep3Next} x={260} y={866} />
    </div>
  );
};

// HOCreateJobScreen step 4 (UrgencyRow + urgencyInfo): Normal is pre-selected. Each option says when matching
// starts and the rate it is priced at; Urgent carries a Premium badge. The client sets a starting budget,
// pre-filled from the estimate (no local labor range for this job, so the plain suggestion shows).
const URGENCY = [
  ['Flexible', 'Any day that works for you', CalendarDays, 'Not hired in 15 min? We invite top-matched providers · Basic rate', ''],
  ['Normal', 'Within a few days', Clock, 'Not hired in 10 min? We invite top-matched providers · Standard rate', ''],
  ['Urgent', 'As soon as possible', Zap, 'Not hired in 5 min? We invite top-matched providers · Premium rate', 'Premium'],
] as const;
const SCROLL = 150;
const Post4 = (f: number) => {
  const y = tw(f, K.cScroll, K.cScroll + 16, 0, SCROLL, inOut);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, transform: `translateY(${-y}px)` }}>
        <StepTitle top={228}>When, and how much?</StepTitle>
        <div style={{ position: 'absolute', top: 268, left: 20, right: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>How soon?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {URGENCY.map(([l, b, I, timing, badge], i) => {
              const sel = i === 1;
              return (
                <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, border: `1.5px solid ${sel ? S.primary : T.line}`, background: sel ? S.tonal : T.surface }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: sel ? T.surface : S.tonal, display: 'grid', placeItems: 'center', flexShrink: 0 }}><I size={20} color={S.primary} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: '21px' }}>{l}</div>
                      {badge && <div style={{ padding: '2px 8px', borderRadius: 999, background: '#FEF2F2', color: '#B91C1C', fontSize: 11.5, fontWeight: 800, lineHeight: '15px' }}>{badge}</div>}
                    </div>
                    <div style={{ fontSize: 13.5, lineHeight: '18px', color: T.ink500, marginTop: 2 }}>{b}</div>
                    <div style={{ fontSize: 12.5, lineHeight: '17px', color: T.ink700, marginTop: 4 }}>{timing}</div>
                  </div>
                  <Radio on={sel} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            {[['Date', 'Tue, Oct 20'], ['Time', '9:00 AM']].map(([l, v]) => (
              <div key={l} style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginBottom: 6 }}>{l}</div>
                <div style={{ minHeight: 48, borderRadius: 12, border: `1px solid ${T.field}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 18.5 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: '18px', color: T.ink500, marginTop: 24 }}>TaskBuddy starting suggestion: {peso(JOB.price)}. This is an estimate, not a local market rate.</div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '18px', color: T.ink700, marginBottom: 6 }}>Your starting budget (₱)</div>
            <div style={{ height: 50, borderRadius: 14, border: `1px solid ${T.field}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 15, fontWeight: 500 }}>{JOB.price}</div>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: '18px', color: T.ink500, marginTop: 8 }}>Providers may accept this budget or quote a different total. You pay only when you hire.</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200, background: T.canvas, zIndex: 3 }} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}>{PostBar(4, 'When & price', f, K.cStep4)}</div>
      <PostFooter f={f} press={K.cStep4Next} label="Next" />
      <Tap f={f} at={K.cStep4Next} x={260} y={866} />
    </div>
  );
};

const Post5 = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    {PostBar(5, 'Review', f, K.cStep5)}
    <StepTitle top={228}>Check your job</StepTitle>
    <div style={{ position: 'absolute', top: 268, left: 20, right: 20, background: T.surface, borderRadius: 18, border: `1px solid ${T.line}`, padding: '0 16px 4px' }}>
      {[['Service', JOB.service], ['Title', JOB.title], ['Where', JOB.address], ['Tasks', JOB.tasks.join(' · ')], ['Description', JOB.description], ['When', `${JOB.day} · 9:00 AM · Normal`], ['Price', peso(JOB.price)]].map(([k, v], i) => (
        <div key={k} style={{ display: 'flex', gap: 12, padding: '12px 0', borderTop: i ? `1px solid ${T.hairline}` : undefined, opacity: tw(f, K.cStep5 + 2 + i * 2, K.cStep5 + 8 + i * 2) }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ fontSize: 13, fontWeight: 500, color: T.ink500, lineHeight: '18px' }}>{k}</div><div style={{ fontSize: 15, fontWeight: k === 'Price' ? 700 : 500, lineHeight: '21px' }}>{v}</div></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: S.link, paddingTop: 1 }}>Edit</div>
        </div>
      ))}
    </div>
    <PostFooter f={f} press={K.cPost} label="Post job" />
    <Tap f={f} at={K.cPost} x={260} y={866} />
  </div>
);

// ── Job details (HOJobDetailScreen + jobDetailView) ─────────────────────────
type Mode = 'open' | 'booked' | 'working' | 'done';
const ActionBar: React.FC<{ f: number; press?: number; label: string; link?: string }> = ({ f, press, label, link }) => (
  <Footer link={link}><Btn f={f} press={press} label={label} h={46} r={16} size={14} style={{ flex: 1, fontWeight: 600 }} /></Footer>
);
const Detail = (f: number, mode: Mode) => {
  const got = f >= K.propLand;
  const ticks = f >= K.pTick2 + 6 ? 2 : f >= K.pTick1 + 6 ? 1 : 0;
  const allDone = f >= K.doneLand;
  let status: React.ReactNode;
  let footer: React.ReactNode;
  if (mode === 'open') {
    status = got
      ? <Status tone="attention" over="Needs you" title="1 proposal waiting" body="Compare proposals and hire someone. The job is not booked yet." I={Hourglass} f={f} at={K.propLand} />
      : <Status tone="action" over="Open" title="Waiting for proposals" body="Providers near you can apply. We'll notify you." I={CircleCheck} />;
    footer = <ActionBar f={f} press={K.cOpenProps} label={got ? 'Review proposals (1)' : 'Find providers'} />;
  } else if (mode === 'booked') {
    status = <Status tone="booked" over="Booked" title={`${P.name} comes ${JOB.day}`} body={`9:00 AM · ${JOB.address}. Your ${peso(JOB.price)} is held safely and only released after the job is done.`} I={CalendarCheck} f={f} at={K.cBooked + 4} />;
    footer = <ActionBar f={f} label={`Message ${P.name}`} />;
  } else if (mode === 'working') {
    status = allDone
      ? <Status tone="action" over="Your turn" title="The provider finished all tasks" body="Check the work, then confirm. Confirming releases the payment to the provider right away, so report any problem first." I={CircleCheck} f={f} at={K.doneLand} />
      : <Status tone="booked" over="Working" title={`${P.name} is working on it`} body={`${ticks} of 2 tasks done.`} I={CalendarCheck} f={f} at={ticks ? (ticks === 1 ? K.pTick1 + 6 : K.pTick2 + 6) : -99} />;
    footer = allDone ? <ActionBar f={f} press={K.cConfirm} label="Confirm job is done" link="Report a problem" /> : <ActionBar f={f} label={`Message ${P.name}`} link="Report a problem" />;
  } else {
    status = <Status tone="done" over="Done · Oct 20" title="Job completed" I={ShieldCheck} f={f} at={K.paid + 4} />;
    footer = <ActionBar f={f} press={K.cLeaveReview} label="Leave a review" />;
  }
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="Job details" white menu y={113} size={19.5} />
      <div style={{ position: 'absolute', top: 166, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.9, color: S.link }}>PLUMBING</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: '26px', letterSpacing: -0.3 }}>{JOB.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ fontSize: 18, fontWeight: 700 }}>{peso(JOB.price)}</div><div style={{ borderRadius: 999, padding: '4px 10px', background: T.ink50, fontSize: 12, fontWeight: 700, color: T.ink700 }}>Normal</div></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {status}
          {mode === 'open' && !got && <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500 }}>We also invite matched providers automatically if nobody applies soon.</div>}
        </div>
        {mode === 'open' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Section title="Proposals" count={got ? 1 : undefined} link="See all" pop={pop(f, K.propLand)} />
            {got
              ? <div style={{ borderRadius: 18, boxShadow: `0 0 0 ${3 * Math.max(0.35, hit(f, K.propLand, 24))}px rgba(3,105,161,0.45)`, transform: `scale(${1 + hit(f, K.propLand, 8) * 0.04})` }}><Person name={P.name} ini={P.ini} sub="4.8 · 38 jobs done" star /></div>
              : <Empty I={ClipboardList} title="No proposals yet" body="Providers who apply show up here." />}
          </div>
        )}
        <Stepper n={mode === 'open' ? 0 : mode === 'booked' ? 1 : mode === 'working' ? 2 : 3} />
        {mode !== 'open' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Section title="Your provider" />
            <Person name={P.name} ini={P.ini} sub="4.8 · 38 jobs done" star msg />
          </div>
        )}
        <WhenWhere when={JOB.when} where={JOB.address} I1={CalendarDays} I2={MapPin} />
      </div>
      {footer}
      <Tap f={f} at={K.cOpenProps} x={205} y={863} />
      <Tap f={f} at={K.cConfirm} x={205} y={845} />
      <Tap f={f} at={K.cLeaveReview} x={205} y={863} />
    </div>
  );
};

// ── Proposals + hire (HOJobApplicationsScreen, HirePaymentModal) ────────────
const Proposals = (f: number) => (
  <div style={{ position: 'absolute', inset: 0 }}>
    <AppBar title="Proposals" white y={113} size={19.5} />
    <div style={{ position: 'absolute', top: 159, left: 20, right: 20 }}>
      <div style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 999, background: S.tonal, color: S.deep, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{JOB.title} · {peso(JOB.price)} · {JOB.day}</div>
      <div style={{ fontSize: 13, lineHeight: '18px', color: T.ink500, marginBottom: 14 }}>Pick one provider. You only pay when you hire, and the money is held safely until the job is done.</div>
      <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 15, transform: `translateY(${(1 - sp(f, K.cProps + 2)) * 300}px)` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
          <Avatar ini={P.ini} size={44} strong fs={16} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{P.name}</span>
              {[['Verified', BadgeCheck], ['Certified', Award]].map(([l, I]: any) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: T.okSurface, borderRadius: 999, padding: '2px 7px', color: T.okText, fontSize: 11, fontWeight: 700 }}><I size={12} />{l}</span>)}
            </div>
            <div style={{ fontSize: 12, color: T.ink500, marginTop: 2 }}>Plumbing NC II (TESDA)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}><Star size={12} color={T.ink500} fill={T.ink500} /><span style={{ fontSize: 12, color: T.ink500 }}>4.8 · 38 jobs done</span></div>
          </div>
        </div>
        <div style={{ background: T.well, borderRadius: 11, padding: 11, margin: '11px 0' }}>
          <div style={{ fontSize: 12.5, lineHeight: '17px', color: T.ink700 }}>{MSG}</div>
          <div style={{ fontSize: 11.5, color: T.ink500, marginTop: 6 }}>Sent just now</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 11 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Total quote: {peso(JOB.price)}</div>
          <div style={{ fontSize: 12, color: T.ink500 }}>Provider receives {peso(JOB.net)} after the {peso(JOB.fee)} platform fee</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <div style={{ display: 'flex', gap: 14 }}><span style={{ fontSize: 13.5, fontWeight: 700, color: S.link }}>View profile</span><span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink700 }}>Decline</span></div>
          <div style={{ minHeight: 40, minWidth: 84, padding: '0 20px', borderRadius: 999, background: S.primary, color: T.white, fontSize: 14, fontWeight: 700, display: 'grid', placeItems: 'center', transform: `scale(${1 - hit(f, K.cHireTap, 3) * 0.08})` }}>Hire</div>
        </div>
      </div>
    </div>
    <Tap f={f} at={K.cHireTap} x={334} y={482} />
  </div>
);

const SumRow: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 13, color: T.ink500 }}>{k}</span><span style={{ fontSize: 14, fontWeight: 700, textAlign: 'right' }}>{v}</span></div>
);
const Hire = (f: number) => {
  const p = sp(f, K.cHireSheet, { damping: 18, stiffness: 190, mass: 0.7 });
  const confirm = f >= K.cConfirmPage;
  const swap = tw(f, K.cConfirmPage, K.cConfirmPage + 8, 0, 1, expoOut);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {Proposals(f)}
      <Sheet p={p}>
        {!confirm ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Hire {P.name}</div>
            <div style={{ background: T.well, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}><SumRow k="Job" v={JOB.title} /><SumRow k="You pay" v={peso(JOB.price)} /><SumRow k="Platform fee" v={peso(JOB.fee)} /><SumRow k="Provider receives" v={peso(JOB.net)} /></div>
            <div style={{ display: 'flex', gap: 8 }}><ShieldCheck size={16} color={S.link} style={{ flexShrink: 0, marginTop: 1 }} /><div style={{ fontSize: 13, lineHeight: '18px', color: T.ink700 }}>{peso(JOB.price)} is held in escrow and released to {P.name} as soon as you confirm the job is done.</div></div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>Pay with</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, border: `1.5px solid ${S.link}`, background: S.tonal }}>
              <Radio on />
              <div style={{ width: 36, height: 36, borderRadius: 10, background: T.surface, display: 'grid', placeItems: 'center' }}><CreditCard size={18} color={T.ink700} /></div>
              <div><div style={{ fontSize: 15, fontWeight: 600, lineHeight: '20px' }}>GCash, Maya, card or bank</div><div style={{ fontSize: 13, color: T.ink500, lineHeight: '18px' }}>{peso(JOB.price)} on Xendit&apos;s secure page</div></div>
            </div>
            <Btn f={f} press={K.cContinue} label="Continue" r={16} style={{ marginTop: 4, fontWeight: 600 }} />
            <div style={{ height: 48, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, color: T.ink700, marginTop: -14 }}>Cancel</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: swap, transform: `translateX(${(1 - swap) * 40}px)` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink500, textAlign: 'center', marginTop: 4 }}>You&apos;re paying</div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.6, textAlign: 'center', marginTop: -10 }}>{peso(JOB.price)}</div>
            <div style={{ fontSize: 14, lineHeight: '19px', color: T.ink500, textAlign: 'center', marginTop: -8 }}>to hire {P.name}</div>
            <div style={{ background: T.well, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}><SumRow k="From" v="GCash, Maya, card or bank" /><SumRow k="Held for" v={JOB.title} /><SumRow k="Platform fee" v={peso(JOB.fee)} /><SumRow k="Provider receives" v={peso(JOB.net)} /></div>
            <div style={{ display: 'flex', gap: 8 }}><ShieldCheck size={16} color={S.link} style={{ flexShrink: 0, marginTop: 1 }} /><div style={{ fontSize: 13, lineHeight: '18px', color: T.ink700 }}>If the job is cancelled, the money comes back as the cancellation rules say.</div></div>
            <Btn f={f} press={K.cPay} label={`Hire and pay ${peso(JOB.price)}`} r={16} style={{ marginTop: 4, fontWeight: 600 }} />
            <div style={{ height: 48, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 600, color: S.link, marginTop: -14 }}>Back</div>
          </div>
        )}
      </Sheet>
      <Tap f={f} at={K.cContinue} x={205} y={814} />
      <Tap f={f} at={K.cPay} x={205} y={814} />
    </div>
  );
};

// ── Chat (ChatThread), shared by both phones ────────────────────────────────
export const ChatScreen = (f: number, me: 'c' | 'p') => {
  const other = me === 'c' ? P : C;
  const tone = me === 'p' ? 'provider' : 'client';
  const p = pal(tone);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 152, padding: '96px 20px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, background: T.surface, borderBottom: `1px solid ${T.line}`, zIndex: 3 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center', fontSize: 18, color: T.ink700 }}>←</div>
        <Avatar ini={other.ini} size={40} tone={tone} strong fs={14} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 800 }}>{other.name}</div><div style={{ fontSize: 12.5, fontWeight: 500, color: T.ink500, marginTop: 1 }}>{JOB.title} · Booked</div></div>
        <div style={{ fontSize: 14, fontWeight: 700, color: p.link, paddingTop: 10 }}>View job</div>
      </div>
      <div style={{ position: 'absolute', top: 160, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 14, background: p.tonal }}>
        <ShieldCheck size={16} color={p.deep} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, lineHeight: '17px', color: p.deep }}>Stay protected</div><div style={{ fontSize: 12, lineHeight: '16px', color: T.ink700 }}>Keep payments in TaskBuddy. Money paid outside the app isn&apos;t protected, and TaskBuddy can&apos;t refund it.</div></div>
        <div style={{ fontSize: 13, fontWeight: 700, color: p.link }}>Got it</div>
      </div>
      <div style={{ position: 'absolute', top: 236, left: 24, right: 24, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: T.ink500 }}>{me === 'c' ? `You hired ${P.name} · ${peso(JOB.price)} held safely` : `${C.name} hired you · ${peso(JOB.price)} held safely`}</div>
      <div style={{ position: 'absolute', top: 272, left: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CHAT.map((m, i) => {
          const mine = m.from === me;
          const at = mine ? m.at : m.at + 8;
          if (f < at) return null;
          const s = sp(f, at, { damping: 13, stiffness: 240, mass: 0.6 });
          return (
            <div key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%', padding: '10px 14px', borderRadius: mine ? '16px 4px 16px 16px' : '4px 16px 16px 16px', background: mine ? p.primary : T.surface, border: mine ? undefined : `1px solid ${T.ink100}`, color: mine ? T.white : T.ink900, fontSize: 14.5, lineHeight: '20px', transform: `scale(${s})`, transformOrigin: mine ? '100% 0%' : '0% 0%' }}>
              {m.t}
              <div style={{ fontSize: 11, color: mine ? 'rgba(255,255,255,0.7)' : T.ink300, marginTop: 4, textAlign: mine ? 'right' : 'left' }}>9:4{i + 2} AM</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 14px 44px', display: 'flex', alignItems: 'center', gap: 8, background: T.surface, borderTop: `1px solid ${T.line}` }}>
        <div style={{ width: 40, height: 40, borderRadius: 20, background: p.tonal, display: 'grid', placeItems: 'center' }}><Camera size={18} color={p.link} /></div>
        <div style={{ flex: 1, height: 44, borderRadius: 14, border: `1px solid ${T.field}`, display: 'flex', alignItems: 'center', padding: '0 13px', fontSize: 14.5, color: T.ink500 }}>Message…</div>
        <div style={{ width: 42, height: 42, borderRadius: 21, background: p.primary, opacity: 0.4, display: 'grid', placeItems: 'center' }}><ArrowRight size={18} color={T.white} /></div>
        <div style={{ position: 'absolute', bottom: 8, left: '50%', width: 106, height: 4, marginLeft: -53, borderRadius: 4, background: T.ink700 }} />
      </div>
    </div>
  );
};

// ── Review (HOLeaveReviewScreen) ────────────────────────────────────────────
const TAGS = ['On time', 'Friendly', 'Clean work', 'Fair price', 'Explained clearly'];
const Review = (f: number) => {
  const n = K.stars.filter((a) => f >= a).length;
  const sent = f >= K.submit + 2;
  const text = 'Fast, clean and friendly. Highly recommended!';
  const typedText = typed(f, K.typeA, K.typeB, text);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <AppBar title="Rate your provider" white y={110} size={19.5} />
      <div style={{ position: 'absolute', top: 162, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Avatar ini={P.ini} size={80} fs={24} />
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>{P.name}</div>
        <div style={{ fontSize: 13, color: T.ink500, marginTop: 6 }}>{JOB.title}</div>
        <div style={{ display: 'flex', gap: 11, marginTop: 22 }}>
          {K.stars.map((a, i) => <div key={i} style={{ transform: `scale(${f >= a ? 1 + hit(f, a, 4) * 0.45 : 1}) rotate(${f >= a ? hit(f, a, 5) * 18 : 0}deg)` }}><Star size={40} color={f >= a ? T.amber : T.ink300} fill={f >= a ? T.amber : 'none'} strokeWidth={1.6} /></div>)}
        </div>
        <div style={{ fontSize: 15, fontWeight: n ? 700 : 400, color: n ? T.ink900 : T.ink500, marginTop: 14 }}>{n === 0 ? 'Tap a star to rate' : ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'][n - 1]}</div>
      </div>
      <div style={{ position: 'absolute', top: 420, left: 20, right: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '18px', color: T.ink700 }}>What went well?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {TAGS.map((l, i) => <Pill key={l} label={l} on={(i === 0 && f >= K.chip1) || (i === 1 && f >= K.chip2)} scale={1 + (i === 0 ? hit(f, K.chip1, 4) : i === 1 ? hit(f, K.chip2, 4) : 0) * 0.1} />)}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink700, marginTop: 22, marginBottom: 6 }}>Add a comment (optional)</div>
        <div style={{ height: 96, borderRadius: 12, border: f >= K.typeA && f < K.typeB + 6 ? `2px solid ${S.link}` : `1px solid ${T.field}`, background: T.surface, padding: '12px 14px', fontSize: 15, lineHeight: '21px' }}>
          {f < K.typeA ? <span style={{ color: T.ink500 }}>Tell others about the job</span> : typedText}<Caret f={f} until={K.typeB + 6} />
        </div>
        <div style={{ fontSize: 12.5, color: T.ink500, marginTop: 8 }}>{typedText.length}/500</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '12px 14px', borderRadius: 14, background: S.tonal, color: S.deep, fontSize: 13 }}><ShieldCheck size={18} /> Your review is public.</div>
      </div>
      <Footer>
        <Btn f={f} press={K.submit} off={n === 0} h={46} r={16} size={14} label={sent ? <><Check size={16} strokeWidth={3} /> Review submitted</> : 'Submit review'} style={{ flex: 1, fontWeight: 600, background: sent ? T.okSolid : undefined }} />
      </Footer>
      {K.stars.map((a, i) => <Tap key={i} f={f} at={a} x={102 + i * 51} y={346} from={i ? [-30, 10] : [60, 90]} />)}
      <Tap f={f} at={K.chip1} x={58} y={468} />
      <Tap f={f} at={K.chip2} x={140} y={468} />
      <Tap f={f} at={K.submit} x={205} y={863} />
    </div>
  );
};

export const bg = (list: Scr[]) => list.map((s) => ({ ...s, render: (g: number) => <div style={{ position: 'absolute', inset: 0, background: T.canvas }}>{s.render(g)}</div> }));

export const ClientPhone: React.FC<{ f: number }> = ({ f }) => (
  <>
    <Screens
      f={f}
      list={bg([
        { at: 0, render: Home },
        { at: K.cStep1, render: Post1, kind: 'up' },
        { at: K.cStep2, render: Post2 },
        { at: K.cStep3, render: Post3 },
        { at: K.cStep4, render: Post4 },
        { at: K.cStep5, render: Post5 },
        { at: K.cWaiting, render: (g) => Detail(g, 'open'), kind: 'fade' },
        { at: K.cProps, render: Proposals },
        { at: K.cHireSheet, render: Hire, kind: 'none' },
        { at: K.cBooked, render: (g) => Detail(g, 'booked'), kind: 'fade' },
        { at: K.chat, render: (g) => ChatScreen(g, 'c') },
        { at: K.work, render: (g) => Detail(g, 'working') },
        { at: K.paid, render: (g) => Detail(g, 'done'), kind: 'fade' },
        { at: K.review, render: Review },
      ])}
    />
    <StatusBar />
  </>
);
