/**
 * Input rules for the sign-in, sign-up, profile and account screens.
 *
 * Each validator returns null when the value is acceptable, or the short message
 * to show under the field. Each sanitizer returns the value to store and send.
 * Pure functions with no network or React, so every rule is tested on its own.
 *
 * The backend checks phone only as a string, so the app enforces the Philippine
 * mobile format here. Name, email and password rules follow the backend limits
 * (name 1-120, email format, password at least 8) and are stricter where asked.
 */

// ── Phone ─────────────────────────────────────────────────────────────────────

const PHONE_DIGITS = 11;

/**
 * Native cap for the phone box. It is not 11 on purpose: a native cap cuts a
 * pasted "+63 917 123 4567" before sanitizePhone sees the whole number. The
 * eleven-digit cap is enforced by sanitizePhone.
 */
export const PHONE_INPUT_MAX_LENGTH = 20;

const PHONE_FORMAT_MESSAGE = 'Enter an 11-digit mobile number starting with 09, e.g. 09171234567';
const PHONE_REQUIRED_MESSAGE = 'Phone number is required';

/**
 * Digits only, at most eleven. A country-code form such as "+63 917 123 4567" or
 * "+63 0917 123 4567" becomes the local form "09171234567".
 */
export function sanitizePhone(raw: string | null | undefined): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length > PHONE_DIGITS && digits.startsWith('63')) {
    digits = `0${digits.slice(2).replace(/^0/, '')}`;
  }
  return digits.slice(0, PHONE_DIGITS);
}

/** Valid only as 09 followed by nine digits. Empty is allowed unless `required`. */
export function validatePhone(
  value: string | null | undefined,
  options: { required?: boolean } = {},
): string | null {
  const phone = (value ?? '').trim();
  if (!phone) return options.required ? PHONE_REQUIRED_MESSAGE : null;
  return /^09\d{9}$/.test(phone) ? null : PHONE_FORMAT_MESSAGE;
}

// ── Names and cities ──────────────────────────────────────────────────────────

/** The longest full name, the backend's profile bound (1 to 120). Also the field's maxLength. */
export const FULL_NAME_MAX = 120;
/** The longest city or municipality the rule takes. Also the field's maxLength. */
export const CITY_MAX = 80;

/** Trims and collapses runs of whitespace to one space. */
export function normalizeName(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Latin letters with accents (ñ, é, Ø, Vietnamese letters), the combining marks
 * that decomposed accents use, Japanese kana (U+3040 to U+30FF), Chinese characters
 * (U+4E00 to U+9FFF) and Korean hangul (U+AC00 to U+D7AF), space, apostrophe (straight
 * or curly), hyphen, period, comma and parentheses.
 * Written out as ranges rather than with \p{L}, so the check never depends on the
 * engine's Unicode property support. Digits, emoji, other symbols and other scripts
 * are refused.
 */
const NAME_CHARACTERS = /^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ̀-ͯ぀-ヿ一-鿿가-힯 '’.,()-]+$/;
/** A letter a name can hold: the letters above, without the marks and punctuation. */
const NAME_LETTER = /[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ぀-ヿ一-鿿가-힯]/;
const LETTER = /[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]/;
const DIGIT = /[0-9]/;

/** Shared checks for a name-like value that is already non-empty after trimming. */
function checkNameLike(text: string, label: string, min: number, max: number): string | null {
  if (DIGIT.test(text)) return `${label} can't include numbers`;
  if (!NAME_CHARACTERS.test(text)) {
    return `${label} can only use letters, spaces, hyphens, apostrophes and periods`;
  }
  if (!NAME_LETTER.test(text)) return `${label} must include a letter`;
  if (text.length < min) return `${label} must be at least ${min} characters`;
  if (text.length > max) return `${label} must be ${max} characters or fewer`;
  return null;
}

/** A full name: 2 to 120 characters, letters only apart from spaces, hyphens, apostrophes, periods, commas and parentheses. */
export function validateFullName(value: string | null | undefined): string | null {
  const name = normalizeName(value);
  if (!name) return 'Enter your full name';
  return checkNameLike(name, 'Full name', 2, FULL_NAME_MAX);
}

/** A city or municipality: optional unless `required`, 2 to 80 characters (short Philippine names such as "Cebu" pass). */
export function validateCity(
  value: string | null | undefined,
  options: { required?: boolean } = {},
): string | null {
  const city = normalizeName(value);
  if (!city) return options.required ? 'Enter your city' : null;
  return checkNameLike(city, 'City', 2, CITY_MAX);
}

// ── Email ─────────────────────────────────────────────────────────────────────

/** The longest email address: 254 characters, the limit of the address format. Also the field's maxLength. */
export const EMAIL_MAX = 254;

const EMAIL_PATTERN = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Trimmed and lower-cased, for comparing addresses. Sent to the server trimmed only. */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

/** Standard address shape, at most 254 characters, local part at most 64. */
export function validateEmail(value: string | null | undefined): string | null {
  const email = normalizeEmail(value);
  if (!email) return 'Enter your email address';
  const localLength = email.indexOf('@');
  if (email.length > EMAIL_MAX || localLength > 64 || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address';
  }
  return null;
}

// ── Address ───────────────────────────────────────────────────────────────────

/** The longest street address the profile takes. Also the field's maxLength. */
export const ADDRESS_MAX = 200;

/** A street address: 5 to 200 characters after trimming, with at least one letter or number. */
export function validateAddress(
  value: string | null | undefined,
  options: { required?: boolean; requiredMessage?: string } = {},
): string | null {
  const address = (value ?? '').trim();
  if (!address) return options.required ? (options.requiredMessage ?? 'Enter your address') : null;
  if (address.length < 5) return 'Address must be at least 5 characters';
  if (address.length > ADDRESS_MAX) return 'Address must be 200 characters or fewer';
  if (!LETTER.test(address) && !DIGIT.test(address)) return 'Address must include a letter or number';
  return null;
}

// ── Passwords and codes ───────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8;

/**
 * The rule every new password meets: at least eight characters, and not only
 * spaces. The label names the field in the message (for example "New password").
 * The minimum is the backend's own, so it is never weaker here.
 */
export function validatePasswordRules(value: string | null | undefined, label = 'Password'): string | null {
  const password = value ?? '';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `${label} must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!password.trim()) return `${label} can't be only spaces.`;
  return null;
}

/** A new password must not be the one already in use. Exact match, so capitals count as different. */
export function validateNewPasswordDiffers(
  current: string | null | undefined,
  next: string | null | undefined,
): string | null {
  if (!current || !next) return null;
  return current === next ? "Choose a password you haven't used here" : null;
}

export const OTP_LENGTH = 6;

/** Digits only, at most six. Pasted codes with spaces or dashes keep their digits. */
export function sanitizeOtp(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, OTP_LENGTH);
}

/** Exactly six digits. */
export function validateOtpCode(value: string | null | undefined): string | null {
  return /^\d{6}$/.test((value ?? '').trim()) ? null : 'Enter the 6-digit code from your email';
}

// ── Service radius ────────────────────────────────────────────────────────────

const RADIUS_MIN_KM = 0.5;
const RADIUS_MAX_KM = 1000;

/** Optional. When given, a number from 0.5 to 1000 km, the backend's own bounds. */
export function validateServiceRadius(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  const km = Number(text);
  const valid = /^\d+(\.\d+)?$/.test(text) && km >= RADIUS_MIN_KM && km <= RADIUS_MAX_KM;
  return valid ? null : 'Enter a service radius from 0.5 to 1000 km';
}
