import { NextRequest, NextResponse } from "next/server";
import { API_URL, isSameOriginRequest, setAccountSession } from "../_session";

/**
 * Proxies POST /auth/register on the real backend. The backend returns the
 * session (or null tokens for null when email confirmation is required) in
 * the JSON body — this route is what turns that into an httpOnly cookie, the
 * web equivalent of mobile's SecureStore. Tokens never reach client JS.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid registration request." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Invalid registration request." }, { status: 400 });
  }

  const registration = body as Record<string, unknown>;
  if (
    registration.consented_terms !== true ||
    registration.consented_privacy !== true ||
    registration.consented_data_collection !== true
  ) {
    return NextResponse.json(
      { message: "Please accept the required consents to continue." },
      { status: 400 },
    );
  }

  if (registration.role === "provider") {
    const categoryId = registration.category_id;
    if (
      registration.consented_biometric !== true ||
      typeof categoryId !== "number" ||
      !Number.isInteger(categoryId) ||
      categoryId < 1 ||
      categoryId > 5
    ) {
      return NextResponse.json(
        { message: "Choose a skill category and accept the provider consent to continue." },
        { status: 400 },
      );
    }
  }

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
