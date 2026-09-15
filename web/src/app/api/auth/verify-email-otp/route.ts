import { NextRequest, NextResponse } from "next/server";
import { API_URL, isSameOriginRequest, isSixDigitOtp, setAccountSession } from "../_session";

/** Exchanges the six-digit email code for a real session (POST /auth/verify-email-otp). */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Enter the 6-digit confirmation code." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !isSixDigitOtp((body as Record<string, unknown>).token)) {
    return NextResponse.json({ message: "Enter the 6-digit confirmation code." }, { status: 400 });
  }

  const upstream = await fetch(`${API_URL}/auth/verify-email-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { message: data?.message ?? "That code didn't work. Please try again." },
      { status: upstream.status }
    );
  }

  await setAccountSession(data.session);
  return NextResponse.json({ ok: true });
}
