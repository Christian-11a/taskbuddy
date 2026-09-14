import { NextRequest, NextResponse } from "next/server";
import { API_URL, isSameOriginRequest } from "../_session";

/**
 * Proxies a signup-code resend without revealing whether the address exists.
 * Supabase/backend intentionally use the same success response for this flow.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }

  await fetch(`${API_URL}/auth/send-email-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    // Keep the response indistinguishable from an unknown address.
  });

  return NextResponse.json({ success: true });
}
