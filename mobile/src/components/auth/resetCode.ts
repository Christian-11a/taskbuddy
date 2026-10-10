/**
 * Pure helpers for the six-box reset code and the reset screen's copy.
 *
 * The boxes sit over one hidden text input, so the input's text is the source
 * of truth. These functions turn each change of that text into the next code:
 * typing extends it (auto-advance), deleting shortens it (backspace moves back),
 * and a paste of any length fills what it can (paste fills all six).
 */

export const CODE_LENGTH = 6;

/**
 * The next code, given the code shown now and the text the hidden input just
 * reported. Digits only, at most six.
 */
export function applyCodeInput(current: string, incoming: string): string {
  const digits = incoming.replace(/\D/g, '');
  // A paste (or autofill) arrives as a jump of more than one character. When
  // it lands after the digits already typed, keep only the pasted part.
  if (digits.length > current.length + 1) {
    const pasted = digits.startsWith(current) ? digits.slice(current.length) : digits;
    return pasted.slice(0, CODE_LENGTH);
  }
  return digits.slice(0, CODE_LENGTH);
}

/** What each of the six boxes shows: its digit, or '' when empty. */
export function boxCharacters(code: string): string[] {
  return Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
}

/** The box the next digit goes in, or the last box once the code is full. */
export function activeBoxIndex(code: string): number {
  return Math.min(code.length, CODE_LENGTH - 1);
}

/**
 * Masks the local part of an address for display: "ana.reyes@example.com"
 * becomes "an•••s@example.com". The domain is shown in full.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const shown = local.length > 4
    ? `${local.slice(0, 2)}•••${local.slice(-1)}`
    : `${local.slice(0, 1)}•••`;
  return `${shown}@${domain}`;
}

/** Seconds as m:ss, e.g. 42 -> "0:42", 60 -> "1:00". */
export function formatCooldown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}
