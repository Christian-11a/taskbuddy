/**
 * Where the admin console sends its API calls. Kept free of imports so that
 * next.config.ts, the server route handlers and the browser client can all use
 * the same rules.
 *
 * Why a same-origin path exists at all: the admin session is a set of cookies
 * issued by the API. Browsers on phones (iOS Safari, in-app browsers, and
 * Chrome/Brave/Firefox with third-party cookie blocking) refuse cookies that a
 * page on one site receives from an API on another site. Sending the calls
 * through the console's own origin makes the cookies first-party. A Next.js
 * rewrite forwards `/backend/*` to the real API on the server side.
 */

/** Default for local development, when NEXT_PUBLIC_API_URL is unset. */
export const DEFAULT_API_URL = "http://localhost:3001";

/** Same-origin path the browser calls; forwarded to the API by a rewrite. */
export const SAME_ORIGIN_API_PATH = "/backend";

export interface ApiRewrite {
  source: string;
  destination: string;
}

/** A path on this origin, such as "/backend". Protocol-relative "//host" is not. */
export function isRelativeApiUrl(url: string): boolean {
  return /^\/(?!\/)/.test(url);
}

/**
 * Checks ADMIN_API_PROXY_TARGET and returns it without a trailing slash. It
 * must be an absolute http(s) URL, because it becomes a rewrite destination.
 */
export function normalizeProxyTarget(target: string): string {
  const trimmed = target.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`ADMIN_API_PROXY_TARGET must be an absolute http(s) URL, got "${target}".`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`ADMIN_API_PROXY_TARGET must be an absolute http(s) URL, got "${target}".`);
  }
  return trimmed.replace(/\/+$/, "");
}

/**
 * Rewrites that forward the same-origin API path to the API. Returns none
 * unless ADMIN_API_PROXY_TARGET is set, so a deployment that keeps calling the
 * API directly is unchanged.
 *
 * Throws on a misconfiguration that would otherwise fail silently: a relative
 * NEXT_PUBLIC_API_URL with no proxy target, or one that is not the proxy path.
 */
export function adminApiRewrites(env: {
  publicApiUrl?: string;
  proxyTarget?: string;
}): ApiRewrite[] {
  const publicApiUrl = env.publicApiUrl;
  const relative = publicApiUrl !== undefined && isRelativeApiUrl(publicApiUrl);
  if (relative && publicApiUrl !== SAME_ORIGIN_API_PATH) {
    throw new Error(
      `NEXT_PUBLIC_API_URL must be "${SAME_ORIGIN_API_PATH}" when it is a relative path, got "${publicApiUrl}".`,
    );
  }

  const target = env.proxyTarget?.trim();
  if (!target) {
    if (relative) {
      throw new Error(
        `NEXT_PUBLIC_API_URL is "${SAME_ORIGIN_API_PATH}" but ADMIN_API_PROXY_TARGET is not set. ` +
          "Set ADMIN_API_PROXY_TARGET to the API's https origin, or set NEXT_PUBLIC_API_URL to that origin.",
      );
    }
    return [];
  }

  return [
    {
      source: `${SAME_ORIGIN_API_PATH}/:path*`,
      destination: `${normalizeProxyTarget(target)}/:path*`,
    },
  ];
}

/**
 * Base URL for server-side fetches (route handlers and server components).
 * Server fetch() cannot resolve a relative URL, so when NEXT_PUBLIC_API_URL is
 * the same-origin path, the server calls the API's absolute proxy target.
 * With no proxy target, the relative value is returned and the fetch fails
 * loudly, which adminApiRewrites also reports at build time.
 */
export function serverApiUrl(publicApiUrl: string | undefined, proxyTarget: string | undefined): string {
  const base = publicApiUrl ?? DEFAULT_API_URL;
  if (!isRelativeApiUrl(base)) return base;
  const target = proxyTarget?.trim();
  return target ? normalizeProxyTarget(target) : base;
}
