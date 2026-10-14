import { relativeDay, startDateNote } from '../jobStartDate';

// Mid-day local times, so the calendar day is the same in every time zone the tests run in.
const NOW = new Date(2026, 9, 14, 10, 0);
const local = (day: number, hour = 12) => new Date(2026, 9, day, hour, 0).toISOString();

describe('relativeDay', () => {
  it.each([
    ['today', new Date(2026, 9, 14, 20, 0), 'today'],
    ['yesterday', new Date(2026, 9, 13, 8, 0), 'yesterday'],
    ['tomorrow', new Date(2026, 9, 15, 8, 0), 'tomorrow'],
    ['several days before', new Date(2026, 9, 10, 12, 0), '4 days ago'],
    ['several days after', new Date(2026, 9, 16, 12, 0), 'in 2 days'],
    ['a week after', new Date(2026, 9, 21, 12, 0), 'in 7 days'],
  ])('reads %s as %s', (_, when, expected) => {
    expect(relativeDay(when, NOW)).toBe(expected);
  });
});

describe('startDateNote', () => {
  it('says nothing inside 24 hours, either side of now', () => {
    expect(startDateNote(new Date(NOW.getTime() - 23 * 60 * 60 * 1000).toISOString(), NOW)).toBeNull();
    expect(startDateNote(new Date(NOW.getTime() + 23 * 60 * 60 * 1000).toISOString(), NOW)).toBeNull();
    expect(startDateNote(new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(), NOW)).toBeNull();
  });

  it('says a job booked more than a day ago was booked for that day, and how long ago', () => {
    expect(startDateNote(local(10), NOW)).toBe('This job was booked for Sat, Oct 10 (4 days ago). Start it now?');
  });

  it('says a job booked more than a day ahead is booked for that day, and how far ahead', () => {
    expect(startDateNote(local(16), NOW)).toBe('This job is booked for Fri, Oct 16 (in 2 days). Start it now?');
  });

  it('uses yesterday and tomorrow for the days either side of today', () => {
    expect(startDateNote(new Date(2026, 9, 13, 6, 0).toISOString(), NOW)).toBe(
      'This job was booked for Tue, Oct 13 (yesterday). Start it now?',
    );
    expect(startDateNote(new Date(2026, 9, 15, 18, 0).toISOString(), NOW)).toBe(
      'This job is booked for Thu, Oct 15 (tomorrow). Start it now?',
    );
  });

  it('is null with no date, or a date that cannot be read', () => {
    expect(startDateNote(null, NOW)).toBeNull();
    expect(startDateNote(undefined, NOW)).toBeNull();
    expect(startDateNote('not a date', NOW)).toBeNull();
  });
});
