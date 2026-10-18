import React from 'react';
import { Bell, BrushCleaning, ClipboardList, Footprints, Hammer, Search, Sparkles, Wrench, X, MapPin } from 'lucide-react';
import { S, Btn, Card, HONav, HeaderBar, ListRow, Pill, SPNav, StatusBar, StepBars, Tap, TileGrid, ServiceTile, Toggle, Chip, hit, sp, tw } from './kit';
import { SNAPPY } from '../motion';

// Screens for the hero beats. Authored at 360 x 776 dp (see kit Phone). Fake data only:
// client "Maria Santos", provider "Ramon Dela Cruz", Lipa City. No prices, no wallet, no fee.

// ── Client: Post a job, step 1 (Service) ───────────────────────────────────
const SERVICES = [
  { label: 'Plumbing', I: Wrench },
  { label: 'Cleaning', I: BrushCleaning },
  { label: 'Handyman', I: Hammer },
  { label: 'Manicure', I: Sparkles },
  { label: 'Pedicure', I: Footprints },
];

export const ClientPostService: React.FC<{ f: number; tapAt?: number }> = ({ f, tapAt = 36 }) => {
  const sel = f >= tapAt + 6;
  const press = 1 - 0.05 * hit(f, tapAt, 3);
  return (
    <div style={{ position: 'absolute', inset: 0, background: S.canvas }}>
      <StatusBar />
      <div style={{ position: 'absolute', top: 44, left: 0, right: 0 }}>
        <HeaderBar title="Post a job" leading={X} />
      </div>
      <div style={{ position: 'absolute', top: 124, left: 0, right: 0 }}>
        <StepBars step={1} total={5} label="Service" />
      </div>
      <div style={{ position: 'absolute', top: 168, left: 20, right: 20, fontSize: 28, fontWeight: 800, letterSpacing: -0.4, lineHeight: '34px' }}>
        What do you need help with?
      </div>
      <div style={{ position: 'absolute', top: 272, left: 20, right: 20 }}>
        <TileGrid>
          {SERVICES.map((s, i) => (
            <ServiceTile key={s.label} label={s.label} I={s.I} selected={i === 0 && sel} scale={i === 0 ? press : 1} />
          ))}
        </TileGrid>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, background: S.surface, borderTop: `1px solid ${S.hairline}`, padding: '14px 20px 0' }}>
        <Btn label="Next" h={52} />
      </div>
      <Tap f={f} at={tapAt} x={97} y={333} />
    </div>
  );
};

// ── Provider: Feed (availability on, counts, job rows) ─────────────────────
const OLD_ROWS = [
  { date: { d: 'MON', n: '19' }, title: 'Install ceiling fan', meta: 'Handyman · 2.4 km away' },
  { date: { d: 'THU', n: '22' }, title: 'Deep clean condo', meta: 'Cleaning · 4.1 km away' },
];
const ROW_TOP = 428;
const ROW_STEP = 108;

