import type { Job } from '../api';
import {
  countJobsByFilter,
  filterJobs,
  filterPillCount,
  jobListSections,
  matchesJobFilter,
} from '../myJobsList';

// Friday 9 October 2026, mid-afternoon, local time.
const NOW = new Date(2026, 9, 9, 15, 0);

function at(year: number, monthIndex: number, day: number, hour = 9): string {
  return new Date(year, monthIndex, day, hour).toISOString();
}

function job(fields: Partial<Job> & Pick<Job, 'id' | 'status'>): Job {
  return {
    title: fields.id,
    posted_at: at(2026, 9, 1),
    scheduled_at: null,
    ...fields,
  } as Job;
}

/** Section labels and job ids, for readable assertions. */
function shape(sections: ReturnType<typeof jobListSections>) {
  return sections.map((section) => ({
    label: section.label,
    ids: section.jobs.map((item) => item.id),
  }));
}

describe('matchesJobFilter', () => {
  const needs = job({ id: 'needs', status: 'open' });
  const waiting = job({ id: 'waiting', status: 'recommending' });
  const booked = job({ id: 'booked', status: 'in_progress' });
  const done = job({ id: 'done', status: 'completed' });
  const closed = job({ id: 'closed', status: 'expired' });
  const proposals = { needs: 2, waiting: 0 };

  it('puts an open job with pending proposals under Needs you, and other open jobs under Waiting', () => {
    expect(matchesJobFilter(needs, 'needs', proposals)).toBe(true);
    expect(matchesJobFilter(needs, 'waiting', proposals)).toBe(false);
    expect(matchesJobFilter(waiting, 'needs', proposals)).toBe(false);
    expect(matchesJobFilter(waiting, 'waiting', proposals)).toBe(true);
  });

  it('counts an open job whose proposals are not known yet as waiting', () => {
    expect(matchesJobFilter(needs, 'needs', {})).toBe(false);
    expect(matchesJobFilter(needs, 'waiting', {})).toBe(true);
  });

  it('ignores proposal counts on jobs that are no longer open', () => {
    const confirmed = job({ id: 'x', status: 'confirmed' });
    expect(matchesJobFilter(confirmed, 'needs', { x: 3 })).toBe(false);
    expect(matchesJobFilter(confirmed, 'waiting', { x: 3 })).toBe(false);
  });

  it('sorts booked, done and closed jobs by status', () => {
    expect(matchesJobFilter(booked, 'booked', {})).toBe(true);
    expect(matchesJobFilter(done, 'done', {})).toBe(true);
    expect(matchesJobFilter(done, 'closed', {})).toBe(false);
    expect(matchesJobFilter(closed, 'closed', {})).toBe(true);
    expect(matchesJobFilter(closed, 'booked', {})).toBe(false);
  });

  it('puts every job under All', () => {
    for (const item of [needs, waiting, booked, done, closed]) {
      expect(matchesJobFilter(item, 'all', {})).toBe(true);
    }
  });
});

describe('filterJobs and countJobsByFilter', () => {
  const jobs = [
    job({ id: 'needs', status: 'open' }),
    job({ id: 'waiting', status: 'open' }),
    job({ id: 'confirmed', status: 'confirmed' }),
    job({ id: 'in-progress', status: 'in_progress' }),
    job({ id: 'completed', status: 'completed' }),
    job({ id: 'cancelled', status: 'cancelled' }),
  ];

  it('keeps the jobs that match a filter, in their order', () => {
    expect(filterJobs(jobs, 'booked', {}).map((item) => item.id)).toEqual(['confirmed', 'in-progress']);
  });

  it('counts each filter from the loaded jobs', () => {
    expect(countJobsByFilter(jobs, { needs: 1 })).toEqual({
      all: 6, needs: 1, booked: 2, waiting: 1, done: 1, closed: 1,
    });
  });

  it('counts nothing when there are no jobs', () => {
    expect(countJobsByFilter([], {})).toEqual({
      all: 0, needs: 0, booked: 0, waiting: 0, done: 0, closed: 0,
    });
  });
});

