import { priceFor, priceOptions, workload } from './pricing';

describe('job pricing', () => {
  const base = { basePrice: 800, urgencyMultiplier: 1 };

  it('treats an empty checklist as one moderate task', () => {
    expect(workload([])).toBe(1.5);
  });

  it('charges more for heavier and more tasks', () => {
    expect(workload(['heavy'])).toBeGreaterThan(workload(['light']));
    expect(workload(['light', 'light'])).toBeGreaterThan(workload(['light']));
  });

  it('returns three ascending tiers rounded to 50', () => {
    const options = priceOptions({ ...base, efforts: ['moderate'] });
    expect(options.map((o) => o.tier)).toEqual([
      'basic',
      'standard',
      'premium',
    ]);
    expect(options.map((o) => o.amount)).toEqual([1000, 1200, 1500]);
    for (const o of options) {
      expect(o.amount % 50).toBe(0);
      expect(o.min).toBeLessThanOrEqual(o.amount);
      expect(o.max).toBeGreaterThanOrEqual(o.amount);
    }
  });

  it('prices urgent jobs higher', () => {
    const normal = priceFor({ ...base, efforts: ['light'] }, 'standard');
    const urgent = priceFor(
      { ...base, urgencyMultiplier: 1.5, efforts: ['light'] },
      'standard',
    );
    expect(urgent).toBeGreaterThan(normal);
  });

  it('caps at the budget limit', () => {
    const efforts = Array(20).fill('heavy');
    expect(
      priceFor({ basePrice: 5000, urgencyMultiplier: 3, efforts }, 'premium'),
    ).toBe(100_000);
  });
});
