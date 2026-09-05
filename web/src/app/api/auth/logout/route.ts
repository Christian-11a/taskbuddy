import { NextResponse } from "next/server";
import { API_URL, clearAccountSession, getAccessToken } from "../_session";

export async function POST() {
  const accessToken = await getAccessToken();

  if (accessToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {
      // Best-effort — the cookie is cleared either way, so the browser is
      // signed out locally even if the backend call itself fails.
    });
  }

  await clearAccountSession();
  return NextResponse.json({ ok: true });
}
