import React from 'react';
import { ArrowLeft, Check, ChevronDown, Eye, House, MailCheck, MapPin, Sparkles, Wrench, Brush, Hammer } from 'lucide-react';
import { Screens, Tap, pop } from '../v2/kit';
import { hit, inOut, sp, tw } from '../motion';
import { Btn, StatusBar, T, pal, type Tone } from './ui';
import { bg } from './ClientPhone';

// Sign-up (RegisterScreen: role → details → email code) and the first welcome
// slide (tourContent introCards). Local timeline, 30 fps.
export const SU = {
  pick: 16, cont: 32, details: 38,
  nameA: 44, nameB: 58, mailA: 62, mailB: 80, passA: 84, passB: 96, confA: 100, confB: 110,
  cat: 116, catPick: 128, scroll: 134, agree1: 152, agree2: 160, create: 172,
  code: 178, codeA: 192, codeB: 207, verify: 214, welcome: 220, end: 290,
};
/** Tap frames in the signup flow, so guides can play taps at real speed. */
export const suTyping: [number, number][] = [[SU.nameA, SU.nameB], [SU.mailA, SU.mailB], [SU.passA, SU.passB], [SU.confA, SU.confB], [SU.codeA, SU.codeB]];
export const suTaps = (role: 'client' | 'provider') => [SU.pick, SU.cont, ...(role === 'provider' ? [SU.cat, SU.catPick] : []), SU.agree1, SU.agree2, SU.create, SU.codeA - 2, SU.verify];

const typed = (f: number, a: number, b: number, s: string) => s.slice(0, Math.floor(tw(f, a, b, 0, s.length, (t) => t)));
const S = pal('client');

const Header: React.FC<{ n: number; label: string }> = ({ n, label }) => (
  <>
    <div style={{ position: 'absolute', top: 106, left: 20, right: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 20, background: T.surface, border: `1px solid ${T.line}`, display: 'grid', placeItems: 'center' }}><ArrowLeft size={20} color={T.ink800} /></div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Create account</div>
    </div>
    <div style={{ position: 'absolute', top: 162, left: 20, right: 20 }}>
      <div style={{ display: 'flex', gap: 6 }}>{[1, 2].map((i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= n ? S.primary : T.ink100 }} />)}</div>
      <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: S.link }}>{`STEP ${n} OF 2 · ${label}`}</div>
    </div>
  </>
);

const Role = (role: Tone) => (f: number) => {
  const picked = f >= SU.pick;
  const cards = [
    { k: 'client', I: House, title: 'I need help at home', body: 'Post jobs, compare proposals, hire and pay safely.', tag: 'Client', tile: S.primary, tagColor: S.link },
    { k: 'provider', I: Wrench, title: 'I want to work', body: 'Find jobs near you, send proposals and get paid.', tag: 'Service provider', tile: T.navy, tagColor: T.ink900 },
  ];
  const idx = role === 'client' ? 0 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Header n={1} label="ROLE" />
      <div style={{ position: 'absolute', top: 214, left: 20, right: 20 }}>
        <div style={{ fontSize: 25, fontWeight: 800, lineHeight: '31px' }}>How will you use TaskBuddy?</div>
        <div style={{ fontSize: 15.5, color: T.ink500, marginTop: 8 }}>You can&apos;t switch later, so pick the one that fits.</div>
      </div>
      <div style={{ position: 'absolute', top: 322, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cards.map((c, i) => {
          const sel = picked && i === idx;
          return (
            <div key={c.k} style={{ position: 'relative', padding: 16, borderRadius: 18, border: sel ? `2px solid ${S.primary}` : `1px solid ${T.line}`, background: T.surface, transform: `scale(${1 + (i === idx ? hit(f, SU.pick, 4) * 0.03 : 0)})` }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: c.tile, display: 'grid', placeItems: 'center' }}><c.I size={22} color={T.white} /></div>
              <div style={{ position: 'absolute', top: 16, right: 16, width: 24, height: 24, borderRadius: 12, border: sel ? undefined : `2px solid ${T.ink300}`, background: sel ? S.primary : T.surface, display: 'grid', placeItems: 'center' }}>{sel && <Check size={14} color={T.white} strokeWidth={3} />}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 14 }}>{c.title}</div>
              <div style={{ fontSize: 14.5, lineHeight: '21px', color: T.ink500, marginTop: 6 }}>{c.body}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.tagColor, marginTop: 10 }}>{c.tag}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 66 }}><Btn f={f} press={SU.cont} off={!picked} label="Continue" h={56} r={16} size={18} /></div>
      <Tap f={f} at={SU.pick} x={205} y={role === 'client' ? 410 : 620} />
      <Tap f={f} at={SU.cont} x={205} y={820} />
    </div>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode; placeholder: string; on?: boolean; eye?: boolean; chevron?: boolean }> = ({ label, value, placeholder, on, eye, chevron }) => (
  <div>
    <div style={{ fontSize: 14.5, fontWeight: 600, color: T.ink700, marginBottom: 8 }}>{label} <span style={{ color: T.danger }}>*</span></div>
    <div style={{ height: 48, borderRadius: 12, border: on ? `2px solid ${S.link}` : `1px solid ${T.field}`, background: T.surface, display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 16, color: value ? T.ink900 : T.ink500, gap: 8 }}>
      <span style={{ flex: 1 }}>{value || placeholder}</span>
      {eye && <Eye size={18} color={T.ink500} />}
      {chevron && <ChevronDown size={18} color={T.ink500} />}
    </div>
  </div>
);

