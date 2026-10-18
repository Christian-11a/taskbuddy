import React from 'react';
import { ArrowLeft, BadgeCheck, Bell, Calendar, Check, IdCard, Inbox, MapPin, ScanFace, Search, ShieldCheck, Star, TriangleAlert, UserRound, Wallet, Banknote, Send } from 'lucide-react';
import { A, Avatar, Btn, Card, Caret, Pill, Screens, SPNav, StatusBar, Tap, expoOut, hit, pop, sp, tw, typedRange } from './kit';
import { HOMEOWNER as H, JOB, PROVIDER as P } from './timeline';
import { Chat, JobCardUI } from './HOScreens';
import { countUp, peso } from '../components/ui';

const TopBar: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ position: 'absolute', top: 44, left: 0, right: 0, height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', background: A.white, borderBottom: `1px solid ${A.hairline}`, zIndex: 4 }}>
    <div style={{ width: 36, height: 36, borderRadius: 11, background: A.well, display: 'grid', placeItems: 'center' }}><ArrowLeft size={19} color={A.ink700} /></div>
    <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
  </div>
);

const FEED = [
  { title: 'Aircon Cleaning', price: 1200, addr: 'Brgy. Sabang, Lipa City', svc: 'Cleaning' },
  { title: 'Install Ceiling Fan', price: 800, addr: 'Brgy. Marawoy, Lipa City', svc: 'Handyman' },
  { title: 'Deep Clean Condo', price: 2000, addr: 'Brgy. Tambo, Lipa City', svc: 'Cleaning' },
];

