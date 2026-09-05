import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// Shared with web/src/lib/api/client.ts's admin auth — same backend, same env
// var. Named distinctly from the admin's own cookies (tb_admin_*) so the two
// sessions never collide in the same browser.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const ACCESS_COOKIE = "tb_account_access";
export const REFRESH_COOKIE = "tb_account_refresh";

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function setAccountSession(session: Session) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const expiresInSeconds = Math.max(session.expires_at - Math.floor(Date.now() / 1000), 60);
  store.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: expiresInSeconds,
  });
  store.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — the access token above expires far sooner
  });
}

export async function clearAccountSession() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

const GOOGLE_NONCE_COOKIE = "tb_google_nonce";

/**
 * Login-CSRF guard for the Google round-trip. `/api/auth/google/callback`
 * otherwise trusts `access_token`/`refresh_token` straight off the query
 * string — anyone could craft that URL with tokens from an account *they*
 * control and get a victim to click it, silently signing the victim's
 * browser into the attacker's account (the backend's own signed `state`
 * only proves *its* callback ran a real Google exchange; it says nothing
 * about who lands on *our* callback afterward). `start` mints a one-time
 * value, stores it httpOnly, and stamps it onto the callback URL we hand
 * Google as `app_redirect`; `callback` only proceeds if the two match —
 * something only the browser that actually initiated this sign-in can
 * satisfy, since the cookie is httpOnly and same-site.
 */
export async function setGoogleNonce(): Promise<string> {
  const nonce = randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set(GOOGLE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // the whole Google round-trip should take seconds, not minutes
  });
  return nonce;
}

/** One-time: consumes (deletes) the cookie regardless of outcome. */
export async function consumeGoogleNonce(candidate: string | null): Promise<boolean> {
  const store = await cookies();
  const stored = store.get(GOOGLE_NONCE_COOKIE)?.value ?? null;
  store.delete(GOOGLE_NONCE_COOKIE);

  if (!stored || !candidate) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(candidate);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * CSRF guard for these routes. `logout` reads the session cookie (which the
 * browser attaches automatically, cross-site or not), so a forged POST from
 * another site could log a user out — and future routes here may end up
 * cookie-authenticated too. Checking Origin (falling back to Referer, since
 * not every browser sends Origin on every request) against the request's own
 * Host confirms the call actually came from a page we served, not a form on
 * some other site riding the browser's cookie jar.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return false;
}
