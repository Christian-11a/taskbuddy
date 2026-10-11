/**
 * Money amounts as they are typed. Three questions, each answered in one place:
 * what an amount field may show while it is typed (sanitizeAmountInput), which
 * number the text stands for (parseAmount), and why an amount is refused
 * (validateAmount).
 *
 * Commas are read as thousands separators and dropped, as the screens have
 * always read them. Nothing here sends anything: the screens send the number
 * that parseAmount gives, exactly as they did before.
 */

/** A peso amount has centavos, and no more than two of them. */
export const AMOUNT_DECIMALS = 2;

/**
 * What an amount field may show: digits and one dot, at most two decimal places,
 * no leading zeros. Letters, symbols, spaces, commas and any further dots are
 * dropped. "12.345" becomes "12.34", "007" becomes "7" and a leading "." becomes "0.".
 */
export function sanitizeAmountInput(raw: string): string {
  let whole = '';
  let fraction = '';
  let seenDot = false;
  for (const ch of raw) {
    if (/[0-9]/.test(ch)) {
      if (seenDot) {
        if (fraction.length < AMOUNT_DECIMALS) fraction += ch;
      } else {
        whole += ch;
      }
    } else if (ch === '.' && !seenDot) {
      seenDot = true;
    }
  }
  // "007" is 7, but a lone "0" stays when it is the whole part of "0.5".
  whole = whole.replace(/^0+(?=[0-9])/, '');
  if (!seenDot) return whole;
  return `${whole || '0'}.${fraction}`;
}

/**
 * The number the text stands for, or null when it is not an amount: at least one
 * digit, at most two decimal places, and nothing else but commas and outer spaces.
 * "5." reads as 5 (it is what a person is part-way through typing).
 */
export function parseAmount(text: string): number | null {
  const plain = text.trim().replace(/,/g, '');
  if (!/^([0-9]+\.?[0-9]{0,2}|\.[0-9]{1,2})$/.test(plain)) return null;
  const value = Number(plain);
  return Number.isFinite(value) ? value : null;
}

export interface AmountLimits {
  /** Lowest amount allowed, inclusive. Omit for no lower bound. */
  min?: number;
  /** Highest amount allowed, inclusive. Omit for no upper bound. */
  max?: number;
  /** What the field is for, after "Enter": "an amount" gives "Enter an amount". */
  label?: string;
  /** Replaces "You can't go over ₱max" when a screen wants its own wording. */
  overMessage?: (max: number) => string;
}

/** A whole peso amount reads without centavos (₱50, ₱100,000); anything else keeps two. */
export function pesoWords(value: number): string {
  const options = Number.isInteger(value)
    ? undefined
    : { minimumFractionDigits: AMOUNT_DECIMALS, maximumFractionDigits: AMOUNT_DECIMALS };
  return `₱${value.toLocaleString('en-PH', options)}`;
}

/**
 * Why an amount is refused, or null when it is allowed. The text is what the
 * person has typed, so an empty field is refused too ("Enter an amount"); a
 * screen that does not want to nag an untouched field simply does not show it.
 */
export function validateAmount(text: string, limits: AmountLimits = {}): string | null {
  const { min, max, label = 'an amount', overMessage } = limits;
  const plain = text.trim();
  if (plain === '') return `Enter ${label}`;
  if (/[^0-9.,\s]/.test(plain)) return 'Enter numbers only';
  const amount = parseAmount(plain);
  if (amount === null) {
    const fraction = plain.replace(/,/g, '').split('.')[1] ?? '';
    return /^[0-9]{3,}$/.test(fraction) ? 'Up to 2 decimal places' : 'Enter a valid amount';
  }
  if (amount <= 0 && (min === undefined || min <= 0)) return 'Enter an amount greater than zero';
  if (min !== undefined && amount < min) return `Minimum is ${pesoWords(min)}`;
  if (max !== undefined && amount > max) {
    return overMessage ? overMessage(max) : `You can't go over ${pesoWords(max)}`;
  }
  return null;
}
