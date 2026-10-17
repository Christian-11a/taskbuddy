import { heldAmount } from '../heldMoney';

const NOW = new Date(2026, 9, 11, 15, 0);

describe('heldAmount', () => {
  it.each(['assigned', 'confirmed', 'in_progress'])('holds the budget while a %s job is paid', (status) => {
    expect(heldAmount({ status, budget: 1 }, NOW)).toBe(1);
  });

  it('never holds money on a completed job: payment is released when the client confirms', () => {
    expect(heldAmount({ status: 'completed', budget: 250.5 }, NOW)).toBeNull();
  });

  it('never holds money on a completed job, even one with an old warranty date still on the record', () => {
    const job = { status: 'completed', budget: 250.5, warranty_expires_at: new Date(2026, 9, 13).toISOString() };
    expect(heldAmount(job, NOW)).toBeNull();
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
