import { bookingCounts } from '../bookingCalendar';
import type { Booking } from '../api';
import { bookingMarks, bookingRowStatus, bookingsOnDay } from '../bookingCalendar';
import { dateKey } from '../localDate';

/** A local time on a fixed day in October 2026. */
const onOct = (day: number, hour = 9, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

function makeBooking(fields: Partial<Booking> & Pick<Booking, 'id' | 'scheduled_at'>): Booking {
  return {
    job_id: `job-${fields.id}`,
    provider_id: 'me',
    client_id: 'client',
    status: 'scheduled',
    duration_minutes: 60,
    notes: null,
    jobs: { title: `Job ${fields.id}`, category_id: 1 },
    client: { full_name: 'Maria Santos' },
    ...fields,
  };
}

describe('bookingsOnDay', () => {
  it('returns only the bookings on that day, soonest first', () => {
    const bookings = [
      makeBooking({ id: 'late', scheduled_at: onOct(12, 15) }),
      makeBooking({ id: 'other', scheduled_at: onOct(13, 9) }),
      makeBooking({ id: 'early', scheduled_at: onOct(12, 8) }),
    ];

    expect(bookingsOnDay(bookings, '2026-10-12').map((booking) => booking.id)).toEqual(['early', 'late']);
  });

  it('is empty for a day with no bookings', () => {
    expect(bookingsOnDay([makeBooking({ id: 'a', scheduled_at: onOct(12) })], '2026-10-20')).toEqual([]);
  });
});

describe('bookingMarks', () => {
  const now = new Date(2026, 9, 9, 12, 0);

  it('dots each day with a booking, selects the picked day and rings today', () => {
    const bookings = [
      makeBooking({ id: 'a', scheduled_at: onOct(12) }),
      makeBooking({ id: 'b', scheduled_at: onOct(12, 14) }),
    ];

    const marks = bookingMarks(bookings, '2026-10-12', now);

    expect(marks['2026-10-12']).toEqual({ marked: true, selected: true });
    expect(marks[dateKey(now)]).toEqual({ today: true });
    expect(Object.keys(marks).sort()).toEqual(['2026-10-09', '2026-10-12']);
  });

  it('when another day is picked, today keeps its ring and the old pick is no longer selected', () => {
    const bookings = [makeBooking({ id: 'a', scheduled_at: onOct(12) })];

    const marks = bookingMarks(bookings, '2026-10-20', now);

    expect(marks['2026-10-12']).toEqual({ marked: true });
    expect(marks['2026-10-20']).toEqual({ selected: true });
    expect(marks['2026-10-09']).toEqual({ today: true });
  });
});

describe('bookingRowStatus', () => {
  it('shows a scheduled booking as Booked, with the client, in the booked tone', () => {
    expect(bookingRowStatus({ status: 'scheduled', client: { full_name: 'Maria Santos' } })).toEqual({
      tone: 'booked',
      meta: 'Booked · Maria Santos',
    });
  });

  it('shows a completed booking as Completed, and a cancelled one as Cancelled, both in the done tone', () => {
    expect(bookingRowStatus({ status: 'completed', client: { full_name: 'Maria Santos' } })).toEqual({
      tone: 'done',
      meta: 'Completed · Maria Santos',
    });
    expect(bookingRowStatus({ status: 'cancelled', client: { full_name: 'Maria Santos' } })).toEqual({
      tone: 'done',
      meta: 'Cancelled · Maria Santos',
    });
  });

  it('leaves the client out when the booking has none, and does not show a blank name', () => {
    expect(bookingRowStatus({ status: 'scheduled', client: null })).toEqual({ tone: 'booked', meta: 'Booked' });
    expect(bookingRowStatus({ status: 'scheduled', client: { full_name: '   ' } })).toEqual({
      tone: 'booked',
      meta: 'Booked',
    });
  });
});

describe('bookingCounts', () => {
  it('counts the bookings on each day', () => {
    const bookings = [
      makeBooking({ id: 'a', scheduled_at: onOct(12) }),
      makeBooking({ id: 'b', scheduled_at: onOct(12, 14) }),
      makeBooking({ id: 'c', scheduled_at: onOct(13) }),
    ];

    expect(bookingCounts(bookings)).toEqual({ '2026-10-12': 2, '2026-10-13': 1 });
    expect(bookingCounts([])).toEqual({});
  });
});
