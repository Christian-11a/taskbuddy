/**
 * Presentation rules for the Notifications screens: which tone and icon a row
 * wears and how the list is split into Today and Earlier. Pure, so both roles
 * share one answer.
 */

import type { NotificationTarget } from './notificationRouting';

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

/** Icon rules, matched on the text with quoted job titles removed (see notificationIconName). */
const CANCELLED = /cancel/i;
const DECLINED = /declin|reject|not selected|not approved/i;
const NEW_APPLICANT = /new application|applied to|new proposal|proposal received/i;
const DISPUTED = /complaint|dispute|\bcase\b|under review|frozen/i;
const HIRED_OR_DONE = /accepted|hired|confirmed|completed|job done/i;
const JOB_INVITE = /job near you|new job/i;

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

/** The icons a notification row can wear. NOTIFICATION_ICONS in NotificationCard maps each name to its Lucide icon. */
export type NotificationIconName =
  | 'UserPlus' | 'CircleCheckBig' | 'CircleX' | 'Ban' | 'ShieldAlert' | 'MessageCircle'
  | 'Wallet' | 'BadgeCheck' | 'BriefcaseBusiness' | 'Megaphone' | 'ClipboardList' | 'BellRing';

/**
 * Icon for one notification row, chosen by what happened. The first rule that
 * matches wins: a chat message; a cancellation; a decline or rejection; a new
 * applicant; a complaint or dispute; a hire, booking or job that went through.
 * After those the notification type decides, then a success tone is a check and
 * anything unknown gets a bell. Quoted job titles are left out of the text, so
 * a job named "Cancel sink" cannot turn a new application into a cancellation.
 */
export function notificationIconName(copy: {
  type?: string | null;
  title?: string | null;
  body?: string | null;
  kind?: NotificationTarget['kind'] | null;
  tone: NotificationTone;
}): NotificationIconName {
  if (copy.type === 'message' || copy.kind === 'chat') return 'MessageCircle';
  const text = `${copy.title ?? ''} ${copy.body ?? ''}`.replace(/"[^"]*"/g, ' ');
  if (CANCELLED.test(text)) return 'Ban';
  if (DECLINED.test(text)) return 'CircleX';
  if (NEW_APPLICANT.test(text)) return 'UserPlus';
  if (copy.kind === 'dispute' || copy.type === 'dispute_update' || DISPUTED.test(text)) return 'ShieldAlert';
  if (HIRED_OR_DONE.test(text)) return 'CircleCheckBig';
  if (copy.type === 'verification_update') return 'BadgeCheck';
  if (copy.type === 'wallet_update' || copy.type === 'payment_update') return 'Wallet';
  if (copy.type === 'recommendation_invite' || JOB_INVITE.test(text)) return 'BriefcaseBusiness';
  if (copy.type === 'announcement') return 'Megaphone';
  if (copy.tone === 'success') return 'CircleCheckBig';
  if (copy.type === 'job_update' || copy.type === 'skill_request_update') return 'ClipboardList';
  return 'BellRing';
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
