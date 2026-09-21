/**
 * Allowlist for the `app_redirect` deep-link used by the Google OAuth flow.
 *
 * The callback appends a live Supabase access_token + refresh_token to this URI,
 * so anything that passes here can be handed a full session. Without a check,
 * /auth/google/authorize?app_redirect=https://evil.example is an account
 * takeover: the victim signs in normally and their tokens land on the
 * attacker's server.
 *
 * Only four shapes are legitimate for this app:
 *   taskbuddy://...              standalone / dev-client builds (mobile/app.json scheme)
 *   exp://<private-host>...      Expo Go, which points at the dev machine's LAN IP
 *   http://localhost:<port>      web + local browser development
 *   https://<WEB_PROD_HOST>      the deployed web console / promo site
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

/** The deployed web admin console / promo site on Vercel. */
const WEB_PROD_HOST = /^taskbuddy-nine-zeta\.vercel\.app$/;

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

  if (parsed.protocol === 'http:') {
    return LOOPBACK_HOST.test(parsed.hostname);
  }

  if (parsed.protocol === 'https:') {
    return (
      LOOPBACK_HOST.test(parsed.hostname) || WEB_PROD_HOST.test(parsed.hostname)
    );
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

/** True for the app's own deep links, which a browser cannot be 302'd into. */
export function isAppSchemeRedirect(uri: string): boolean {
  return /^(taskbuddy|exp\+taskbuddy|exp):/i.test(uri);
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );

/**
 * A JS string literal safe to inline. `JSON.stringify` alone is not: it leaves
 * `<` as-is, so a link containing `</script>` would end the block early and
 * the rest of the URL would be parsed as markup. Escaping `<` closes that
 * without changing what the string means to the browser.
 */
const scriptString = (value: string) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * The page the OAuth callback answers with when the redirect target is the
 * app's own scheme.
 *
 * **A 302 to `taskbuddy://` does not work in Chrome.** Chrome only follows a
 * navigation into an external app scheme when the page itself asks for it —
 * a server redirect into one is dropped, and the tab sits on a spinner while
 * the app waits for a callback that will never arrive. That is what made
 * Google sign-in look like it hung on Android.
 *
 * So the callback returns this instead: a page that asks for the deep link
 * from script the moment it loads, with a link the user can tap if the
 * browser refuses that too (some in-app browsers only honour a real gesture).
 *
 * The URL carries the session tokens, so the page must not be cached — the
 * controller sends `Cache-Control: no-store` with it — and nothing here is
 * ever logged or shown as text.
 */
export function renderAppRedirectPage(deepLink: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Signing you in…</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#F1F5F9; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .card { text-align:center; padding:32px 24px; }
  h1 { color:#063D4D; font-size:19px; margin:0 0 8px; }
  p { color:#64748B; font-size:15px; margin:0 0 20px; }
  a { display:inline-block; background:#096E8B; color:#fff; text-decoration:none;
      padding:12px 22px; border-radius:12px; font-size:16px; font-weight:600; }
</style>
</head>
<body>
  <div class="card">
    <h1>Signing you in…</h1>
    <p>Returning you to TaskBuddy.</p>
    <a id="continue" href="${escapeHtml(deepLink)}">Open TaskBuddy</a>
  </div>
  <script>window.location.replace(${scriptString(deepLink)});</script>
</body>
</html>`;
}
