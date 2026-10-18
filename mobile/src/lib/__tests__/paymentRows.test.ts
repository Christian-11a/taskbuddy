import {
  filterRows, groupByMonth, paidThisMonth, paymentState, refundedThisMonth, rowView,
  type PaymentRow, type PaymentState,
} from '../paymentRows';

const row = (state: PaymentState, amount = 300, date = '2026-10-10T08:00:00', extra: Partial<PaymentRow> = {}): PaymentRow =>
  ({ jobId: `${state}-${date}`, title: 'Job', amount, date, state, ...extra });
const NOW = new Date('2026-10-18T10:00:00');

describe('paymentState', () => {
  it('maps escrow and dispute outcomes', () => {
    expect(paymentState({ status: 'completed', budget: 1 }, { status: 'released' }, undefined)).toBe('released');
    expect(paymentState({ status: 'confirmed', budget: 1 }, { status: 'held' }, undefined)).toBe('held');
    expect(paymentState({ status: 'cancelled', budget: 1 }, null, undefined)).toBe('refunding');
    expect(paymentState({ status: 'cancelled', budget: 1 }, { status: 'refunded' }, undefined)).toBe('refunded');
    expect(paymentState({ status: 'cancelled', budget: 1 }, null, 'reviewed')).toBe('settled');
  });
});

describe('rowView', () => {
  it('released: money out, ink, arrow up-right, names the provider', () => {
    const v = rowView(row('released', 300, undefined, { providerName: 'Ana Cruz' }));
    expect(v).toMatchObject({ amountText: '−₱300.00', tone: 'ink', icon: 'out', caption: 'Paid to Ana Cruz' });
    expect(v.a11yLabel).toBe('Paid 300 pesos to Ana Cruz');
  });
  it('released without a name falls back to your provider', () => {
    expect(rowView(row('released')).caption).toBe('Paid to your provider');
  });
  it('held: money out with an On hold pill', () => {
    const v = rowView(row('held'));
    expect(v).toMatchObject({ amountText: '−₱300.00', tone: 'ink', icon: null, caption: 'Held until you confirm the job is done' });
    expect(v.pill).toEqual({ kind: 'onHold', label: 'On hold' });
  });
  it('refunded: money back in green, arrow down-left', () => {
    const v = rowView(row('refunded'));
    expect(v).toMatchObject({ amountText: '+₱300.00', tone: 'green', icon: 'in', caption: 'Refunded to your payment method' });
    expect(v.a11yLabel).toBe('Refunded 300 pesos');
  });
  it('refunding: grey plus with a Processing pill', () => {
    const v = rowView(row('refunding'));
    expect(v).toMatchObject({ amountText: '+₱300.00', tone: 'grey', caption: 'Refund on its way' });
    expect(v.pill?.label).toBe('Processing');
  });
  it('settled: no sign, Reviewed pill', () => {
    const v = rowView(row('settled'));
    expect(v.amountText).toBe('₱300.00');
    expect(v.pill?.label).toBe('Reviewed');
  });
  it('never says minus aloud', () => {
    (['held', 'released', 'refunded', 'refunding', 'settled'] as PaymentState[]).forEach((s) =>
      expect(rowView(row(s)).a11yLabel.toLowerCase()).not.toContain('minus'));
  });
});

describe('groupByMonth', () => {
  it('groups newest month first with a paid and refunded line', () => {
    const groups = groupByMonth([
      row('released', 500, '2026-09-20T08:00:00'),
      row('released', 300, '2026-10-02T08:00:00'),
      row('refunded', 200, '2026-10-12T08:00:00'),
      row('held', 900, '2026-10-14T08:00:00'),
    ]);
    expect(groups.map((g) => g.title)).toEqual(['October 2026', 'September 2026']);
    expect(groups[0].summary).toBe('Paid ₱300.00 · Refunded ₱200.00');
    expect(groups[0].rows).toHaveLength(3);
    expect(groups[1].summary).toBe('Paid ₱500.00 · Refunded ₱0.00');
  });
});

describe('summary math', () => {
  const rows = [
    row('released', 500), row('held', 700), row('refunded', 200), row('refunding', 100),
    row('released', 900, '2026-09-10T08:00:00'), row('refunded', 50, '2026-09-11T08:00:00'),
  ];
  it('paid this month counts released only', () => expect(paidThisMonth(rows, NOW)).toBe(500));
  it('refunded this month counts completed refunds only', () => expect(refundedThisMonth(rows, NOW)).toBe(200));
});

describe('filterRows', () => {
  const rows = (['released', 'held', 'refunded', 'refunding', 'settled'] as PaymentState[]).map((s) => row(s));
  it('filters', () => {
    expect(filterRows(rows, 'all')).toHaveLength(5);
    expect(filterRows(rows, 'paid').map((r) => r.state)).toEqual(['released']);
    expect(filterRows(rows, 'held').map((r) => r.state)).toEqual(['held']);
    expect(filterRows(rows, 'refunds').map((r) => r.state)).toEqual(['refunded', 'refunding']);
  });
});
