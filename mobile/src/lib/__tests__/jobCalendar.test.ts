import type { Job } from '../api';
import {
  calendarMarks,
  dayHeading,
  dayLabel,
  isOnCalendar,
  jobsOnDay,
  monthTitle,
  shiftMonth,
  unscheduledJobs,
} from '../jobCalendar';

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

describe('isOnCalendar', () => {
  it('needs a scheduled date', () => {
    expect(isOnCalendar(job({ id: 'a', status: 'confirmed' }), NOW)).toBe(false);
  });

  it('leaves out cancelled and expired jobs', () => {
    expect(isOnCalendar(job({ id: 'a', status: 'cancelled', scheduled_at: at(2026, 9, 20) }), NOW)).toBe(false);
    expect(isOnCalendar(job({ id: 'a', status: 'expired', scheduled_at: at(2026, 9, 20) }), NOW)).toBe(false);
  });

  it('leaves out an unfilled job whose date has passed', () => {
    expect(isOnCalendar(job({ id: 'a', status: 'open', scheduled_at: at(2026, 9, 2) }), NOW)).toBe(false);
    expect(isOnCalendar(job({ id: 'a', status: 'recommending', scheduled_at: at(2026, 9, 2) }), NOW)).toBe(false);
  });

  it('keeps booked and finished jobs on their day, even once it has passed', () => {
    expect(isOnCalendar(job({ id: 'a', status: 'confirmed', scheduled_at: at(2026, 9, 2) }), NOW)).toBe(true);
    expect(isOnCalendar(job({ id: 'a', status: 'completed', scheduled_at: at(2026, 9, 2) }), NOW)).toBe(true);
  });

  it('keeps an open job with a future date', () => {
    expect(isOnCalendar(job({ id: 'a', status: 'open', scheduled_at: at(2026, 9, 20) }), NOW)).toBe(true);
  });
});

describe('jobsOnDay', () => {
  it('returns the calendar jobs on that day, in the order given', () => {
    const jobs = [
      job({ id: 'morning', status: 'confirmed', scheduled_at: at(2026, 9, 12, 8) }),
      job({ id: 'other-day', status: 'confirmed', scheduled_at: at(2026, 9, 13) }),
      job({ id: 'afternoon', status: 'in_progress', scheduled_at: at(2026, 9, 12, 15) }),
      job({ id: 'cancelled', status: 'cancelled', scheduled_at: at(2026, 9, 12, 10) }),
    ];

    expect(jobsOnDay(jobs, '2026-10-12', NOW).map((item) => item.id)).toEqual(['morning', 'afternoon']);
  });
});

describe('unscheduledJobs', () => {
  it('lists the live jobs without a date, newest posted first', () => {
    const jobs = [
      job({ id: 'older', status: 'open', posted_at: at(2026, 9, 1) }),
      job({ id: 'newer', status: 'recommending', posted_at: at(2026, 9, 6) }),
      job({ id: 'asap', status: 'in_progress', posted_at: at(2026, 9, 3) }),
      job({ id: 'dated', status: 'confirmed', scheduled_at: at(2026, 9, 20), posted_at: at(2026, 9, 7) }),
      job({ id: 'completed', status: 'completed', posted_at: at(2026, 9, 8) }),
      job({ id: 'cancelled', status: 'cancelled', posted_at: at(2026, 9, 8) }),
      job({ id: 'expired', status: 'expired', posted_at: at(2026, 9, 8) }),
    ];

    expect(unscheduledJobs(jobs).map((item) => item.id)).toEqual(['newer', 'asap', 'older']);
  });
});

describe('calendarMarks', () => {
  it('dots each day with a calendar job, selects the picked day and flags today', () => {
    const jobs = [
      job({ id: 'a', status: 'confirmed', scheduled_at: at(2026, 9, 12) }),
      job({ id: 'b', status: 'open', scheduled_at: at(2026, 9, 12, 17) }),
      job({ id: 'c', status: 'open', scheduled_at: at(2026, 9, 2) }), // unfilled and past: off the calendar
    ];

    expect(calendarMarks(jobs, NOW, '2026-10-12')).toEqual({
      '2026-10-09': { today: true },
      '2026-10-12': { marked: true, selected: true },
    });
  });

  it('selects a picked day that has no jobs', () => {
    expect(calendarMarks([], NOW, '2026-10-20')).toEqual({
      '2026-10-09': { today: true },
      '2026-10-20': { selected: true },
    });
  });
});

describe('month and day text', () => {
  it('moves between months from the first of the month, across year ends', () => {
    expect(shiftMonth('2026-10-09', 1)).toBe('2026-11-01');
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-01-03', -1)).toBe('2025-12-01');
    expect(shiftMonth('2026-10-09', 0)).toBe('2026-10-01');
  });

  it('titles a month', () => {
    expect(monthTitle('2026-10-09')).toBe('October 2026');
  });

  it('headings and labels a day', () => {
    expect(dayHeading('2026-10-09')).toBe('Fri, Oct 9');
    expect(dayLabel('2026-10-09')).toBe('Friday, October 9');
  });
});
