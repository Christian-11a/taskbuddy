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

/** Provider bio bounds, from UpsertProviderProfileDto and the `bio` CHECK (20 to 400). */
export const BIO_MIN = 20;
export const BIO_MAX = 400;

/**
 * The text as it is sent: line endings become "\n" and the ends are trimmed. Nothing inside the
 * text changes, so the blank lines and spaces a person typed in the middle are sent as typed.
 */
export function cleanText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
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

/**
 * The provider bio's rule, worded like the title's: at least 20 characters once
 * cleaned, so empty and spaces-only are too short; at most 400 units, the same
 * count the API's @Length uses.
 */
export function validateBio(value: string): string | null {
  if (textLength(value) < BIO_MIN) return `Bio must be at least ${BIO_MIN} characters.`;
  if (textUnits(value) > BIO_MAX) return `Bio cannot exceed ${BIO_MAX} characters.`;
  return null;
}

/** Digits, with the separators people type between them (spaces, dashes, dots, commas, brackets), as one run. */
const NUMBER_RUN = /[0-9]+(?:[ .,()-]+[0-9]+)*/g;

/**
 * A withdrawal destination. It is free text a person reads and pays from, so the
 * rule is about the one number in it:
 *
 * - With a GCash or Maya name, the number is a mobile number: 09 followed by 9 digits.
 * - A +63 before the number is the country code of a mobile number, read as the 0
 *   that starts one, so "GCash +63 917 123 4567" is a GCash number. A +63 number is
 *   a mobile number with or without a name, and 63 with no plus sign reads the same.
 * - With no name, the number is a mobile number (as above) or a bank account number
 *   of 8 to 20 digits. So 09171234567 is a mobile and 0912345678 a bank account.
 * - Spaces, dashes, dots, commas and brackets may separate the digits. A slash
 *   or any letter between two digit runs makes them two numbers.
 * - Any other plus sign is refused, and so is text with no number, or with two.
 *
 * Labels such as "BDO" or "Juan dela Cruz" are allowed; they are not checked.
 */
export function validateAccountNumber(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '') return 'Add where to send it.';
  const local = text.replace(/\+63(?=[ .,()-]*[0-9])/g, '0');
  if (local.includes('+')) return 'Use digits only, with no + sign.';
  const numbers = local.match(NUMBER_RUN) ?? [];
  if (numbers.length === 0) return 'Add your GCash number or bank account number.';
  if (numbers.length > 1) return 'Keep it to one number: your GCash or bank account number.';
  const digits = (numbers[0] ?? '').replace(/[^0-9]/g, '');
  // A mobile number written with the country code 63 (no plus sign) reads with the 0 instead.
  const mobile = digits.length === 12 && digits.startsWith('63') ? `0${digits.slice(2)}` : digits;
  const isMobile = /^09[0-9]{9}$/.test(mobile);
  if (/\b(gcash|maya)\b/i.test(text)) {
    return isMobile ? null : 'A GCash number is 09 followed by 9 digits.';
  }
  const hasCountryCode = local !== text;
  if (hasCountryCode) {
    return isMobile ? null : 'A +63 number must be a mobile number, such as +63 917 123 4567.';
  }
  return isMobile || /^[0-9]{8,20}$/.test(digits) ? null : 'A bank account number is 8 to 20 digits.';
}
