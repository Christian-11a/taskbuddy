import { NextRequest, NextResponse } from "next/server";
import { API_URL, isSameOriginRequest } from "../_session";

/**
 * Proxies POST /auth/forgot-password. The backend always returns 200
 * regardless of whether the address exists (an unauthenticated caller
 * shouldn't be able to enumerate accounts) — this route just forwards that
 * behavior unchanged.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  const body = await req.json();

  await fetch(`${API_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    // Same reasoning as the backend: don't let a network hiccup here leak
    // information either. The UI shows the same "check your email" message
    // regardless.
  });

  return NextResponse.json({ success: true });
}