const Home = (f: number, mode: 'unverified' | 'feed' | 'booking') => {
  const landed = f >= 668;
  const open = mode === 'unverified' ? 4 : landed ? 5 : 4;
  const potential = 4000 + (landed ? JOB.budget : 0);
  const req = mode === 'booking';
  const accepted = f >= 1092;
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <div style={{ background: A.spHero, padding: '58px 20px 18px', borderRadius: '0 0 26px 26px', color: A.white }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14.5, fontWeight: 500 }}>Hello, {P.first}</div>
            <div style={{ fontSize: 24.5, fontWeight: 800, marginTop: 3 }}>Jobs Near You</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', position: 'relative' }}>
              <Bell size={20} />
              {req && f >= 1045 && <div style={{ position: 'absolute', top: -5, right: -4, width: 16, height: 16, borderRadius: 8, background: A.red500, fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', transform: `scale(${pop(f, 1045)})` }}>1</div>}
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.14)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14.5 }}>{P.ini}</div>
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.8)', marginTop: 10 }}><b style={{ color: A.white }}>{open}</b> jobs available around your service area</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '7px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.1)', fontSize: 13 }}><MapPin size={14} /> Lipa City · within 10 km</div>
        <div style={{ display: 'flex', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {[
            { I: Search, l: 'Open', v: String(open), c: 'rgba(255,255,255,0.75)' },
            { I: TriangleAlert, l: 'Urgent', v: String(mode !== 'unverified' && landed ? 2 : 1), c: '#fca5a5' },
            { I: Wallet, l: 'Potential', v: peso(potential).replace('.00', ''), c: 'rgba(255,255,255,0.75)' },
          ].map((it, i) => (
            <div key={i} style={{ flex: 1, borderLeft: i ? '1px solid rgba(255,255,255,0.12)' : undefined, paddingLeft: i ? 12 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}><it.I size={13} color={it.c} />{it.l}</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, transform: `scale(${1 + hit(f, 668, 5) * 0.3})`, transformOrigin: 'left center' }}>{it.v}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '14px 16px' }}>
        {mode === 'unverified' && (
          <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', background: '#f2fbfd', border: `1px solid ${A.cyan100}`, borderRadius: 16, padding: 14, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: A.white, display: 'grid', placeItems: 'center' }}><ShieldCheck size={19} color={A.cyan700} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>Verification required to apply</div>
              <div style={{ fontSize: 12.5, color: A.ink500, marginTop: 3, lineHeight: '16px' }}>Verify your identity before you can send proposals or be hired.</div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: A.cyan700, transform: `scale(${1 - hit(f, 250, 3) * 0.1})` }}>Verify now</div>
          </div>
        )}
        {req && f >= 1045 && (
          <div style={{ marginBottom: 12, transform: `translateY(${(1 - sp(f, 1045, { damping: 14, stiffness: 220, mass: 0.6 })) * -120}px)`, opacity: tw(f, 1045, 1050) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: A.cyan700, marginBottom: 8 }}><Inbox size={16} /> Booking Request <span style={{ background: A.cyan700, color: A.white, borderRadius: 9, padding: '1px 7px', fontSize: 11.5 }}>1</span></div>
            <Card style={{ boxShadow: `0 0 0 3px ${accepted ? A.green500 : A.cyan500}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{JOB.title}</div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{peso(JOB.offer)}</div>
              </div>
              <div style={{ fontSize: 12.5, color: A.ink500, marginTop: 4 }}>{H.name} hired you · Tomorrow, 9:00 AM</div>
              {accepted ? (
                <div style={{ marginTop: 11, transform: `scale(${pop(f, 1094)})` }}><Pill label="You've been hired for this job." color={A.green600} bg="#dcfce7" size={12.5} /></div>
              ) : (
                <div style={{ display: 'flex', gap: 9, marginTop: 11 }}>
                  <Btn f={f} label="Decline" bg={A.white} color={A.ink700} h={40} style={{ flex: 1, border: `1.5px solid ${A.line}` }} />
                  <Btn f={f} press={1090} label="Accept" h={40} style={{ flex: 1 }} />
                </div>
              )}
            </Card>
          </div>
        )}
        {mode === 'feed' && landed && (
          <div style={{ marginBottom: 10, position: 'relative', transform: `scale(${1 + hit(f, 668, 6) * 0.05})` }}>
            <JobCardUI status={{ label: 'Open', color: '#F59E0B', bg: '#FFF7ED' }} urgent glow={Math.max(0.3, hit(f, 668, 20))} foot="Just now · 1.2 km away" />
            <div style={{ position: 'absolute', top: -8, right: 12, transform: `scale(${pop(f, 670)})` }}><Pill label="NEW" color={A.white} bg={A.cyan600} size={11} /></div>
          </div>
        )}
        {FEED.slice(0, req ? 2 : mode === 'feed' && landed ? 2 : 3).map((j, i) => (
          <div key={j.title} style={{ marginBottom: 10, transform: `translateY(${mode === 'feed' ? (1 - tw(f, 668, 680, 0, 1, expoOut)) * -30 : 0}px)` }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><div style={{ fontSize: 15, fontWeight: 800 }}>{j.title}</div><div style={{ fontSize: 15, fontWeight: 800 }}>{peso(j.price)}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: A.ink400, fontSize: 12.5 }}><MapPin size={13} /> {j.addr}</div>
            </Card>
          </div>
        ))}
      </div>
      <SPNav active={0} />
      <Tap f={f} at={250} x={300} y={330} />
      <Tap f={f} at={712} x={180} y={360} />
      <Tap f={f} at={1090} x={262} y={430} />
    </div>
  );
};

// ── Verification ────────────────────────────────────────────────────────────
const Verify = (f: number) => {
  const idOk = f >= 300, faceOk = f >= 346, done = f >= 386;
  const stage = f < 304 ? 0 : f < 350 ? 1 : 2;
  const scan = ((f - 262) % 30) / 30;
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <TopBar title="Get Verified" />
      <div style={{ position: 'absolute', top: 112, left: 20, right: 20, height: 250, borderRadius: 22, background: '#0f1b26', overflow: 'hidden' }}>
        {stage === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 250, height: 156, borderRadius: 14, background: 'linear-gradient(135deg, #e8f4ff, #cfe3f5)', padding: 14, transform: `translateY(${(1 - sp(f, 262)) * 260}px) rotate(${(1 - sp(f, 262)) * -14}deg)`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: A.cyan900, letterSpacing: 0.5 }}>PHILSYS · NATIONAL ID</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <div style={{ width: 62, height: 76, borderRadius: 8, background: '#9fb8cc', display: 'grid', placeItems: 'center' }}><UserRound size={40} color="#e8f4ff" /></div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                  {[1, 0.8, 0.9, 0.6].map((w, i) => <div key={i} style={{ height: 8, width: `${w * 100}%`, borderRadius: 4, background: '#9fb8cc' }} />)}
                </div>
              </div>
              {f < 300 && <div style={{ position: 'absolute', left: 0, right: 0, top: scan * 156, height: 3, background: A.cyan500, boxShadow: `0 0 16px 4px ${A.cyan500}` }} />}
              {idOk && <div style={{ position: 'absolute', inset: 0, background: 'rgba(34,197,94,0.25)', display: 'grid', placeItems: 'center' }}><div style={{ transform: `scale(${pop(f, 300)})`, width: 54, height: 54, borderRadius: 54, background: A.green500, display: 'grid', placeItems: 'center' }}><Check size={32} color={A.white} strokeWidth={3} /></div></div>}
            </div>
          </div>
        )}
        {stage === 1 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{ position: 'relative', width: 170, height: 170, transform: `scale(${sp(f, 304)})` }}>
              <svg width={170} height={170} style={{ position: 'absolute' }}>
                <circle cx={85} cy={85} r={78} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={6} />
                <circle cx={85} cy={85} r={78} fill="none" stroke={faceOk ? A.green500 : A.cyan500} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tw(f, 306, 344, 0, 1, (t) => t)} transform="rotate(-90 85 85)" />
              </svg>
              <div style={{ position: 'absolute', inset: 16, borderRadius: 999, background: '#223445', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                <ScanFace size={86} color={faceOk ? A.green500 : A.cyan200} strokeWidth={1.4} />
                {!faceOk && <div style={{ position: 'absolute', left: 0, right: 0, top: `${50 + Math.sin(f / 4) * 45}%`, height: 2, background: A.cyan500, boxShadow: `0 0 12px 3px ${A.cyan500}` }} />}
              </div>
            </div>
          </div>
        )}
        {stage === 2 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', color: A.white }}>
            {done ? (
              <div>
                <div style={{ transform: `scale(${f >= 386 ? 1 + (1 - sp(f, 386, { damping: 10, stiffness: 300, mass: 0.6 })) * 1.5 : 0}) rotate(${(1 - sp(f, 386)) * -30}deg)` }}><BadgeCheck size={96} color={A.cyan500} fill="#0f1b26" strokeWidth={1.8} /></div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, opacity: tw(f, 390, 396) }}>You&apos;re verified</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: A.cyan200, marginBottom: 12 }}>Automated Check</div>
                <div style={{ width: 200, height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${tw(f, 352, 384, 0, 100, (t) => t)}%`, background: A.cyan500 }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', top: 380, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { I: IdCard, t: 'Government ID', s: idOk ? 'Government ID ready' : 'PhilSys (National ID)', ok: idOk, act: stage === 0 },
          { I: ScanFace, t: 'Face Scan', s: faceOk ? 'Face scan ready' : 'Take a selfie', ok: faceOk, act: stage === 1 },
          { I: ShieldCheck, t: 'Automated Check', s: done ? "You're verified" : stage === 2 ? 'Pending verification' : 'After upload', ok: done, act: stage === 2 },
        ].map((r, i) => (
          <Card key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 13, border: `1.5px solid ${r.act && !r.ok ? A.cyan500 : r.ok ? '#A7F3D0' : A.line}`, background: r.ok ? '#ECFDF5' : A.white }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: r.ok ? A.green500 : A.well, display: 'grid', placeItems: 'center', transform: `scale(${1 + hit(f, [300, 346, 386][i], 4) * 0.25})` }}>
              {r.ok ? <Check size={20} color={A.white} strokeWidth={3} /> : <r.I size={19} color={A.cyan700} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>{r.t}</div>
              <div style={{ fontSize: 12.5, color: r.ok ? A.green600 : A.ink500, fontWeight: 600 }}>{r.s}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ── Job detail + proposal ───────────────────────────────────────────────────
const Detail = (f: number, mode: 'apply' | 'sent' | 'progress') => {
  const doneTap = f >= 1298;
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <TopBar title="Job Details" />
      <div style={{ padding: '112px 20px 0' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {mode === 'progress' ? <Pill label={doneTap ? 'Completed' : 'In Progress'} color={doneTap ? '#3B82F6' : '#22C55E'} bg={doneTap ? '#EFF6FF' : '#F0FDF4'} dot size={12.5} /> : <Pill label="URGENT" color="#B91C1C" bg="#FEF2F2" size={12.5} />}
          <Pill label={JOB.service} color={A.cyan700} bg={A.cyan50} size={12.5} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3 }}>{JOB.title}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: A.cyan800, marginTop: 6 }}>{peso(mode === 'progress' ? JOB.offer : JOB.budget)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {[[MapPin, 'Location', '1.2 km away'], [Calendar, 'Schedule', 'Tomorrow · 9 AM']].map(([I, k, v]: any) => (
            <div key={k} style={{ flex: 1, display: 'flex', gap: 8, padding: 10, background: '#f5f8fa', borderRadius: 12 }}>
              <I size={16} color={A.cyan700} />
              <div><div style={{ fontSize: 11.5, color: A.ink500, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 800 }}>{v}</div></div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, margin: '18px 0 8px' }}>What Needs To Be Done</div>
        <div style={{ fontSize: 13.5, color: A.ink700, lineHeight: '19px' }}>Water is leaking under the sink cabinet.</div>
        <div style={{ fontSize: 12.5, color: A.ink500, marginTop: 8 }}>Posted by {H.name}</div>
        <div style={{ marginTop: 22 }}>
          {mode === 'apply' && <Btn f={f} press={766} label="Submit Proposal" />}
          {mode === 'sent' && (
            <div style={{ transform: `scale(${pop(f, 858)})` }}>
              <div style={{ border: '1.5px solid #fde68a', background: '#fffbeb', color: A.amber700, borderRadius: 13, padding: 13, fontSize: 14.5, fontWeight: 800, textAlign: 'center' }}>Proposal sent · {peso(JOB.offer)}</div>
            </div>
          )}
          {mode === 'progress' && (doneTap ? (
            <div style={{ transform: `scale(${pop(f, 1300)})`, border: `1.5px solid ${A.cyan100}`, background: '#f2fbfd', color: A.cyan700, borderRadius: 13, padding: 13, fontSize: 14, fontWeight: 800, textAlign: 'center' }}>Waiting for client to confirm completion</div>
          ) : <Btn f={f} press={1296} label={<><Check size={18} strokeWidth={3} /> Job Completed</>} bg={A.green500} />)}
        </div>
      </div>
      <Tap f={f} at={766} x={180} y={488} />
      <Tap f={f} at={1296} x={180} y={488} />
    </div>
  );
};

const ProposalSheet = (f: number) => {
  const s = sp(f, 772, { damping: 18, stiffness: 200, mass: 0.7 });
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {Detail(f, 'apply')}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(15,23,42,${0.45 * s})` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: A.white, borderRadius: '24px 24px 0 0', padding: 22, transform: `translateY(${(1 - s) * 520}px)` }}>
        <div style={{ width: 40, height: 5, borderRadius: 5, background: A.ink100, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 14 }}>Your proposal</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: A.ink700, marginBottom: 6 }}>Your price</div>
        <div style={{ borderRadius: 12, border: `1.5px solid ${f < 792 ? A.cyan600 : '#dce3e9'}`, padding: '10px 14px', fontSize: 22, fontWeight: 800, marginBottom: 14 }}>{peso(countUp(f, 778, 790, JOB.offer))}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: A.ink700, marginBottom: 6 }}>Why are you qualified?</div>
        <div style={{ borderRadius: 12, border: `1.5px solid ${f >= 792 ? A.cyan600 : '#dce3e9'}`, padding: '12px 14px', minHeight: 84, fontSize: 14, fontWeight: 500, color: A.ink700, lineHeight: '19px', marginBottom: 16 }}>
          {typedRange(f, 794, 836, 'Hi! I can fix this tomorrow at 9 AM. I will bring the parts.')}<Caret f={f} until={840} />
        </div>
        <Btn f={f} press={850} label={<><Send size={17} /> Submit Proposal</>} />
      </div>
      <Tap f={f} at={850} x={180} y={728} />
    </div>
  );
};

const WalletScr = (f: number) => {
  const got = f >= 1394;
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <div style={{ background: A.spHero, padding: '60px 20px 22px', borderRadius: '0 0 26px 26px', color: A.white }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Wallet</div>
        <div style={{ fontSize: 13.5, opacity: 0.75 }}>Total Earned</div>
        <div style={{ fontSize: 32, fontWeight: 800, transform: `scale(${1 + hit(f, 1394, 6) * 0.12})`, transformOrigin: 'left center' }}>{peso(12450 + (got ? Math.round(JOB.offer * tw(f, 1394, 1410)) : 0))}</div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Transaction History</div>
        {got && (
          <div style={{ transform: `translateX(${(1 - sp(f, 1396)) * 360}px)`, marginBottom: 10 }}>
            <Card style={{ display: 'flex', alignItems: 'center', gap: 12, boxShadow: `0 0 0 2px ${A.green500}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: '#dcfce7', display: 'grid', placeItems: 'center' }}><Banknote size={18} color={A.green600} /></div>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Payment received<div style={{ fontSize: 12, color: A.ink500, fontWeight: 600 }}>{JOB.title}</div></div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: A.green600 }}>+{peso(JOB.offer)}</div>
            </Card>
          </div>
        )}
        {[['Deep Clean Condo', 2000], ['Aircon Cleaning', 1200]].map(([t, v]) => (
          <Card key={t as string} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: A.well, display: 'grid', placeItems: 'center' }}><Banknote size={18} color={A.cyan700} /></div>
            <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>Payment received<div style={{ fontSize: 12, color: A.ink500, fontWeight: 600 }}>{t}</div></div>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>+{peso(v as number)}</div>
          </Card>
        ))}
      </div>
      <SPNav active={3} />
    </div>
  );
};