describe('filterPillCount', () => {
  const counts = { all: 7, needs: 1, booked: 2, waiting: 1, done: 1, closed: 2 };

  it('shows no number on Needs you or Waiting while the proposal counts load', () => {
    expect(filterPillCount('needs', counts, true)).toBeUndefined();
    expect(filterPillCount('waiting', counts, true)).toBeUndefined();
  });

  it('shows the counts on Needs you and Waiting once the proposal counts are in', () => {
    expect(filterPillCount('needs', counts, false)).toBe(1);
    expect(filterPillCount('waiting', counts, false)).toBe(1);
  });

  it('shows the other pills while the proposal counts load, since they need only the jobs', () => {
    expect(filterPillCount('all', counts, true)).toBe(7);
    expect(filterPillCount('booked', counts, true)).toBe(2);
    expect(filterPillCount('done', counts, true)).toBe(1);
    expect(filterPillCount('closed', counts, true)).toBe(2);
  });
});

describe('jobListSections for All', () => {
  it('groups jobs into this week, later, no date and earlier, in that order', () => {
    const jobs = [
      job({ id: 'earlier', status: 'confirmed', scheduled_at: at(2026, 9, 8, 10) }),
      job({ id: 'later', status: 'confirmed', scheduled_at: at(2026, 9, 15) }),
      job({ id: 'no-date', status: 'open', posted_at: at(2026, 9, 2) }),
      job({ id: 'today', status: 'confirmed', scheduled_at: at(2026, 9, 9, 18) }),
      job({ id: 'saturday', status: 'confirmed', scheduled_at: at(2026, 9, 10) }),
    ];

    expect(shape(jobListSections(jobs, 'all', {}, NOW))).toEqual([
      { label: 'This week', ids: ['today', 'saturday'] },
      { label: 'Later', ids: ['later'] },
      { label: 'No date yet', ids: ['no-date'] },
      { label: 'Earlier', ids: ['earlier'] },
    ]);
  });

  it('counts this week as Sunday to Saturday', () => {
    const sundayMorning = new Date(2026, 9, 11, 8); // Sunday 11 October 2026
    const jobs = [
      job({ id: 'sunday', status: 'confirmed', scheduled_at: at(2026, 9, 11) }),
      job({ id: 'saturday', status: 'confirmed', scheduled_at: at(2026, 9, 17) }),
      job({ id: 'next-sunday', status: 'confirmed', scheduled_at: at(2026, 9, 18) }),
    ];

    expect(shape(jobListSections(jobs, 'all', {}, sundayMorning))).toEqual([
      { label: 'This week', ids: ['sunday', 'saturday'] },
      { label: 'Later', ids: ['next-sunday'] },
    ]);
  });

  it('starts the next week on the Sunday after a Saturday', () => {
    const saturday = new Date(2026, 9, 10, 8);
    const jobs = [
      job({ id: 'saturday-night', status: 'confirmed', scheduled_at: at(2026, 9, 10, 20) }),
      job({ id: 'sunday', status: 'confirmed', scheduled_at: at(2026, 9, 11) }),
    ];

    expect(shape(jobListSections(jobs, 'all', {}, saturday))).toEqual([
      { label: 'This week', ids: ['saturday-night'] },
      { label: 'Later', ids: ['sunday'] },
    ]);
  });

  it('sorts this week and later soonest first, no date newest posted first, and earlier most recent first', () => {
    const jobs = [
      job({ id: 'later-far', status: 'confirmed', scheduled_at: at(2026, 9, 30) }),
      job({ id: 'later-near', status: 'confirmed', scheduled_at: at(2026, 9, 12) }),
      job({ id: 'no-date-old', status: 'open', posted_at: at(2026, 9, 1) }),
      job({ id: 'no-date-new', status: 'open', posted_at: at(2026, 9, 6) }),
      job({ id: 'earlier-old', status: 'confirmed', scheduled_at: at(2026, 8, 1) }),
      job({ id: 'earlier-recent', status: 'confirmed', scheduled_at: at(2026, 9, 6) }),
    ];

    expect(shape(jobListSections(jobs, 'all', {}, NOW))).toEqual([
      { label: 'Later', ids: ['later-near', 'later-far'] },
      { label: 'No date yet', ids: ['no-date-new', 'no-date-old'] },
      { label: 'Earlier', ids: ['earlier-recent', 'earlier-old'] },
    ]);
  });

  it('has no sections when there are no jobs', () => {
    expect(jobListSections([], 'all', {}, NOW)).toEqual([]);
  });

  it('groups only the live jobs by date, then puts finished jobs last in a FINISHED group, newest posted first', () => {
    const jobs = [
      job({ id: 'today', status: 'confirmed', scheduled_at: at(2026, 9, 9, 18) }),
      job({ id: 'later', status: 'confirmed', scheduled_at: at(2026, 9, 15) }),
      job({ id: 'no-date', status: 'open', posted_at: at(2026, 9, 2, 9) }),
      job({ id: 'earlier', status: 'confirmed', scheduled_at: at(2026, 9, 8, 10) }),
      job({ id: 'done-this-week', status: 'completed', scheduled_at: at(2026, 9, 9), posted_at: at(2026, 9, 5) }),
      job({ id: 'expired-later', status: 'expired', scheduled_at: at(2026, 9, 20), posted_at: at(2026, 9, 4) }),
      job({ id: 'cancelled-no-date', status: 'cancelled', posted_at: at(2026, 9, 2, 15) }),
      job({ id: 'done-old', status: 'completed', scheduled_at: at(2026, 9, 9), posted_at: at(2026, 8, 1) }),
    ];

    expect(shape(jobListSections(jobs, 'all', {}, NOW))).toEqual([
      { label: 'This week', ids: ['today'] },
      { label: 'Later', ids: ['later'] },
      { label: 'No date yet', ids: ['no-date'] },
      { label: 'Earlier', ids: ['earlier'] },
      { label: 'Finished', ids: ['done-this-week', 'expired-later', 'cancelled-no-date', 'done-old'] },
    ]);
  });

  it('a list of only finished jobs under All is one FINISHED group', () => {
    const jobs = [
      job({ id: 'older', status: 'completed', posted_at: at(2026, 9, 1) }),
      job({ id: 'newer', status: 'cancelled', posted_at: at(2026, 9, 3) }),
    ];

    expect(shape(jobListSections(jobs, 'all', {}, NOW))).toEqual([
      { label: 'Finished', ids: ['newer', 'older'] },
    ]);
  });

  it('the other filters keep their date groups and never show a FINISHED group', () => {
    const jobs = [
      job({ id: 'open', status: 'open', posted_at: at(2026, 9, 2) }),
      job({ id: 'confirmed', status: 'confirmed', scheduled_at: at(2026, 9, 15) }),
    ];

    expect(shape(jobListSections(jobs, 'needs', { open: 1 }, NOW))).toEqual([
      { label: 'No date yet', ids: ['open'] },
    ]);
    expect(shape(jobListSections(jobs, 'waiting', {}, NOW))).toEqual([
      { label: 'No date yet', ids: ['open'] },
    ]);
    expect(shape(jobListSections(jobs, 'booked', {}, NOW))).toEqual([
      { label: 'Later', ids: ['confirmed'] },
    ]);
  });
});

