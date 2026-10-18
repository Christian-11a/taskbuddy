import { bookedPayoutLine, feePercent, feeRows, paidOutLine } from '../feeBreakdown';

const fee = { rate: 0.15, amount: 75, provider_receives: 425 };

describe('feePercent: the rate as a percent with no trailing .0', () => {
  it('drops the .0 and keeps a real decimal', () => {
    expect(feePercent(0.15)).toBe('15');
    expect(feePercent(0.1)).toBe('10');
    expect(feePercent(0.125)).toBe('12.5');
  });
});

describe('feeRows: the breakdown before a provider proposes', () => {
  it('lays out the job price, the fee and what the provider receives', () => {
    expect(feeRows(500, fee)).toEqual({
      price: '₱500.00',
      feeLabel: 'Platform fee (15%)',
      fee: '−₱75.00',
      receives: '₱425.00',
      summary: 'Job price ₱500.00 · Platform fee (15%) −₱75.00 · You receive ₱425.00',
    });
  });

  it('reads a numeric string budget the way peso() does', () => {
    expect(feeRows('1234.5', { rate: 0.15, amount: 185.18, provider_receives: 1049.32 })?.price).toBe('₱1,234.50');
  });

  it('is null when the job has no fee, so nothing is shown', () => {
    expect(feeRows(500, null)).toBeNull();
    expect(feeRows(500, undefined)).toBeNull();
  });

  it('is null when the price or any fee figure is missing or unreadable', () => {
    expect(feeRows(null, fee)).toBeNull();
    expect(feeRows(500, { rate: 0.15, amount: Number.NaN, provider_receives: 425 })).toBeNull();
  });
});

describe('bookedPayoutLine: a booked or working job', () => {
  it('says what the provider will receive once the client confirms', () => {
    expect(bookedPayoutLine(fee)).toBe("You'll receive ₱425.00 when the client confirms the job is done.");
  });

  it('is null without a fee', () => {
    expect(bookedPayoutLine(null)).toBeNull();
    expect(bookedPayoutLine(undefined)).toBeNull();
  });
});

describe('paidOutLine: a completed job after release', () => {
  it('shows the amount paid out and the price less the fee', () => {
    expect(paidOutLine(500, fee)).toBe('Paid out ₱425.00 (₱500.00 − ₱75.00 fee)');
  });

  it('is null without a fee', () => {
    expect(paidOutLine(500, null)).toBeNull();
  });
});
