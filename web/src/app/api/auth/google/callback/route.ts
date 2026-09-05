import { NextRequest, NextResponse } from "next/server";
import { consumeGoogleNonce, setAccountSession } from "../../_session";

/**
 * Where the backend's `/auth/google/callback` sends the browser back to,
 * carrying the session as query params (its own contract — see
 * `backend/src/auth/auth.controller.ts`). This is the only place those
 * tokens are ever visible to anything other than the backend: it turns them
 * straight into the same httpOnly cookies login/register use, then drops the
 * URL that briefly carried them.
 *
 * The `nonce` check (see `consumeGoogleNonce` in `_session.ts`) comes first
 * and unconditionally, before even looking at `google_error` — without it,
 * this endpoint would accept tokens from anyone who crafts the URL directly,
 * not just from a genuine Google round-trip this browser started.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const origin = req.nextUrl.origin;

  const nonceOk = await consumeGoogleNonce(searchParams.get("nonce"));
  if (!nonceOk) {
    const url = new URL("/", origin);
    url.searchParams.set("google_error", "That sign-in link is invalid or has expired. Please try again.");
    url.hash = "login";
    return NextResponse.redirect(url);
  }

  const googleError = searchParams.get("google_error");
  const accessToken = searchParams.get("access_token");
  const refreshToken = searchParams.get("refresh_token");
  const expiresAt = searchParams.get("expires_at");

  if (googleError || !accessToken || !refreshToken || !expiresAt) {
    const url = new URL("/", origin);
    url.searchParams.set("google_error", googleError || "Google sign-in failed.");
    url.hash = "login";
    return NextResponse.redirect(url);
  }

  await setAccountSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Number(expiresAt),
  });

  return NextResponse.redirect(new URL("/account", origin));
}
