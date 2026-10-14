import type { Job, JobApplication } from '../api';
import { PROPOSAL_CHECK_LIMIT, pendingApplicants, pickHomeHero, proposalCandidates } from '../homeJobs';

const NOW = new Date('2026-10-09T12:00:00+08:00');

function job(id: string, overrides: Partial<Job> = {}): Job {
  return {
    id,
    title: `Job ${id}`,
    status: 'open',
    posted_at: '2026-10-05T09:00:00+08:00',
    created_at: '2026-10-05T09:00:00+08:00',
    scheduled_at: null,
    assigned_provider: null,
    budget: 500,
    ...overrides,
  } as Job;
}

function application(status: JobApplication['status'], id: string): JobApplication {
  return {
    id,
    job_id: 'job',
    provider_id: `provider-${id}`,
    status,
    source: 'organic',
    cover_message: null,
    applied_at: '2026-10-06T09:00:00+08:00',
    decided_at: null,
    provider: { id: `provider-${id}`, full_name: 'Ana Reyes', avatar_url: null, city: null, provider_profiles: null },
  } as JobApplication;
}

describe('proposalCandidates', () => {
  it('lists open and recommending jobs newest first, at most five', () => {
    const jobs = [
      job('oldest', { posted_at: '2026-10-01T09:00:00+08:00' }),
      job('booked', { status: 'confirmed', posted_at: '2026-10-09T09:00:00+08:00' }),
      ...Array.from({ length: 5 }, (_, i) =>
        job(`open-${i}`, {
          posted_at: `2026-10-0${i + 2}T09:00:00+08:00`,
          status: i % 2 ? 'recommending' : 'open',
        }),
      ),
    ];
    expect(proposalCandidates(jobs).map((j) => j.id)).toEqual(['open-4', 'open-3', 'open-2', 'open-1', 'open-0']);
    expect(PROPOSAL_CHECK_LIMIT).toBe(5);
  });
});

describe('pendingApplicants', () => {
  it('keeps only applications still waiting for a decision', () => {
    const applications = [application('pending', 'a'), application('rejected', 'b'), application('pending', 'c')];
    expect(pendingApplicants(applications).map((a) => a.id)).toEqual(['a', 'c']);
    expect(pendingApplicants(undefined)).toEqual([]);
  });
});

describe('pickHomeHero — proposals', () => {
  it('picks the open job with the most pending proposals and lists only its pending applicants', () => {
    const hero = pickHomeHero(
      [
        job('older', { posted_at: '2026-10-01T09:00:00+08:00' }),
        job('newer', { posted_at: '2026-10-07T09:00:00+08:00' }),
      ],
      {
        older: [
          application('pending', 'a'),
          application('pending', 'b'),
          application('rejected', 'g'),
          application('withdrawn', 'f'),
        ],
        newer: [application('pending', 'c'), application('rejected', 'd')],
      },
      NOW,
    );
    // Declined and withdrawn applicants are not counted anywhere on the hero:
    // "N applied" and "N proposals waiting" are both the pending count.
    expect(hero).toEqual({
      kind: 'proposals',
      job: expect.objectContaining({ id: 'older' }),
      pending: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })],
    });
  });

  it('breaks a tie on pending proposals in favour of the newest job', () => {
    const hero = pickHomeHero(
      [
        job('old', { posted_at: '2026-10-01T09:00:00+08:00' }),
        job('new', { posted_at: '2026-10-07T09:00:00+08:00' }),
      ],
      {
        old: [application('pending', 'a'), application('pending', 'b')],
        new: [application('pending', 'c'), application('pending', 'd')],
      },
      NOW,
    );
    expect(hero).toMatchObject({ kind: 'proposals', job: { id: 'new' } });
  });

  it('shows proposals before a next booking or a job in progress', () => {
    const hero = pickHomeHero(
      [
        job('open-1'),
        job('progress', { status: 'in_progress' }),
        job('booked', { status: 'confirmed', scheduled_at: '2026-10-10T09:00:00+08:00' }),
      ],
      { 'open-1': [application('pending', 'a')] },
      NOW,
    );
    expect(hero).toMatchObject({ kind: 'proposals', job: { id: 'open-1' } });
  });

  it('checks only the five newest open jobs for proposals', () => {
    const jobs = Array.from({ length: 6 }, (_, i) => job(`j${i}`, { posted_at: `2026-10-0${i + 1}T09:00:00+08:00` }));
    // j0 is the oldest of six, so it falls outside the checked five and its proposals are not seen.
    expect(pickHomeHero(jobs, { j0: [application('pending', 'a')] }, NOW)).toMatchObject({
      kind: 'searching',
      job: { id: 'j5' },
    });
    expect(pickHomeHero(jobs, { j1: [application('pending', 'a')] }, NOW)).toMatchObject({
      kind: 'proposals',
      job: { id: 'j1' },
    });
  });

  it('treats a failed proposal lookup as no proposals and falls back to the next booking', () => {
    const hero = pickHomeHero(
      [
        job('open-1'),
        job('booked', {
          status: 'assigned',
          scheduled_at: '2026-10-12T09:00:00+08:00',
          assigned_provider: { full_name: 'Juan Dela Cruz' },
        }),
      ],
      { 'open-1': undefined },
      NOW,
    );
    expect(hero).toMatchObject({ kind: 'booking', job: { id: 'booked' }, providerName: 'Juan Dela Cruz' });
  });
});

