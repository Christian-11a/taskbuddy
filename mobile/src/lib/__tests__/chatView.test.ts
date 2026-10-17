import { chatSubtitle, chatSystemLine, dayHeadLabels, dayLabel } from '../chatView';

// Local calendar on purpose: the labels are about the phone's day, not UTC.
const NOW = new Date(2026, 9, 11, 15, 0);
const at = (year: number, month: number, day: number, hour = 9, minute = 0) =>
  new Date(year, month, day, hour, minute).toISOString();

describe('dayLabel', () => {
  it('says TODAY for a message from earlier today', () => {
    expect(dayLabel(at(2026, 9, 11, 8), NOW)).toBe('TODAY');
  });

  it('says YESTERDAY for the previous calendar day, even late at night', () => {
    expect(dayLabel(at(2026, 9, 10, 23, 59), NOW)).toBe('YESTERDAY');
  });

  it('uses the month and day for older days in the same year', () => {
    expect(dayLabel(at(2026, 9, 6), NOW)).toBe('OCT 6');
  });

  it('adds the year when the message is from an earlier year', () => {
    expect(dayLabel(at(2025, 11, 31), NOW)).toBe('DEC 31, 2025');
  });

  it('returns an empty label for a time it cannot read', () => {
    expect(dayLabel('not a time', NOW)).toBe('');
  });
});

describe('dayHeadLabels', () => {
  it('labels only the first message of each day, keyed by message id', () => {
    const messages = [
      { id: 'a', created_at: at(2026, 9, 6, 9) },
      { id: 'b', created_at: at(2026, 9, 6, 10) },
      { id: 'c', created_at: at(2026, 9, 10, 20) },
      { id: 'd', created_at: at(2026, 9, 11, 8) },
      { id: 'e', created_at: at(2026, 9, 11, 9) },
    ];

    expect(dayHeadLabels(messages, NOW)).toEqual({ a: 'OCT 6', c: 'YESTERDAY', d: 'TODAY' });
  });

  it('is empty for an empty thread', () => {
    expect(dayHeadLabels([], NOW)).toEqual({});
  });

  it('skips a message whose time cannot be read without hiding the next day', () => {
    const messages = [
      { id: 'a', created_at: at(2026, 9, 6, 9) },
      { id: 'bad', created_at: 'not a time' },
      { id: 'b', created_at: at(2026, 9, 6, 10) },
      { id: 'c', created_at: at(2026, 9, 11, 8) },
    ];

    expect(dayHeadLabels(messages, NOW)).toEqual({ a: 'OCT 6', c: 'TODAY' });
  });
});

describe('chatSystemLine', () => {
  const booked = { status: 'confirmed', budget: 1 };

  it('tells the homeowner who they hired and that the budget is held', () => {
    expect(chatSystemLine({ role: 'homeowner', counterpartName: 'TaskBuddyProvider', job: booked, now: NOW }))
      .toBe('You hired TaskBuddyProvider · ₱1.00 held safely');
  });

  it('tells the provider who hired them and that the budget is held', () => {
    expect(chatSystemLine({ role: 'provider', counterpartName: 'Ana Cruz', job: booked, now: NOW }))
      .toBe('Ana Cruz hired you · ₱1.00 held safely');
  });

  it('leaves out the held amount when the job has no budget', () => {
    expect(chatSystemLine({ role: 'homeowner', counterpartName: 'TaskBuddyProvider', job: { status: 'confirmed', budget: null }, now: NOW }))
      .toBe('You hired TaskBuddyProvider');
  });

  it('says hired without the held amount once a job is completed', () => {
    const job = { status: 'completed', budget: 1, warranty_expires_at: new Date(2026, 9, 9).toISOString() };
    expect(chatSystemLine({ role: 'homeowner', counterpartName: 'TaskBuddyProvider', job, now: NOW }))
      .toBe('You hired TaskBuddyProvider');
  });

  it('shows nothing for a job nobody was hired for', () => {
    expect(chatSystemLine({ role: 'homeowner', counterpartName: 'TaskBuddyProvider', job: { status: 'open', budget: 1 }, now: NOW })).toBeNull();
    expect(chatSystemLine({ role: 'provider', counterpartName: 'Ana Cruz', job: { status: 'cancelled', budget: 1 }, now: NOW })).toBeNull();
  });

  it('shows nothing when the job or the other person is not known', () => {
    expect(chatSystemLine({ role: 'homeowner', counterpartName: 'TaskBuddyProvider', job: null, now: NOW })).toBeNull();
    expect(chatSystemLine({ role: 'homeowner', counterpartName: null, job: booked, now: NOW })).toBeNull();
    expect(chatSystemLine({ role: 'homeowner', counterpartName: '   ', job: booked, now: NOW })).toBeNull();
  });
});

describe('chatSubtitle', () => {
  it('joins the job title and the status word', () => {
    expect(chatSubtitle('Plumbing: Fix toilet', 'Confirmed')).toBe('Plumbing: Fix toilet · Confirmed');
  });

  it('shows whichever part is known', () => {
    expect(chatSubtitle(null, 'Confirmed')).toBe('Confirmed');
    expect(chatSubtitle('Plumbing: Fix toilet', null)).toBe('Plumbing: Fix toilet');
  });

  it('is null when neither part is known', () => {
    expect(chatSubtitle(null, '')).toBeNull();
  });
});
