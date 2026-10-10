import { heldAmount } from '../heldMoney';

// Local time on purpose, so the warranty comparison does not depend on the machine's zone.
const NOW = new Date(2026, 9, 11, 15, 0);
const IN_WARRANTY = new Date(2026, 9, 13, 9, 0).toISOString();
const WARRANTY_OVER = new Date(2026, 9, 9, 9, 0).toISOString();

describe('heldAmount', () => {
  it.each(['assigned', 'confirmed', 'in_progress'])('holds the budget while a %s job is paid', (status) => {
    expect(heldAmount({ status, budget: 1 }, NOW)).toBe(1);
  });

  it('holds a completed job only while its warranty runs', () => {
    expect(heldAmount({ status: 'completed', budget: 250.5, warranty_expires_at: IN_WARRANTY }, NOW)).toBe(250.5);
    expect(heldAmount({ status: 'completed', budget: 250.5, warranty_expires_at: WARRANTY_OVER }, NOW)).toBeNull();
  });

  it('does not claim a hold for a completed job when the warranty date is missing', () => {
    expect(heldAmount({ status: 'completed', budget: 1 }, NOW)).toBeNull();
  });

  it.each(['open', 'recommending', 'cancelled', 'expired'])('never holds money on a %s job', (status) => {
    expect(heldAmount({ status, budget: 1 }, NOW)).toBeNull();
  });

  it.each([null, undefined, 0, '0.00'])('is null when the budget is %s', (budget) => {
    expect(heldAmount({ status: 'confirmed', budget }, NOW)).toBeNull();
  });

  it('reads a budget that arrives as text', () => {
    expect(heldAmount({ status: 'confirmed', budget: '250.50' }, NOW)).toBe(250.5);
  });

  it('is null when there is no job', () => {
    expect(heldAmount(null, NOW)).toBeNull();
    expect(heldAmount(undefined, NOW)).toBeNull();
  });
});
