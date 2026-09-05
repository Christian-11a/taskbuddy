import { NextRequest, NextResponse } from "next/server";
import { API_URL, setAccountSession } from "../_session";

/**
 * Proxies POST /auth/register on the real backend. The backend returns the
 * session (or null tokens for null when email confirmation is required) in
 * the JSON body — this route is what turns that into an httpOnly cookie, the
 * web equivalent of mobile's SecureStore. Tokens never reach client JS.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const upstream = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { message: data?.message ?? "Unable to create account." },
      { status: upstream.status }
    );
  }

  if (!data?.session) {
    // Backend requires email confirmation before a session exists.
    return NextResponse.json({ needsEmailConfirmation: true });
  }

  await setAccountSession(data.session);
  return NextResponse.json({ needsEmailConfirmation: false });
}
