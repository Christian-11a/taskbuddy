import * as Crypto from 'expo-crypto';

/**
 * Binding a Google sign-in handoff to this app (backend migration 0071).
 *
 * The app keeps a random `verifier` and sends only its sha256 (`challenge`)
 * when it opens the authorize URL. The backend's callback then puts a
 * one-time `handoff_secret` on the redirect back to this device. A claim
 * needs the handoff id, that secret and the verifier, so neither someone who
 * started a sign-in for a victim nor something that intercepts the redirect
 * can collect the session.
 */

/** A sign-in waiting to be claimed. Kept on disk: the redirect can restart the app. */
export interface PendingGoogleSignIn {
  id: string;
  verifier: string;
  /** Set once the redirect back from the browser has been seen. */
  secret?: string;
  startedAt: number;
}

/** Two v4 UUIDs: ~244 random bits, well past what a claim can be guessed with. */
export function newVerifier(): string {
  return `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
}

/** Lower-case hex sha256 of the verifier, as the backend expects. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return digest.toLowerCase();
}

/**
 * The handoff secret on a redirect URL, but only when the URL is for this
 * pending sign-in: a link carrying some other handoff id is ignored.
 */
export function secretFromRedirect(
  url: string | null | undefined,
  handoffId: string,
): string | null {
  if (!url) return null;
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const params = new URLSearchParams(query);
  if (params.get('handoff') !== handoffId) return null;
  const secret = params.get('handoff_secret');
  return secret && secret.length >= 32 ? secret : null;
}

/** Reads a stored pending sign-in, accepting only the current shape. */
export function parsePending(raw: string | null): PendingGoogleSignIn | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingGoogleSignIn>;
    if (
      typeof value.id !== 'string' ||
      typeof value.verifier !== 'string' ||
      typeof value.startedAt !== 'number'
    )
      return null;
    return {
      id: value.id,
      verifier: value.verifier,
      startedAt: value.startedAt,
      ...(typeof value.secret === 'string' ? { secret: value.secret } : {}),
    };
  } catch {
    return null;
  }
}
