export type TaskEffort = 'light' | 'moderate' | 'heavy';
export type PriceTier = 'basic' | 'standard' | 'premium';

export const TASK_EFFORTS: TaskEffort[] = ['light', 'moderate', 'heavy'];
export const PRICE_TIERS: PriceTier[] = ['basic', 'standard', 'premium'];

const EFFORT_WEIGHT: Record<TaskEffort, number> = {
  light: 1,
  moderate: 1.5,
  heavy: 2.25,
};

const TIER_FACTOR: Record<PriceTier, number> = {
  basic: 0.85,
  standard: 1,
  premium: 1.25,
};

/** Each task after the heaviest one adds this share of its weight. */
const EXTRA_TASK_SHARE = 0.6;
/** Half-width of the range shown around each tier's amount. */
const RANGE_SPREAD = 0.1;
const ROUND_TO = 50;
const MAX_PRICE = 100_000;

export interface PriceOption {
  tier: PriceTier;
  amount: number;
  min: number;
  max: number;
}

/** A narrow, sourced local reference. An unmatched job gets no market claim. */
export interface LaborGuide {
  min: number;
  max: number;
  area: string;
  scope: string;
  basis: string;
}

export const ROSARIO_CLEANING_SCOPE =
  'Basic cleaning: 2 bedrooms + 1 bathroom (up to 2 hours)';

// A September 2026 Rosario client listing offered ₱700–₱1,000 for this exact
// scope: https://www.reddit.com/r/classifiedsph/comments/1w8mhfo/looking_for_room_and_bathroom_cleaner/
// This is a posted budget reference, not a measured market average. Do not
// extend it to other Batangas towns, deeper cleans or extra tasks.
export function laborGuide(
  category: string,
  address: string,
  tasks: string[],
): LaborGuide | null {
  if (
    category !== 'Cleaning' ||
    tasks.length !== 1 ||
    tasks[0] !== ROSARIO_CLEANING_SCOPE
  )
    return null;
  if (!/\brosario\b/i.test(address) || !/\bbatangas\b/i.test(address))
    return null;
  return {
    min: 700,
    max: 1000,
    area: 'Rosario, Batangas',
    scope: 'Basic cleaning of 2 bedrooms and 1 bathroom, up to 2 hours',
    basis: 'Local posted budget, September 2026',
  };
}

export interface PriceInputs {
  basePrice: number;
  urgencyMultiplier: number;
  efforts: TaskEffort[];
}

const round = (value: number) =>
  Math.min(
    MAX_PRICE,
    Math.max(ROUND_TO, Math.round(value / ROUND_TO) * ROUND_TO),
  );

/**
 * How much work the checklist is, in units of one light task. The heaviest
 * item counts in full and every other one at a discount, so a long list costs
 * more without growing linearly. An empty checklist counts as one moderate task.
 */
export function workload(efforts: TaskEffort[]): number {
  if (!efforts.length) return EFFORT_WEIGHT.moderate;
  const weights = efforts.map((e) => EFFORT_WEIGHT[e]).sort((a, b) => b - a);
  return (
    weights[0] + EXTRA_TASK_SHARE * weights.slice(1).reduce((s, w) => s + w, 0)
  );
}

/** The three clickable price options for a job, cheapest first. */
export function priceOptions(input: PriceInputs): PriceOption[] {
  const centre =
    input.basePrice * workload(input.efforts) * input.urgencyMultiplier;
  return PRICE_TIERS.map((tier) => {
    const amount = centre * TIER_FACTOR[tier];
    return {
      tier,
      amount: round(amount),
      min: round(amount * (1 - RANGE_SPREAD)),
      max: round(amount * (1 + RANGE_SPREAD)),
    };
  });
}

export function priceFor(input: PriceInputs, tier: PriceTier): number {
  return priceOptions(input).find((o) => o.tier === tier)!.amount;
}
