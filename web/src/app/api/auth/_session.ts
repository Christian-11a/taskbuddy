import { cookies } from "next/headers";

// Shared with web/src/lib/api/client.ts's admin auth — same backend, same env
// var. Named distinctly from the admin's own cookies (tb_admin_*) so the two
// sessions never collide in the same browser.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const ACCESS_COOKIE = "tb_account_access";
export const REFRESH_COOKIE = "tb_account_refresh";

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function setAccountSession(session: Session) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const expiresInSeconds = Math.max(session.expires_at - Math.floor(Date.now() / 1000), 60);
  store.set(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: expiresInSeconds,
  });
  store.set(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — the access token above expires far sooner
  });
}

export async function clearAccountSession() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}
