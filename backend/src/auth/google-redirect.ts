/**
 * Allowlist for the `app_redirect` deep-link used by the Google OAuth flow.
 *
 * The callback appends a live Supabase access_token + refresh_token to this URI,
 * so anything that passes here can be handed a full session. Without a check,
 * /auth/google/authorize?app_redirect=https://evil.example is an account
 * takeover: the victim signs in normally and their tokens land on the
 * attacker's server.
 *
 * Only three shapes are legitimate for this app:
 *   taskbuddy://...          standalone / dev-client builds (mobile/app.json scheme)
 *   exp://<private-host>...  Expo Go, which points at the dev machine's LAN IP
 *   http://localhost:<port>  web + local browser development
 *
 * Note this is deliberately *not* gated on NODE_ENV: Expo Go is tested against
 * the deployed Render backend, so exp:// has to work in production too.
 */

/** LAN + loopback addresses only — blocks exp://evil.example. */
const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

/** Expo's tunnel hosts, used when `expo start --tunnel` replaces the LAN IP. */
const EXPO_TUNNEL_HOST = /(^|\.)(exp\.direct|exp\.host)$/;

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1)$/;

/** App schemes, as produced by `AuthSession.makeRedirectUri({ scheme: 'taskbuddy' })`. */
const APP_SCHEMES = new Set(['taskbuddy:', 'exp+taskbuddy:']);

/**
 * True when `uri` is a redirect target we are willing to put session tokens on.
 *
 * Rejects anything unparseable, any unknown scheme, and any URI carrying a
 * fragment (the callback builds its query string by hand, and a `#` would push
 * the tokens into the fragment where the app's parser never looks).
 */
export function isAllowedAppRedirect(uri: string): boolean {
  if (!uri) return false;

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  if (parsed.hash) return false;

  if (APP_SCHEMES.has(parsed.protocol)) return true;

  if (parsed.protocol === 'exp:') {
    return (
      PRIVATE_HOST.test(parsed.hostname) ||
      EXPO_TUNNEL_HOST.test(parsed.hostname)
    );
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return LOOPBACK_HOST.test(parsed.hostname);
  }

  return false;
}

/**
 * Appends `params` to `appRedirect`, respecting a query string the deep-link
 * may already carry. `${uri}?${params}` would produce a second `?` and the app
 * would read the tokens as part of an earlier parameter's value.
 */
export function appendRedirectParams(
  appRedirect: string,
  params: URLSearchParams,
): string {
  const separator = appRedirect.includes('?') ? '&' : '?';
  return `${appRedirect}${separator}${params.toString()}`;
}
