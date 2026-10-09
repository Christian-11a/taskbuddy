/**
 * The provider's calendar (My Work · Calendar), worked out from the bookings in
 * the month on screen (`GET /calendar/bookings`). A booking always has a date,
 * so there is no "not scheduled yet" group here.
 */

import type { JobRowTone } from '../components/ui/JobRow';
import type { Booking } from './api';
import type { CalendarMark } from './jobCalendar';
import { dateKey, dateKeyOf, timeOf } from './localDate';

/** The bookings that fall on one day ("YYYY-MM-DD"), soonest first. */
export function bookingsOnDay(bookings: readonly Booking[], key: string): Booking[] {
  return bookings
    .filter((booking) => dateKeyOf(booking.scheduled_at) === key)
    .sort((a, b) => (timeOf(a.scheduled_at) ?? 0) - (timeOf(b.scheduled_at) ?? 0));
}

/** The month grid's marks: a dot on each day with a booking, the picked day selected, today ringed. */
export function bookingMarks(
  bookings: readonly Booking[],
  selectedKey: string,
  now: Date,
): Record<string, CalendarMark> {
  const marks: Record<string, CalendarMark> = {};
  for (const booking of bookings) {
    const key = dateKeyOf(booking.scheduled_at);
    if (key) marks[key] = { ...marks[key], marked: true };
  }
  marks[selectedKey] = { ...marks[selectedKey], selected: true };
  const todayKey = dateKey(now);
  marks[todayKey] = { ...marks[todayKey], today: true };
  return marks;
}

/** A booking's status line and tone. The client's name comes with the booking. */
export function bookingRowStatus(
  booking: Pick<Booking, 'status' | 'client'>,
): { tone: JobRowTone; meta: string } {
  const client = booking.client?.full_name?.trim();
  const withClient = (label: string) => (client ? `${label} · ${client}` : label);
  switch (booking.status) {
    case 'scheduled':
      return { tone: 'booked', meta: withClient('Booked') };
    case 'completed':
      return { tone: 'done', meta: withClient('Completed') };
    case 'cancelled':
      return { tone: 'done', meta: withClient('Cancelled') };
  }
}
