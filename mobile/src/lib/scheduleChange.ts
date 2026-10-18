/**
 * scheduleChange.ts
 *
 * Rules and wording for "change the date or time" requests on a booked job.
 * Mirrors backend job_change_propose / job_change_decide (migration 0049):
 *  - either participant (client or assigned provider) may propose;
 *  - only while the job is 'assigned' or 'confirmed' (before work starts) and
 *    no complaint is open;
 *  - one pending schedule request per job; it expires after 48 hours;
 *  - the proposer may withdraw; the other participant accepts or declines.
 */

import type { Job, JobChangeRequest } from './api';
import { clockLabel, dayLabel } from './format';

export const SCHEDULE_REASON_MAX = 300;

/** The newest pending, not-yet-expired schedule request, or null. */
export function pendingScheduleChange(
  requests: readonly JobChangeRequest[] | null | undefined,
  now: Date = new Date(),
): JobChangeRequest | null {
  const live = (requests ?? []).filter(
    (r) => r.type === 'schedule' && r.status === 'pending' && Date.parse(r.expires_at) > now.getTime(),
  );
  if (live.length === 0) return null;
  return live.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a));
}

/** Who may do what with a request: the sender withdraws, the other side decides. */
export function scheduleChangeActions(
  request: JobChangeRequest,
  userId: string | null | undefined,
): { canWithdraw: boolean; canDecide: boolean } {
  if (request.status !== 'pending' || !userId) return { canWithdraw: false, canDecide: false };
  const mine = request.requested_by === userId;
  return { canWithdraw: mine, canDecide: !mine };
}

/** Booked and not started, no open complaint, nobody is already waiting on an answer. */
export function canProposeScheduleChange(
  job: Pick<Job, 'status' | 'display_status'>,
  userId: string | null | undefined,
  clientId: string | null | undefined,
  providerId: string | null | undefined,
  pending: JobChangeRequest | null,
): boolean {
  if (!userId || (userId !== clientId && userId !== providerId)) return false;
  if (job.status !== 'assigned' && job.status !== 'confirmed') return false;
  if (job.display_status === 'disputed') return false;
  return pending === null;
}

/** "Tue, Oct 21, 2:00 PM", or '' when unreadable. */
export function scheduleLabel(iso: string | null | undefined): string {
  const day = dayLabel(iso);
  const clock = clockLabel(iso);
  return [day, clock].filter(Boolean).join(', ');
}

const FIRST = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || '';

/** "Ana asked to move this job to Tue, Oct 21, 2:00 PM." ("You asked ..." for the sender). */
export function scheduleChangeText(
  request: JobChangeRequest,
  userId: string | null | undefined,
  otherName: string | null | undefined,
): string {
  const who = request.requested_by === userId ? 'You' : FIRST(otherName) || 'The other person';
  const when = scheduleLabel(request.new_scheduled_at);
  return `${who} asked to move this job to ${when || 'a new time'}.`;
}

/** Short line for a finished request, e.g. "Date change accepted". */
export function scheduleChangeResult(status: JobChangeRequest['status']): string {
  switch (status) {
    case 'accepted': return 'Date change accepted. The job has the new schedule.';
    case 'declined': return 'Date change declined. The job keeps its schedule.';
    case 'withdrawn': return 'Date change withdrawn.';
    case 'expired': return 'Date change request expired.';
    default: return '';
  }
}

/** Client-side check for the sheet; the server checks again. */
export function scheduleChangeErrors(
  when: Date | null,
  hasDate: boolean,
  hasTime: boolean,
  reason: string,
  now: Date,
): { date?: string; time?: string; reason?: string } {
  const errors: { date?: string; time?: string; reason?: string } = {};
  if (!hasDate) errors.date = 'Pick a new date.';
  else if (!hasTime) errors.time = 'Pick a new time.';
  else if (!when || when.getTime() <= now.getTime()) errors.time = 'Pick a time in the future.';
  const r = reason.trim();
  if (r.length === 0) errors.reason = 'Tell them why you need to change it.';
  else if (r.length > SCHEDULE_REASON_MAX) errors.reason = `Keep it to ${SCHEDULE_REASON_MAX} characters.`;
  return errors;
}
