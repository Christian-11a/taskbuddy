import type { Job } from '../api';
import { appliedJobIds, feedFilterCounts, feedRowMeta, pickProviderHero } from '../providerFeed';

const NOW = new Date('2026-10-09T12:00:00+08:00');
const DAY_MS = 24 * 60 * 60 * 1000;
/** An ISO timestamp `ms` away from NOW. */
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    title: `Job ${id}`,
    status: 'confirmed',
    urgency: 'normal',
    address: 'Arturo Tanco Drive, Lipa',
    scheduled_at: null,
    budget: 500,
    distance_km: null,
    posted_at: '2026-10-05T09:00:00+08:00',
    created_at: '2026-10-05T09:00:00+08:00',
    ...overrides,
  } as Job;
}

describe('pickProviderHero', () => {
  it('is none when nothing is booked: no jobs, or only finished, cancelled or expired ones', () => {
    expect(pickProviderHero([], NOW)).toEqual({ kind: 'none' });
    expect(pickProviderHero([job('done', { status: 'completed', scheduled_at: at(DAY_MS) })], NOW)).toEqual({ kind: 'none' });
    expect(pickProviderHero([job('off', { status: 'cancelled' }), job('lapsed', { status: 'expired' })], NOW)).toEqual({
      kind: 'none',
    });
  });

  it('is working on a job in progress whose time has passed, with its date', () => {
    const hero = pickProviderHero([job('started', { status: 'in_progress', scheduled_at: at(-DAY_MS) })], NOW);
    expect(hero).toEqual({
      kind: 'working',
      job: expect.objectContaining({ id: 'started' }),
      when: new Date(NOW.getTime() - DAY_MS),
    });
  });

  it('is working on a job in progress with no date, with no date', () => {
    expect(pickProviderHero([job('started', { status: 'in_progress', scheduled_at: null })], NOW)).toEqual({
      kind: 'working',
      job: expect.objectContaining({ id: 'started' }),
      when: null,
    });
  });

  it('shows the booking ahead before a job in progress whose time has passed', () => {
    const hero = pickProviderHero([
      job('started', { status: 'in_progress', scheduled_at: at(-DAY_MS) }),
      job('ahead', { status: 'confirmed', scheduled_at: at(DAY_MS) }),
    ], NOW);
    expect(hero).toMatchObject({ kind: 'booking', job: { id: 'ahead' } });
  });

  it('leads with the soonest hired job, and a dated one beats an undated one', () => {
    const hero = pickProviderHero([
      job('undated', { status: 'assigned', scheduled_at: null }),
      job('dated', { status: 'confirmed', scheduled_at: at(2 * DAY_MS) }),
    ], NOW);
    expect(hero).toMatchObject({ kind: 'booking', job: { id: 'dated' } });
    expect(hero.kind === 'booking' && hero.when?.getTime()).toBe(NOW.getTime() + 2 * DAY_MS);
  });

  it('keeps a hired job with no date as the hero, so its Open call-to-action stays reachable', () => {
    const hero = pickProviderHero([job('undated', { status: 'confirmed', scheduled_at: null })], NOW);
    expect(hero).toEqual({ kind: 'booking', job: expect.objectContaining({ id: 'undated' }), when: null, moreThisWeek: 0 });
  });

  it('keeps a hired job whose date has passed as the hero', () => {
    const hero = pickProviderHero([job('overdue', { status: 'assigned', scheduled_at: at(-DAY_MS) })], NOW);
    expect(hero).toMatchObject({ kind: 'booking', job: { id: 'overdue' } });
  });

  it('without a hired job, picks the soonest booking still ahead, started or not', () => {
    const hero = pickProviderHero([
      job('later', { status: 'in_progress', scheduled_at: at(3 * DAY_MS) }),
      job('sooner', { status: 'in_progress', scheduled_at: at(DAY_MS) }),
    ], NOW);
    expect(hero).toMatchObject({ kind: 'booking', job: { id: 'sooner' } });
  });

  it('counts the other bookings starting in the next seven days', () => {
    const hero = pickProviderHero([
      job('hero', { status: 'confirmed', scheduled_at: at(DAY_MS) }),
      job('in-week', { status: 'assigned', scheduled_at: at(2 * DAY_MS) }),
      job('in-week-started', { status: 'in_progress', scheduled_at: at(6 * DAY_MS) }),
      job('next-week', { status: 'confirmed', scheduled_at: at(8 * DAY_MS) }),
      job('no-date', { status: 'confirmed', scheduled_at: null }),
      job('finished', { status: 'completed', scheduled_at: at(2 * DAY_MS) }),
    ], NOW);
    expect(hero).toMatchObject({ kind: 'booking', job: { id: 'hero' } });
    expect(hero.kind === 'booking' && hero.moreThisWeek).toBe(2);
  });
});

describe('appliedJobIds', () => {
  it('collects the jobs the provider has a pending application on', () => {
    const rows = [
      { id: '1', status: 'pending', jobs: { id: 'job-a' } },
      { id: '2', status: 'rejected', jobs: { id: 'job-b' } },
      { id: '3', status: 'pending', jobs: { id: 'job-c' } },
      { id: '4', status: 'accepted', jobs: { id: 'job-d' } },
      { id: '5', status: 'withdrawn', jobs: { id: 'job-e' } },
    ];
    expect([...appliedJobIds(rows)].sort()).toEqual(['job-a', 'job-c']);
  });

  it('skips rows without a usable job id', () => {
    const rows = [null, 'x', 42, { status: 'pending' }, { status: 'pending', jobs: null }, { status: 'pending', jobs: { id: 7 } }];
    expect(appliedJobIds(rows).size).toBe(0);
  });

  it('is empty while the applications have not loaded', () => {
    expect(appliedJobIds(undefined).size).toBe(0);
    expect(appliedJobIds(null).size).toBe(0);
  });
});

describe('feedRowMeta', () => {
  it('says Applied · waiting once the provider has a pending application', () => {
    expect(feedRowMeta(job('a', { urgency: 'urgent', distance_km: 2.4 }), true)).toBe('Applied · waiting');
  });

  it('shows the distance and the urgency', () => {
    expect(feedRowMeta(job('a', { urgency: 'flexible', distance_km: 2.44 }), false)).toBe('2.4 km away · Flexible');
  });

  it('shows only the urgency when the distance is unknown', () => {
    expect(feedRowMeta(job('a', { urgency: 'urgent', distance_km: null }), false)).toBe('Urgent');
  });
});

describe('feedFilterCounts', () => {
  const page = [
    job('u', { urgency: 'urgent' }),
    job('n1', { urgency: 'normal' }),
    job('n2', { urgency: 'normal' }),
    job('f', { urgency: 'flexible' }),
  ];

  it('reads All and Urgent from the summary and the rest from the loaded page', () => {
    expect(feedFilterCounts('all', { open_count: 9, urgent_count: 3 }, page)).toEqual({
      all: 9, urgent: 3, normal: 2, flexible: 1,
    });
  });

  it('falls back to the loaded page when there is no summary', () => {
    expect(feedFilterCounts('all', null, page)).toEqual({ all: 4, urgent: 1, normal: 2, flexible: 1 });
  });

  it('counts only the urgency that was loaded, since the server filtered the rest out', () => {
    const normalOnly = [job('n1', { urgency: 'normal' }), job('n2', { urgency: 'normal' })];
    expect(feedFilterCounts('normal', { open_count: 5, urgent_count: 0 }, normalOnly)).toEqual({ normal: 5 });
    expect(feedFilterCounts('urgent', null, [job('u', { urgency: 'urgent' })])).toEqual({ urgent: 1 });
  });
});
