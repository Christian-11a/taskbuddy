/**
 * Presentation rules for the Notifications screens: which tone a row wears
 * and how the list is split into Today and Earlier. Pure, so both roles
 * share one answer.
 */

export type NotificationTone = 'info' | 'success' | 'danger';

/**
 * A problem for the user, whatever the notification type: a rejected or
 * declined booking, a job or hire that was cancelled or did not complete, a
 * failed payment. The backend writes some of these in the title ("Booking
 * declined") and some in the body ("... was not selected.").
 */
const PROBLEM = /reject|declin|not approved|not selected|failed|cancel|did not complete/i;

/** An outcome that went well: a booking confirmed, money that arrived, a review. */
const DONE = /confirmed|completed|finished|accepted|approved|verified|paid|payout|released|topped up|credit issued|received a review/i;

/**
 * Tone of one notification row. Chat messages are always informational:
 * their body is written by the other person, so it is not an outcome.
 */
export function notificationTone(copy: {
  title?: string | null;
  body?: string | null;
  type?: string | null;
}): NotificationTone {
  if (copy.type === 'message') return 'info';
  const text = `${copy.title ?? ''} ${copy.body ?? ''}`;
  if (PROBLEM.test(text)) return 'danger';
  if (DONE.test(text)) return 'success';
  return 'info';
}

export interface NotificationDayGroups<T> {
  today: T[];
  earlier: T[];
}

/**
 * Splits rows (already newest first) into Today and Earlier. "Today" starts
 * at local midnight; a timestamp slightly ahead of this device's clock is
 * still Today, and one that cannot be read is Earlier.
 */
export function groupNotificationsByDay<T extends { created_at: string }>(
  rows: readonly T[],
  now: Date = new Date(),
): NotificationDayGroups<T> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today: T[] = [];
  const earlier: T[] = [];
  for (const row of rows) {
    const created = new Date(row.created_at).getTime();
    (created >= startOfToday ? today : earlier).push(row);
  }
  return { today, earlier };
}
