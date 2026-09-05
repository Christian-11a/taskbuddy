import { NextRequest, NextResponse } from "next/server";
import { API_URL, isSameOriginRequest, setAccountSession } from "../_session";

/**
 * Proxies POST /auth/reset-password. Unlike forgot-password, this one really
 * can fail (wrong/expired code) and really does return a session on success —
 * the user just proved they hold the mailbox, so they're logged in immediately
 * rather than being sent back to a plain Sign In they'd have to repeat.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  const body = await req.json();

  const upstream = await fetch(`${API_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { message: data?.message ?? "That reset code is invalid or has expired." },
      { status: upstream.status }
    );
  }

  await setAccountSession(data.session);
  return NextResponse.json({ ok: true });
}
