import { NextRequest, NextResponse } from "next/server";
import { API_URL, isSameOriginRequest, setAccountSession } from "../_session";

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  }

  const body = await req.json();

  const upstream = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { message: data?.message ?? "Invalid email or password." },
      { status: upstream.status }
    );
  }

  await setAccountSession(data.session);
  return NextResponse.json({ ok: true });
}
