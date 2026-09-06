import { NextRequest, NextResponse } from "next/server";
import { API_URL, getAccessToken, isSameOriginRequest } from "../_session";

/**
 * Proxies POST /auth/complete-google-profile. Unlike the other auth routes,
 * this one needs the caller to already be signed in — it's cookie-authenticated
 * (the access token never leaves the server), so the CSRF guard applies here too.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: "Please sign in again." }, { status: 401 });
  }

  const body = await req.json();

  const upstream = await fetch(`${API_URL}/auth/complete-google-profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { message: data?.message ?? "Unable to save your profile. Please try again." },
      { status: upstream.status }
    );
  }

  return NextResponse.json({ ok: true });
}
