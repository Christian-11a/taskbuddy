import { clearAdminSession, getCsrfToken, setCsrfToken } from "./session";

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

function isUnsafeMethod(method?: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method ?? "GET");
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const csrfToken = getCsrfToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(isUnsafeMethod(init?.method) && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...init?.headers,
    },
  });

}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= send("/auth/admin/refresh", { method: "POST" })
    .then(async (res) => {
      if (!res.ok) return false;
      const body = (await res.json()) as { csrf_token?: unknown };
      if (typeof body.csrf_token !== "string" || !body.csrf_token) return false;
      setCsrfToken(body.csrf_token);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init);
  if (res.status === 401 && path !== "/auth/admin/refresh" && await refreshSession()) {
    res = await send(path, init);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) clearAdminSession();
    let message = `${init?.method ?? "GET"} ${path} -> ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === "string") message = body.message;
    } catch {
      // body wasn't JSON - keep the generic message
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
