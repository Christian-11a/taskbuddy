/**
 * Free text as it is cleaned, measured and refused. What is sent is the cleaned
 * text, and what is checked is the same cleaned text, so the screen cannot say
 * "fine" to something the API would reject.
 *
 * Two lengths are in play, because the API uses two:
 * - The request DTOs check `@Length` / `@MaxLength`, which count UTF-16 units
 *   (JavaScript's `.length`). That is the binding maximum.
 * - The database CHECKs count characters (code points), so a minimum has to be
 *   met in characters. Characters never exceed UTF-16 units, so checking the
 *   minimum in characters and the maximum in units is the strict combination.
 *
 * Whitespace-only text is empty. An empty optional field is valid; an empty
 * required field is not.
 */

/** The search boxes on Feed and Help: a query longer than this is cut at the box. */
export const SEARCH_MAX_LENGTH = 100;

/** Job title bounds, from the CreateJobDto and the `jobs.title` CHECK. */
export const TITLE_MIN = 5;
export const TITLE_MAX = 120;

/**
 * The text as it is sent: line endings become "\n", runs of blank lines are cut
 * to one blank line, and the ends are trimmed. Nothing else changes.
 */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
    .trim();
}

/** The cleaned text's length in characters, which is what the database CHECKs count. */
export function textLength(raw: string): number {
  return Array.from(cleanText(raw)).length;
}

/** The cleaned text's length in UTF-16 units, which is what the request DTOs count. */
export function textUnits(raw: string): number {
  return cleanText(raw).length;
}

export interface TextLimits {
  /** Fewest characters allowed once cleaned. */
  min?: number;
  /** Most UTF-16 units allowed once cleaned. */
  max?: number;
  /** What the field holds, with its article, for "Add {label}": "a message", "a reason". */
  label?: string;
  /** A required field refuses empty (and whitespace-only) text. */
  required?: boolean;
}

/**
 * Why free text is refused, or null when it is allowed. Errors are for the
 * screen to show after the field is left or submitted, never while typing.
 */
export function validateText(value: string, limits: TextLimits = {}): string | null {
  const { min = 0, max = Number.POSITIVE_INFINITY, label = 'some text', required = false } = limits;
  const characters = textLength(value);
  if (characters === 0) return required ? `Add ${label}` : null;
  if (characters < min) return `Add a few more words (at least ${min} characters)`;
  const units = textUnits(value);
  if (units > max) return `Keep it under ${max} characters (you're ${units - max} over)`;
  return null;
}

/**
 * The job title's rule, with the wording the job form has always used: at least
 * 5 characters, at most 120.
 */
export function validateTitle(value: string): string | null {
  if (textLength(value) < TITLE_MIN) return `Title must be at least ${TITLE_MIN} characters.`;
  if (textUnits(value) > TITLE_MAX) return `Title cannot exceed ${TITLE_MAX} characters.`;
  return null;
}

/** Digits, with the separators people type between them (spaces, dashes, dots, commas, brackets), as one run. */
const NUMBER_RUN = /[0-9]+(?:[ .,()-]+[0-9]+)*/g;

/**
 * A withdrawal destination. It is free text a person reads and pays from, so the
 * rule is about the one number in it, and the kind of number decides the length:
 *
 * - A GCash (or Maya) number is 09 followed by 9 digits. A bare number that starts
 *   with 09 and has no letters is treated as one.
 * - Any other number is a bank account number: 8 to 20 digits.
 * - Spaces, dashes, dots, commas and brackets may separate the digits. A slash
 *   or any letter between two digit runs makes them two numbers.
 * - A plus sign is refused (so +63 numbers are not taken for bank accounts), and
 *   so is text with no number, or with two.
 *
 * Labels such as "BDO" or "Juan dela Cruz" are allowed; they are not checked.
 */
export function validateAccountNumber(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '') return 'Add where to send it.';
  if (text.includes('+')) return 'Use digits only, with no + sign.';
  const numbers = text.match(NUMBER_RUN) ?? [];
  if (numbers.length === 0) return 'Add your GCash number or bank account number.';
  if (numbers.length > 1) return 'Keep it to one number: your GCash or bank account number.';
  const digits = numbers[0].replace(/[^0-9]/g, '');
  const isWallet = /\b(gcash|maya)\b/i.test(text) || (!/[a-z]/i.test(text) && digits.startsWith('09'));
  if (isWallet) {
    return /^09[0-9]{9}$/.test(digits) ? null : 'A GCash number is 09 followed by 9 digits.';
  }
  return /^[0-9]{8,20}$/.test(digits) ? null : 'A bank account number is 8 to 20 digits.';
}
