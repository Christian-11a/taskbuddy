/**
 * The server answers HTTP 409 with a plain message (no error code) when an
 * account is at a capacity limit (migration 0048): active jobs, pending
 * proposals, a provider's active jobs, an overlapping booking or the daily
 * work limit. Other 409s (job changed, provider not verified) are not limits,
 * so they are told apart by the message.
 */
const CAPACITY_MESSAGE =
  /active jobs?|pending applications?|pending proposals?|overlapping booking|daily work limit/i;

/**
 * The wording for a hire the server refuses because of the provider's verification (409 `provider_not_certified`
 * or `provider_not_verified`), or null for any other error. Shown in the same one-button dialog as a capacity limit.
 */
export function hireVerificationMessage(error: unknown): string | null {
  const { status, code, details } = (error ?? {}) as { status?: unknown; code?: unknown; details?: { code?: unknown } | null };
  if (status !== 409) return null;
  const reason = typeof code === 'string' ? code : details?.code;
  if (reason === 'provider_not_certified') return "This provider can't be hired for this service yet.";
  if (reason === 'provider_not_verified') return "This provider isn't verified yet.";
  return null;
}

/** The server's message when `error` is a capacity-limit 409, else null. Uses the app's "proposal" wording. */
export function capacityConflictMessage(error: unknown): string | null {
  const { status, message } = (error ?? {}) as { status?: unknown; message?: unknown };
  if (status !== 409 || typeof message !== 'string' || !CAPACITY_MESSAGE.test(message)) return null;
  return message
    .replace(/applying again/gi, 'sending another proposal')
    .replace(/applications/gi, 'proposals')
    .replace(/application/gi, 'proposal');
}
