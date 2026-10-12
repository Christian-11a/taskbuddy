/** The job fields the held-money rule reads. Any job from the API fits. */
export interface HoldInput {
  status: string;
  budget?: number | string | null;
  warranty_expires_at?: string | null;
}

/** Statuses where the client's payment sits in escrow until the job is released. */
const HELD_STATUSES: readonly string[] = ['assigned', 'confirmed', 'in_progress'];

/**
 * The amount the platform is holding for this job right now, or null when nothing is held.
 * Same rule the job views use: a booked or working job with a budget is held, and a completed
 * job is held only until its three-day warranty ends. Open, cancelled and expired jobs hold nothing.
 */
export function heldAmount(job: HoldInput | null | undefined, now: Date): number | null {
  if (!job) return null;
  const amount = Number(job.budget ?? 0);
  if (!(amount > 0)) return null;
  if (HELD_STATUSES.includes(job.status)) return amount;
  if (job.status === 'completed' && job.warranty_expires_at) {
    const warrantyEnds = new Date(job.warranty_expires_at).getTime();
    if (now.getTime() < warrantyEnds) return amount;
  }
  return null;
}
