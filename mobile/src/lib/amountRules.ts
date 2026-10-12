/**
 * Money amounts as they are typed or pasted. Three questions, each answered in one place:
 * what an amount field shows after a change (nextAmountText), which number the text stands
 * for (parseAmount), and why an amount is refused (validateAmount).
 *
 * Commas are read as thousands separators and dropped, as the screens have always read
 * them. Nothing here sends anything: the screens send the number that parseAmount gives,
 * exactly as they did before.
 */

/** A peso amount has centavos, and no more than two of them. */
export const AMOUNT_DECIMALS = 2;

/** Formatting only, dropped from a change: commas, any whitespace, and the peso sign. */
const FORMATTING = /[,\s₱]/g;

/**
 * What an amount field shows once `incoming` replaces `previous`. Formatting is dropped.
 * Any other character that is not a digit or a dot (a letter, "-", "+", "e", a symbol)
 * refuses the whole change, and the field keeps `previous`: a pasted "1e3" is not read as
 * 13, nor "-1000" as 1000. Digits and the dot are then shaped as an amount: one dot, at
 * most two decimal places ("12.345" becomes "12.34"), no leading zeros ("007" becomes
 * "7"), and a leading dot reads as 0 (".5" becomes "0.5").
 */
export function nextAmountText(previous: string, incoming: string): string {
  const digitsAndDot = incoming.replace(FORMATTING, '');
  if (/[^0-9.]/.test(digitsAndDot)) return previous;
  return shapeDigits(digitsAndDot);
}

/** Digits and dots only: keeps the first dot and two decimal places at most, with no leading zeros. */
function shapeDigits(text: string): string {
  let whole = '';
  let fraction = '';
  let seenDot = false;
  for (const ch of text) {
    if (ch !== '.') {
      if (seenDot) {
        if (fraction.length < AMOUNT_DECIMALS) fraction += ch;
      } else {
        whole += ch;
      }
    } else if (!seenDot) {
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