/** newAt: frame at which the new "Fix leaking kitchen sink" job lands in the feed (undefined = not yet). */
export const ProviderFeed: React.FC<{ f: number; newAt?: number }> = ({ f, newAt }) => {
  const landed = newAt != null && f >= newAt;
  const shift = landed ? tw(f, newAt as number, (newAt as number) + 16, 0, 1) : 0;
  const count = OLD_ROWS.length + (landed ? 1 : 0);
  const badge = landed ? sp(f, (newAt as number) + 10, SNAPPY) : 0;
  const glow = landed ? 0.5 + 0.5 * Math.exp(-(f - (newAt as number)) / 14) : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, background: S.canvas }}>
      <StatusBar />
      {/* header: avatar, greeting, bell */}
      <div style={{ position: 'absolute', top: 58, left: 20, right: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 26, background: S.navyTonalStrong, color: S.navy, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18 }}>RD</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, color: S.muted, fontWeight: 600 }}>Hello</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.2 }}>Ramon Dela Cruz</div>
        </div>
        <div style={{ position: 'relative', width: 46, height: 46, borderRadius: 23, background: S.surface, border: `1px solid ${S.line}`, display: 'grid', placeItems: 'center' }}>
          <Bell size={21} color={S.ink700} />
          {landed && (
            <div style={{ position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, background: S.danger, color: S.white, fontSize: 13, fontWeight: 800, display: 'grid', placeItems: 'center', transform: `scale(${badge})` }}>1</div>
          )}
        </div>
      </div>
      {/* availability */}
      <Card style={{ position: 'absolute', top: 140, left: 20, right: 20, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: S.success, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>Available for jobs</div>
          <div style={{ fontSize: 15, color: S.muted, fontWeight: 600, marginTop: 2 }}>Clients within 10 km can invite you</div>
        </div>
        <Toggle p={1} />
      </Card>
      {/* search */}
      <div style={{ position: 'absolute', top: 262, left: 20, right: 20, height: 50, borderRadius: 25, background: S.surface, border: `1px solid ${S.line}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
        <Search size={20} color={S.muted} />
        <span style={{ fontSize: 17, color: S.muted, fontWeight: 500 }}>Search open jobs</span>
      </div>
      {/* filter chips */}
      <div style={{ position: 'absolute', top: 330, left: 20, right: 20, display: 'flex', gap: 10 }}>
        <Chip label="All" count={count} on tone="provider" />
        <Chip label="Urgent" count={0} />
        <Chip label="Normal" count={count} />
      </div>
      {/* section */}
      <div style={{ position: 'absolute', top: 388, left: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 21, fontWeight: 800 }}>Open jobs near you</div>
        <Pill label={String(count)} color={S.ink700} bg={S.well} size={14} />
      </div>
      {/* rows: the new job slides in at the top, the others move down one slot */}
      {landed && (
        <div style={{ position: 'absolute', top: ROW_TOP, left: 20, right: 20, opacity: tw(f, newAt as number, (newAt as number) + 10, 0, 1) }}>
          <ListRow
            title="Fix leaking kitchen sink"
            meta={<><MapPin size={16} /> Plumbing · Near you</>}
            date={{ d: 'TUE', n: '20' }}
            glow={glow}
          />
          <div style={{ position: 'absolute', top: -10, right: 14, transform: `scale(${badge})`, transformOrigin: 'right center' }}>
            <Pill label="NEW" color={S.white} bg={S.navy} size={12} />
          </div>
        </div>
      )}
      {OLD_ROWS.map((r, i) => {
        const slot = i + (landed ? 1 : 0) - (landed ? 1 - shift : 0);
        return (
          <div key={r.title} style={{ position: 'absolute', top: ROW_TOP + slot * ROW_STEP, left: 20, right: 20 }}>
            <ListRow title={r.title} meta={<><MapPin size={16} /> {r.meta}</>} date={r.date} />
          </div>
        );
      })}
      <SPNav active={0} />
    </div>
  );
};

// ── Client: quiet state (My Jobs, nothing posted yet) ─────────────────────
export const ClientMyJobsQuiet: React.FC<{}> = () => (
  <div style={{ position: 'absolute', inset: 0, background: S.canvas }}>
    <StatusBar />
    <div style={{ position: 'absolute', top: 58, left: 20, fontSize: 30, fontWeight: 800, letterSpacing: -0.4 }}>My Jobs</div>
    <div style={{ position: 'absolute', top: 116, left: 20, display: 'flex', gap: 10 }}>
      <Chip label="All" on tone="client" />
    </div>
    <Card style={{ position: 'absolute', top: 222, left: 20, right: 20, padding: '30px 22px', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 22, background: S.tonal, display: 'grid', placeItems: 'center', margin: '0 auto' }}>
        <ClipboardList size={36} color={S.primary} />
      </div>
      <div style={{ fontSize: 23, fontWeight: 800, marginTop: 18 }}>No jobs yet</div>
      <div style={{ fontSize: 17, color: S.muted, fontWeight: 600, marginTop: 6 }}>Post a job when you need help.</div>
    </Card>
    <HONav active={1} />
  </div>
);