const Profile = (f: number) => {
  const up = f >= 1505;
  return (
    <div style={{ position: 'absolute', inset: 0, background: A.canvas }}>
      <div style={{ background: A.spHero, padding: '64px 20px 26px', borderRadius: '0 0 26px 26px', color: A.white, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar ini={P.ini} size={76} bg={A.cyan700} /></div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 10, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>{P.name} <BadgeCheck size={20} color={A.cyan500} /></div>
        <div style={{ fontSize: 13, opacity: 0.75, marginTop: 3 }}>Plumbing · Lipa City</div>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '16px 16px 0' }}>
        {[
          { I: Check, l: 'Jobs Done', v: up ? '39' : '38' },
          { I: Star, l: 'Rating', v: up ? '4.9' : '4.8' },
        ].map((s, i) => (
          <Card key={i} style={{ flex: 1, textAlign: 'center', transform: `scale(${1 + hit(f, 1505, 6) * 0.1})` }}>
            <s.I size={20} color={i ? A.amber500 : A.cyan700} fill={i ? A.amber500 : 'none'} />
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: up && hit(f, 1505, 20) > 0.1 ? A.green600 : A.ink900 }}>{s.v}</div>
            <div style={{ fontSize: 12.5, color: A.ink500, fontWeight: 600 }}>{s.l}</div>
          </Card>
        ))}
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>Reviews</div>
        {f >= 1540 && (
          <div style={{ transform: `translateY(${(1 - sp(f, 1540)) * 200}px)` }}>
            <Card>
              <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={15} color={A.amber500} fill={A.amber500} />)}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: A.ink700 }}>Fast, clean and friendly. Highly recommended!</div>
              <div style={{ fontSize: 12, color: A.ink500, marginTop: 5 }}>{H.name} · Just now</div>
            </Card>
          </div>
        )}
      </div>
      <SPNav active={0} />
    </div>
  );
};

export const SPPhoneContent: React.FC<{ f: number }> = ({ f }) => (
  <>
    <Screens
      f={f}
      list={[
        { at: 0, render: (g) => Home(g, 'unverified') },
        { at: 256, render: Verify },
        { at: 600, render: (g) => Home(g, 'feed'), kind: 'none' },
        { at: 718, render: (g) => Detail(g, 'apply') },
        { at: 772, render: ProposalSheet, kind: 'none' },
        { at: 856, render: (g) => Detail(g, 'sent'), kind: 'fade' },
        { at: 1000, render: (g) => Home(g, 'booking'), kind: 'none' },
        { at: 1144, render: (g) => Chat(g, 'sp') },
        { at: 1262, render: (g) => Detail(g, 'progress') },
        { at: 1340, render: WalletScr },
        { at: 1440, render: Profile, kind: 'up' },
      ]}
    />
    <StatusBar light={(f < 256) || (f >= 600 && f < 718) || (f >= 1000 && f < 1144) || f >= 1340} />
  </>
);