const Details = (role: Tone) => (f: number) => {
  const name = role === 'client' ? 'Ana Reyes' : 'Mark Santos';
  const mail = role === 'client' ? 'ana.reyes@example.com' : 'mark.santos@example.com';
  const pass = '•'.repeat(Math.floor(tw(f, SU.passA, SU.passB, 0, 10)));
  const conf = '•'.repeat(Math.floor(tw(f, SU.confA, SU.confB, 0, 10)));
  const strong = f >= SU.passB;
  const y = role === 'client' ? tw(f, SU.scroll, SU.scroll + 16, 0, 330, inOut) : tw(f, SU.confB - 8, SU.confB + 4, 0, 230, inOut) + tw(f, SU.scroll, SU.scroll + 16, 0, 260, inOut);
  const catOpen = role === 'provider' && f >= SU.cat && f < SU.catPick + 2;
  const cat = role === 'provider' && f >= SU.catPick;
  const box = (on: boolean, at: number) => (
    <div style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? S.primary : T.field}`, background: on ? S.primary : T.surface, display: 'grid', placeItems: 'center', flexShrink: 0, transform: `scale(${1 + hit(f, at, 4) * 0.3})` }}>{on && <Check size={14} color={T.white} strokeWidth={3} />}</div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${-y}px)` }}>
        <div style={{ position: 'absolute', top: 214, left: 16, right: 16, background: T.surface, borderRadius: 22, padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 1px 3px rgba(15,23,42,0.08)' }}>
          <div><div style={{ fontSize: 30, fontWeight: 800 }}>Create your account</div><div style={{ fontSize: 16, color: T.ink700, marginTop: 6 }}>Let&apos;s get started!</div></div>
          <Field label="Full Name" placeholder="Alex Chen" value={typed(f, SU.nameA, SU.nameB, name)} on={f >= SU.nameA && f < SU.nameB + 2} />
          <Field label="Email Address" placeholder="alex@example.com" value={typed(f, SU.mailA, SU.mailB, mail)} on={f >= SU.mailA && f < SU.mailB + 2} />
          <div>
            <Field label="Password" placeholder="8–72 characters, letter and number" value={pass} on={f >= SU.passA && f < SU.passB + 2} eye />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {['8–72 characters', 'A letter', 'A number'].map((t) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: strong ? T.okText : T.ink700 }}>
                  {strong ? <div style={{ width: 16, height: 16, borderRadius: 8, background: T.okSolid, display: 'grid', placeItems: 'center' }}><Check size={10} color={T.white} strokeWidth={3} /></div> : <div style={{ width: 16, height: 16, borderRadius: 8, border: `1.5px solid ${T.ink500}` }} />}{t}
                </div>
              ))}
            </div>
          </div>
          <Field label="Confirm Password" placeholder="Re-enter your password" value={conf} on={f >= SU.confA && f < SU.confB + 2} eye />
          {role === 'provider' && (
            <div style={{ position: 'relative' }}>
              <Field label="Skill Category" placeholder="Select your skill…" value={cat ? 'Plumbing' : ''} on={catOpen} chevron />
              {catOpen && (
                <div style={{ position: 'absolute', top: 84, left: 0, right: 0, borderRadius: 12, border: `1px solid ${T.line}`, background: T.surface, boxShadow: '0 8px 20px rgba(15,23,42,0.12)', zIndex: 3, overflow: 'hidden', opacity: tw(f, SU.cat, SU.cat + 4) }}>
                  {['Cleaning', 'Handyman', 'Manicure', 'Pedicure', 'Plumbing'].map((c) => <div key={c} style={{ padding: '11px 16px', fontSize: 15, background: c === 'Plumbing' && f >= SU.catPick - 3 ? S.tonal : T.surface }}>{c}</div>)}
                </div>
              )}
            </div>
          )}
          <div style={{ height: 1, background: T.line }} />
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.8 }}>CONSENTS &amp; AGREEMENTS</div>
          {[
            [<>I agree to the <span style={{ color: S.link, fontWeight: 700, textDecoration: 'underline' }}>Terms &amp; Conditions</span> and <span style={{ color: S.link, fontWeight: 700, textDecoration: 'underline' }}>Privacy Policy</span><span style={{ color: T.danger }}>*</span></>, SU.agree1],
            [<>I consent to the collection and use of my personal data to provide and improve TaskBuddy services.<span style={{ color: T.danger }}>*</span></>, SU.agree2],
          ].map(([label, at]: any, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 14, border: `1px solid ${T.line}`, fontSize: 15, lineHeight: '21px' }}>{box(f >= at, at)}<div>{label}</div></div>
          ))}
          <Btn f={f} press={SU.create} label="Create account" h={54} r={14} size={17} />
        </div>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 206, background: T.canvas }} />
      <Header n={2} label="DETAILS" />
      {role === 'provider' && <Tap f={f} at={SU.cat} x={205} y={572} />}
      {role === 'provider' && <Tap f={f} at={SU.catPick} x={120} y={792} />}
      <Tap f={f} at={SU.agree1} x={64} y={role === 'client' ? 505 : 433} />
      <Tap f={f} at={SU.agree2} x={64} y={role === 'client' ? 597 : 527} />
      <Tap f={f} at={SU.create} x={205} y={role === 'client' ? 710 : 640} />
    </div>
  );
};

