import { formatPesoShort, peso } from '../format';

describe('formatPesoShort', () => {
  it('keeps the full amount below ₱100,000, exactly as peso() shows it', () => {
    expect(formatPesoShort(0)).toBe('₱0.00');
    expect(formatPesoShort(8397)).toBe('₱8,397.00');
    expect(formatPesoShort(99999.5)).toBe('₱99,999.50');
    expect(formatPesoShort(99999.5)).toBe(peso(99999.5));
  });

  it('shows thousands as K from ₱100,000, with one decimal only when there is one', () => {
    expect(formatPesoShort(100000)).toBe('₱100K');
    expect(formatPesoShort(125500)).toBe('₱125.5K');
    expect(formatPesoShort(250000)).toBe('₱250K');
    expect(formatPesoShort(999949)).toBe('₱999.9K');
  });

  it('switches to M once K would round up to 1000K', () => {
    expect(formatPesoShort(999950)).toBe('₱1M');
    expect(formatPesoShort(1000000)).toBe('₱1M');
  });

  it('shows millions with up to two decimals, trimming trailing zeros', () => {
    expect(formatPesoShort(1200000)).toBe('₱1.2M');
    expect(formatPesoShort(1250000)).toBe('₱1.25M');
    expect(formatPesoShort(1248397)).toBe('₱1.25M');
  });

  it('reads numeric strings the way peso() does, and treats a missing amount as zero', () => {
    expect(formatPesoShort('1248397.5')).toBe('₱1.25M');
    expect(formatPesoShort('8397')).toBe('₱8,397.00');
    expect(formatPesoShort(null)).toBe('₱0.00');
    expect(formatPesoShort(undefined)).toBe('₱0.00');
  });

  it('keeps the minus sign where peso() puts it', () => {
    expect(formatPesoShort(-125500)).toBe('₱-125.5K');
    expect(formatPesoShort(-1248397)).toBe('₱-1.25M');
    expect(formatPesoShort(-500)).toBe(peso(-500));
  });
});
