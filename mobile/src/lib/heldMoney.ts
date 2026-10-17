/** The job fields the held-money rule reads. Any job from the API fits. */
export interface HoldInput {
  status: string;
  budget?: number | string | null;
}

/** Statuses where the client's payment sits in escrow until the job is released. */
const HELD_STATUSES: readonly string[] = ['assigned', 'confirmed', 'in_progress'];

/**
 * The amount the platform is holding for this job right now, or null when nothing is held.
 * A booked or working job with a budget is held. Completed jobs are released as soon as the
 * client confirms, so they hold nothing. Open, cancelled and expired jobs hold nothing either.
 * `now` is kept so existing callers keep working; the rule itself does not depend on the time.
 */
export function heldAmount(job: HoldInput | null | undefined, now: Date): number | null {
  if (!job) return null;
  const amount = Number(job.budget ?? 0);
  if (!(amount > 0)) return null;
  return HELD_STATUSES.includes(job.status) ? amount : null;
}
