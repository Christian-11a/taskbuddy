import { TIER_FOR_URGENCY, TIER_LABELS } from './taskEffort';

export type Urgency = 'flexible' | 'normal' | 'urgent';

/**
 * Minutes a job waits for the client to hire before the engine invites the
 * top-matched providers. Set by the DB trigger from `urgency` (BACKEND_SCHEMA.md §7);
 * change both together.
 */
export const MATCH_WINDOW_MIN: Record<Urgency, number> = { urgent: 5, normal: 10, flexible: 15 };

/** The line under an urgency option: when matching starts, and the rate it is priced at. */
export function urgencyTiming(urgency: Urgency): string {
  const tier = TIER_LABELS[TIER_FOR_URGENCY[urgency]].label;
  return `Not hired in ${MATCH_WINDOW_MIN[urgency]} min? We invite top-matched providers · ${tier} rate`;
}

/** What Urgent adds. Each is real: the 5-minute window, the feed's urgency-first sort, the Premium tier. */
export const URGENT_PERKS = [
  'Top-matched providers invited fastest',
  "Shown first in providers' job feed",
  'Premium rate attracts top-rated providers',
] as const;