const Code = (role: Tone) => (f: number) => {
  const mail = role === 'client' ? 'ana.reyes@example.com' : 'mark.santos@example.com';
  const code = typed(f, SU.codeA, SU.codeB, '482913');
  const ready = code.length === 6;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 150, left: 16, right: 16, background: T.surface, borderRadius: 22, padding: '30px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.08)' }}>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: S.tonal, display: 'grid', placeItems: 'center' }}><MailCheck size={35} color={S.link} /></div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>Check your email</div>
        <div style={{ fontSize: 15.5, lineHeight: '22px', color: T.ink700, textAlign: 'center' }}>We sent a 6-digit code to <b style={{ color: T.ink900 }}>{mail}</b>. Enter it below to finish creating your account.</div>
        <div style={{ alignSelf: 'stretch', height: 60, borderRadius: 14, border: code && !ready ? `2px solid ${S.link}` : `1px solid ${T.field}`, display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 700, letterSpacing: 12, color: code ? T.ink900 : T.ink300 }}>{code || '000000'}</div>
        <div style={{ alignSelf: 'stretch' }}><Btn f={f} press={SU.verify} off={!ready} label="Verify Email" h={52} r={14} size={16} /></div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: S.link }}>Didn&apos;t get it? Resend code</div>
        <div style={{ fontSize: 14.5, color: T.ink500 }}>Go to Sign In</div>
      </div>
      <Tap f={f} at={SU.codeA - 2} x={205} y={428} />
      <Tap f={f} at={SU.verify} x={205} y={500} />
    </div>
  );
};

