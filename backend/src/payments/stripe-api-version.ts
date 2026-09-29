/** Stripe's full name for the version the mobile ephemeral keys are pinned to. */
export const DEFAULT_MOBILE_API_VERSION = '2025-01-27.acacia';

const VERSION_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(\.[a-z]+)?$/;

/**
 * Resolves STRIPE_MOBILE_API_VERSION. A typo in that env var (it once held
 * `2025-21-27`) made Stripe 400 every identity session and top-up, so a
 * malformed value is logged and replaced with the default instead of sent.
 *
 * This only catches malformed strings. A well-formed version Stripe does not
 * know still fails at Stripe; startIdentitySession maps that to a 503.
 */
export function resolveMobileApiVersion(
  raw: string | undefined,
  warn: (msg: string) => void = () => {},
): string {
  const value = raw?.trim() ?? '';
  if (!value) return DEFAULT_MOBILE_API_VERSION;
  if (VERSION_RE.test(value)) return value;
  warn(
    `STRIPE_MOBILE_API_VERSION "${value}" is not a valid Stripe API version; using ${DEFAULT_MOBILE_API_VERSION}`,
  );
  return DEFAULT_MOBILE_API_VERSION;
}
