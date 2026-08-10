// ─── Form validation ──────────────────────────────────────────────────────────
// Shared client-side validation rules. Each validator returns an error message
// string, or null when the value is valid — so callers can do:
//   const err = validateEmail(email); if (err) { ... }

/** Pragmatic email check: something@something.tld, no spaces. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_MIN_LENGTH = 8;
/** Matches the backend's `@Length(1, 120)` on `full_name`
 *  (profiles.dto.ts `UpdateProfileDto`) — was wrongly set to 60 here, which
 *  rejected legitimate 61–120 char names the backend would have accepted. */
export const NAME_MAX_LENGTH = 120;
/** Matches the backend's `@MaxLength(500)` on suspend/reject reasons
 *  (admin.dto.ts, verifications.dto.ts) — validating here catches an
 *  over-length reason before the round trip, not after a 400 comes back. */
export const REASON_MAX_LENGTH = 500;
/** Matches `ResolveDisputeDto.note` (`@MaxLength(1000)`, escrow.dto.ts). */
export const NOTE_MAX_LENGTH = 1000;
/** Sanity ceiling for a suspension length, in days (10 years) — the backend
 *  only requires a positive integer (`@IsInt() @IsPositive()`), with no upper
 *  bound at all. Left unchecked client-side, a `number` input's `min`
 *  attribute doesn't stop someone typing `1e5` — scientific notation is valid
 *  input for `type="number"` — and suspending a user for 100,000 days with no
 *  warning shown anywhere. */
export const SUSPENSION_MAX_DAYS = 3650;

/**
 * Validates the optional "duration in days" field on a suspension. Empty is
 * valid — it means indefinite, not zero. Checks against the exact string the
 * caller is about to `Number(...)` and send, so this can never pass something
 * the submit path would then interpret differently.
 */
export function validateDurationDays(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return "Duration must be a whole number of days.";
  if (n < 1) return "Duration must be at least 1 day.";
  if (n > SUSPENSION_MAX_DAYS) return `Duration must be ${SUSPENSION_MAX_DAYS} days or fewer.`;
  return null;
}

export function validateRequired(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required.`;
  return null;
}

export function validateEmail(value: string, label = "Email"): string | null {
  const required = validateRequired(value, label);
  if (required) return required;
  if (!EMAIL_RE.test(value.trim())) return `${label} must be a valid email address.`;
  return null;
}

export function validateName(value: string, label = "Name"): string | null {
  const required = validateRequired(value, label);
  if (required) return required;
  if (value.trim().length < 2) return `${label} must be at least 2 characters.`;
  if (value.trim().length > NAME_MAX_LENGTH) return `${label} must be ${NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

/** Standard password strength: min length + at least one letter and one number. */
export function validatePassword(value: string, label = "Password"): string | null {
  if (!value) return `${label} is required.`;
  if (value.length < PASSWORD_MIN_LENGTH) return `${label} must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[a-zA-Z]/.test(value)) return `${label} must contain at least one letter.`;
  if (!/[0-9]/.test(value)) return `${label} must contain at least one number.`;
  return null;
}

export interface PasswordChangeErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

/** Validates the change-password trio. Assumes the caller only invokes this
 *  when a change is being attempted (i.e. newPassword is non-empty). */
export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!currentPassword) errors.currentPassword = "Enter your current password to set a new one.";
  const strength = validatePassword(newPassword, "New password");
  if (strength) errors.newPassword = strength;
  else if (newPassword === currentPassword) errors.newPassword = "New password must be different from the current password.";
  if (!errors.newPassword && confirmPassword !== newPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}
