/**
 * Features the mobile app says it understands, sent as
 * `X-Client-Features: revoked-status, ...`. The app has no version header, so
 * this is how the API keeps older APKs working when a response gains a value
 * they do not know.
 */
export function clientFeatures(
  header: string | string[] | undefined,
): Set<string> {
  const raw = Array.isArray(header) ? header.join(',') : (header ?? '');
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** The app shows 'revoked' verifications itself (the revoke screens, migration 0080). */
export function knowsRevoked(header: string | string[] | undefined): boolean {
  return clientFeatures(header).has('revoked-status');
}
