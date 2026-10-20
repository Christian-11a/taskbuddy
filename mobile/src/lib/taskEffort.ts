export type TaskEffort = 'light' | 'moderate' | 'heavy';
export type PriceTier = 'basic' | 'standard' | 'premium';

/**
 * How demanding each suggested task is. The backend prices a job from these
 * (heavier and more tasks cost more), so the list lives next to the presets'
 * wording. A task the client types themselves counts as moderate.
 */
const EFFORT: Record<string, TaskEffort> = {
  'Fix leaking faucet': 'moderate',
  'Unclog drain': 'moderate',
  'Repair or replace pipes': 'heavy',
  'Fix toilet': 'moderate',
  'Install new fixture': 'heavy',
  'Check water heater': 'light',
  'General house cleaning': 'moderate',
  'Deep clean': 'heavy',
  'Kitchen cleaning': 'moderate',
  'Bathroom cleaning': 'moderate',
  'Window cleaning': 'light',
  'Laundry and ironing': 'moderate',
  'Assemble furniture': 'moderate',
  'Mount TV or shelves': 'moderate',
  'Repair door or lock': 'moderate',
  'Paint touch-up': 'light',
  'Replace light fixture': 'moderate',
  'Minor carpentry': 'heavy',
  'Basic manicure': 'light',
  'Gel polish': 'moderate',
  'Nail art': 'moderate',
  'Polish removal': 'light',
  'Hand spa': 'light',
  'Basic pedicure': 'light',
  'Foot spa': 'light',
  'Callus removal': 'moderate',
  'Gel polish (toes)': 'moderate',
  'Nail art (toes)': 'moderate',
};

export function effortFor(task: string): TaskEffort {
  return EFFORT[task] ?? 'moderate';
}

export const TIER_LABELS: Record<PriceTier, { label: string; blurb: string }> = {
  basic: { label: 'Basic', blurb: 'Lower rate. Fewer providers may take it.' },
  standard: { label: 'Standard', blurb: 'The typical rate for this job.' },
  premium: { label: 'Premium', blurb: 'Higher rate. Attracts top-rated providers faster.' },
};

/**
 * One price per urgency: the job is priced at the tier its urgency stands for,
 * so the client never picks a tier. The server still applies its urgency rate.
 */
export const TIER_FOR_URGENCY = {
  flexible: 'basic',
  normal: 'standard',
  urgent: 'premium',
} as const satisfies Record<'flexible' | 'normal' | 'urgent', PriceTier>;
