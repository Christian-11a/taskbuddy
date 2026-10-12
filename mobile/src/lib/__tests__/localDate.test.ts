import { addLocalDays, dateKey, dateKeyOf, parseDateKey, startOfLocalDay, timeOf } from '../localDate';

describe('local calendar days', () => {
  it('formats a local date as YYYY-MM-DD with zero padding', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('reads the local day of an ISO time, and gives null when there is no valid date', () => {
    // No offset in the string, so the time is read as local time.
    expect(dateKeyOf('2026-10-15T09:00:00')).toBe('2026-10-15');
    expect(dateKeyOf(null)).toBeNull();
    expect(dateKeyOf('not a date')).toBeNull();
    expect(timeOf(undefined)).toBeNull();
    expect(timeOf('not a date')).toBeNull();
  });

  it('parses a key back to local midnight', () => {
    expect(parseDateKey('2026-10-09')).toEqual(new Date(2026, 9, 9));
  });

  it('starts a day at local midnight and steps across month ends', () => {
    const start = startOfLocalDay(new Date(2026, 0, 31, 18, 45).getTime());
    expect(start).toBe(new Date(2026, 0, 31).getTime());
    expect(dateKey(new Date(addLocalDays(start, 1)))).toBe('2026-02-01');
    expect(dateKey(new Date(addLocalDays(start, -31)))).toBe('2025-12-31');
  });
});