describe('pickHomeHero — booking', () => {
  it('shows the soonest future booking, ignoring past, open and finished jobs', () => {
    const hero = pickHomeHero(
      [
        job('past', { status: 'confirmed', scheduled_at: '2026-10-08T09:00:00+08:00' }),
        job('undated', { status: 'confirmed', scheduled_at: null }),
        job('open-future', { status: 'open', scheduled_at: '2026-10-09T18:00:00+08:00' }),
        job('finished', { status: 'completed', scheduled_at: '2026-10-10T09:00:00+08:00' }),
        job('later', { status: 'assigned', scheduled_at: '2026-10-15T09:00:00+08:00' }),
        job('soonest', { status: 'confirmed', scheduled_at: '2026-10-10T14:00:00+08:00' }),
      ],
      {},
      NOW,
    );
    expect(hero).toMatchObject({ kind: 'booking', job: { id: 'soonest' }, providerName: null, upcoming: true });
    expect(hero.kind === 'booking' && hero.when?.toISOString()).toBe('2026-10-10T06:00:00.000Z');
  });

  it('chips a booking whose time is still ahead as upcoming, and a booking whose time has passed as not', () => {
    const upcoming = pickHomeHero([job('a', { status: 'confirmed', scheduled_at: '2026-10-12T09:00:00+08:00' })], {}, NOW);
    expect(upcoming).toMatchObject({ kind: 'booking', upcoming: true });

    const passed = pickHomeHero([job('p', { status: 'confirmed', scheduled_at: '2026-10-08T09:00:00+08:00' })], {}, NOW);
    expect(passed).toMatchObject({ kind: 'booking', job: { id: 'p' }, upcoming: false });
    expect(passed.kind === 'booking' && passed.when?.toISOString()).toBe('2026-10-08T01:00:00.000Z');
  });

  it('keeps a booked job with no time as a booking, with no date', () => {
    const hero = pickHomeHero(
      [job('undated', { status: 'confirmed', scheduled_at: null, assigned_provider: { full_name: 'Juan Dela Cruz' } })],
      {},
      NOW,
    );
    expect(hero).toEqual({
      kind: 'booking',
      job: expect.objectContaining({ id: 'undated' }),
      when: null,
      upcoming: false,
      providerName: 'Juan Dela Cruz',
    });
  });
});

describe('pickHomeHero — working', () => {
  it('shows a job in progress ahead of a next booking', () => {
    const hero = pickHomeHero(
      [
        job('booked', { status: 'confirmed', scheduled_at: '2026-10-12T09:00:00+08:00' }),
        job('progress', { status: 'in_progress', scheduled_at: '2026-10-08T09:00:00+08:00', assigned_provider: { full_name: 'Juan Dela Cruz' } }),
      ],
      {},
      NOW,
    );
    expect(hero).toEqual({
      kind: 'working',
      job: expect.objectContaining({ id: 'progress' }),
      needsConfirmation: false,
      providerName: 'Juan Dela Cruz',
    });
  });

  it('needs the client to confirm once every task of the job is done', () => {
    const done = [{ id: 't1', label: 'Fix', position: 1, is_done: true, completed_at: null }];
    const hero = pickHomeHero([job('progress', { status: 'in_progress', job_tasks: done })], {}, NOW);
    expect(hero).toMatchObject({ kind: 'working', needsConfirmation: true });
  });

  it('does not need confirmation while a task is still open, or when the task list is not loaded', () => {
    const open = [
      { id: 't1', label: 'Fix', position: 1, is_done: true, completed_at: null },
      { id: 't2', label: 'Paint', position: 2, is_done: false, completed_at: null },
    ];
    expect(pickHomeHero([job('p', { status: 'in_progress', job_tasks: open })], {}, NOW)).toMatchObject({
      kind: 'working',
      needsConfirmation: false,
    });
    expect(pickHomeHero([job('p', { status: 'in_progress' })], {}, NOW)).toMatchObject({
      kind: 'working',
      needsConfirmation: false,
    });
  });
});

describe('pickHomeHero — searching and empty', () => {
  it('says an open job with no proposals is being searched for, and names the newest such job', () => {
    const hero = pickHomeHero(
      [
        job('older', { posted_at: '2026-10-01T09:00:00+08:00' }),
        job('newer', { status: 'recommending', posted_at: '2026-10-07T09:00:00+08:00' }),
      ],
      { older: [], newer: [application('rejected', 'a')] },
      NOW,
    );
    expect(hero).toEqual({ kind: 'searching', job: expect.objectContaining({ id: 'newer' }) });
  });

  it('is empty with no past jobs when the account has no jobs at all', () => {
    expect(pickHomeHero([], {}, NOW)).toEqual({ kind: 'empty', hasPastJobs: false });
  });

  it('is empty with past jobs when the only jobs are finished, cancelled or expired', () => {
    expect(
      pickHomeHero(
        [job('done', { status: 'completed' }), job('off', { status: 'cancelled' }), job('lapsed', { status: 'expired' })],
        {},
        NOW,
      ),
    ).toEqual({ kind: 'empty', hasPastJobs: true });
  });
});
