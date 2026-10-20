import { TIER_FOR_URGENCY, TIER_LABELS } from '../taskEffort';

describe('TIER_FOR_URGENCY', () => {
  it('maps Flexible to Basic, Normal to Standard and Urgent to Premium', () => {
    expect(TIER_FOR_URGENCY).toEqual({ flexible: 'basic', normal: 'standard', urgent: 'premium' });
  });

  it('gives every urgency its own tier, each one with a label', () => {
    const tiers = Object.values(TIER_FOR_URGENCY);
    expect(new Set(tiers).size).toBe(3);
    tiers.forEach((tier) => expect(TIER_LABELS[tier].label).toBeTruthy());
  });
});