const Welcome = (role: Tone) => (f: number) => {
  const p = pal(role);
  const art = role === 'client'
    ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: 300 }}>
        {[['Plumbing', Wrench], ['Cleaning', Brush], ['Handyman', Hammer]].map(([l, I]: any, i) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 4px 4px', borderRadius: 999, background: T.surface, boxShadow: '0 1px 3px rgba(15,23,42,0.12)', transform: `scale(${pop(f, SU.welcome + 6 + i * 4)})` }}>
            <div style={{ width: 26, height: 26, borderRadius: 13, background: p.tonal, display: 'grid', placeItems: 'center' }}><I size={14} color={p.link} /></div><span style={{ fontSize: 13, fontWeight: 600, color: T.ink700 }}>{l}</span>
          </div>
        ))}
      </div>
    ) : (
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[Wrench, Sparkles].map((I, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, border: `1px solid ${T.line}`, background: T.surface, boxShadow: '0 1px 3px rgba(15,23,42,0.1)', transform: `translateY(${(1 - sp(f, SU.welcome + 6 + i * 5)) * 30}px)`, opacity: tw(f, SU.welcome + 6 + i * 5, SU.welcome + 12 + i * 5) }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: p.tonal, display: 'grid', placeItems: 'center' }}><I size={18} color={p.primary} /></div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}><div style={{ height: 8, width: i ? '58%' : '70%', borderRadius: 4, background: T.ink100 }} /><div style={{ height: 8, width: '40%', borderRadius: 4, background: T.ink100 }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 999, background: p.tonal }}><MapPin size={12} color={p.deep} /><div style={{ width: 22, height: 6, borderRadius: 3, background: T.field }} /></div>
          </div>
        ))}
      </div>
    );
  return (
    <div style={{ position: 'absolute', inset: 0, background: T.surface }}>
      <div style={{ position: 'absolute', top: 108, right: 22, padding: '6px 12px', fontSize: 15, fontWeight: 600, color: T.ink700 }}>Skip</div>
      <div style={{ position: 'absolute', top: 260, left: 26, right: 26, height: 280, borderRadius: 26, background: p.tonal, display: 'grid', placeItems: 'center' }}>{art}</div>
      <div style={{ position: 'absolute', top: 568, left: 24, right: 24, textAlign: 'center', opacity: tw(f, SU.welcome + 2, SU.welcome + 10), transform: `translateY(${tw(f, SU.welcome + 2, SU.welcome + 14, 14, 0)}px)` }}>
        <div style={{ fontSize: 25, fontWeight: 800, lineHeight: '31px' }}>{role === 'client' ? 'Hi Ana, help is close by' : "Hi Mark, let's get you hired"}</div>
        <div style={{ fontSize: 16.5, lineHeight: '23px', color: T.ink500, marginTop: 12 }}>{role === 'client' ? 'Book trusted local providers for plumbing, cleaning, repairs and more.' : 'Find jobs near you in the services you offer.'}</div>
      </div>
      <div style={{ position: 'absolute', top: 784, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}><div style={{ width: 22, height: 7, borderRadius: 4, background: p.primary }} /><div style={{ width: 7, height: 7, borderRadius: 4, background: T.ink100 }} /><div style={{ width: 7, height: 7, borderRadius: 4, background: T.ink100 }} /></div>
      <div style={{ position: 'absolute', left: 24, right: 24, top: 812 }}><Btn tone={role} label="Next" h={54} r={14} size={17} /></div>
    </div>
  );
};

export const SignupPhone: React.FC<{ f: number; role: Tone }> = ({ f, role }) => (
  <>
    <Screens f={f} list={bg([
      { at: 0, render: Role(role) },
      { at: SU.details, render: Details(role) },
      { at: SU.code, render: Code(role) },
      { at: SU.welcome, render: Welcome(role), kind: 'fade' },
    ])} />
    <StatusBar />
  </>
);