describe('jobListSections for Done and Closed', () => {
  it('lists them as one newest-first list with no date headings', () => {
    const jobs = [
      job({ id: 'older', status: 'completed', posted_at: at(2026, 8, 1), scheduled_at: at(2026, 8, 20) }),
      job({ id: 'newer', status: 'completed', posted_at: at(2026, 9, 5), scheduled_at: at(2026, 8, 25) }),
      job({ id: 'cancelled', status: 'cancelled', posted_at: at(2026, 9, 2) }),
    ];

    expect(shape(jobListSections(jobs, 'done', {}, NOW))).toEqual([
      { label: undefined, ids: ['newer', 'older'] },
    ]);
    expect(shape(jobListSections(jobs, 'closed', {}, NOW))).toEqual([
      { label: undefined, ids: ['cancelled'] },
    ]);
  });

  it('has no sections when nothing matches', () => {
    expect(jobListSections([job({ id: 'open', status: 'open' })], 'done', {}, NOW)).toEqual([]);
  });
});

describe('disputed jobs', () => {
  it('stay in the tab of their work status', () => {
    const disputed = job({ id: 'd', status: 'in_progress', display_status: 'disputed' });
    expect(matchesJobFilter(disputed, 'booked', {})).toBe(true);
    expect(matchesJobFilter(disputed, 'closed', {})).toBe(false);
    expect(countJobsByFilter([disputed], {}).booked).toBe(1);
  });

  it('also appear under Needs you, and count there', () => {
    const disputed = job({ id: 'd', status: 'in_progress', display_status: 'disputed' });
    const working = job({ id: 'w', status: 'in_progress' });
    expect(matchesJobFilter(disputed, 'needs', {})).toBe(true);
    expect(matchesJobFilter(working, 'needs', {})).toBe(false);
    expect(countJobsByFilter([disputed, working], {}).needs).toBe(1);
    expect(filterJobs([disputed, working], 'needs', {}).map((j) => j.id)).toEqual(['d']);
  });
});
