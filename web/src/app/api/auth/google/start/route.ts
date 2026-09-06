import { NextRequest, NextResponse } from "next/server";
import { API_URL, setGoogleNonce } from "../../_session";

/**
 * Kicks off Google sign-in. `auth.js` just navigates the browser here rather
 * than building the backend URL itself, so the backend's origin stays a
 * server-side detail (same reasoning as every other route in `api/auth/*`).
 *
 * Also mints the login-CSRF nonce (see `setGoogleNonce` in `_session.ts`) and
 * stamps it onto our own callback URL, so `callback` can confirm this
 * specific browser is the one that started the round-trip.
 */
export async function GET(req: NextRequest) {
  const nonce = await setGoogleNonce();

  const appRedirect = new URL("/api/auth/google/callback", req.nextUrl.origin);
  appRedirect.searchParams.set("nonce", nonce);

  const target = new URL(`${API_URL}/auth/google/authorize`);
  target.searchParams.set("app_redirect", appRedirect.toString());
  return NextResponse.redirect(target.toString());
}
