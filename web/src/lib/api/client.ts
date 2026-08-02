// ─── API client ───────────────────────────────────────────────────────────────
// The single place that talks to the real backend. Attaches the stored admin
// session's bearer token to every request; clears the session and surfaces a
// distinguishable ApiError on 401/403 so callers (AppContext) can force a
// logout.

import { clearStoredSession, getStoredSession, setStoredSession } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function send(path: string, token: string | undefined, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

/**
 * Exchange the stored refresh token for a new access token. Returns null when
 * there's nothing to refresh with or the refresh itself fails, in which case the
 * caller falls through to a normal 401.
 *
 * Concurrent 401s share one refresh so a dashboard load doesn't fire several.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = getStoredSession();
  if (!session?.refreshToken) return null;

  refreshInFlight ??= (async () => {
    try {
      const res = await send("/auth/refresh", undefined, {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        session: { access_token: string; refresh_token: string };
      };
      setStoredSession({
        ...session,
        accessToken: body.session.access_token,
        refreshToken: body.session.refresh_token,
      });
      return body.session.access_token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, getStoredSession()?.accessToken, init);

  // An expired access token used to be a hard logout. Try one refresh first.
  if (res.status === 401) {
    const renewed = await refreshAccessToken();
    if (renewed) res = await send(path, renewed, init);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) clearStoredSession();
    let message = `${init?.method ?? "GET"} ${path} → ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === "string") message = body.message;
    } catch {
      // body wasn't JSON — keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const client = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
