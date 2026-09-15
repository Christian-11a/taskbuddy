import { clearAdminSession, getCsrfToken, setCsrfToken } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Seconds the rate limiter asked for, from `Retry-After` — only on a 429. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * How a 429 is retried. The API's throttler rejects *before* the handler runs
 * (backend/BACKEND_SCHEMA.md §28.4), so a rate-limited request did nothing and
 * retrying it is safe for every method, POSTs included. The cap keeps a bulk
 * action from sitting silently for a minute: a wait longer than
 * `maxWaitSeconds` fails straight away with the real reason instead.
 */
export const RATE_LIMIT_RETRY = {
  attempts: 2,
  baseDelaySeconds: 0.5,
  maxWaitSeconds: 10,
};

function retryAfterSeconds(res: Response): number | undefined {
  const raw = res.headers?.get("Retry-After");
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Sends, and on a 429 waits and resends — honouring `Retry-After` when the
 * API gives one (it does; main.ts exposes the header to this origin),
 * otherwise backing off exponentially. Full jitter, so the requests of one
 * bulk action that were throttled together do not all come back together.
 */
async function sendWithRateLimitRetry(path: string, init?: RequestInit): Promise<Response> {
  let res = await send(path, init);
  for (let attempt = 0; res.status === 429 && attempt < RATE_LIMIT_RETRY.attempts; attempt++) {
    const hinted = retryAfterSeconds(res);
    if (hinted !== undefined && hinted > RATE_LIMIT_RETRY.maxWaitSeconds) break;
    const ceiling = hinted ?? RATE_LIMIT_RETRY.baseDelaySeconds * 2 ** attempt;
    // At least the hinted wait (the window really is closed until then),
    // plus up to one base delay of jitter.
    const waitMs = (ceiling + Math.random() * RATE_LIMIT_RETRY.baseDelaySeconds) * 1000;
    await sleep(waitMs);
    res = await send(path, init);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await sendWithRateLimitRetry(path, init);
  if (res.status === 401 && path !== "/auth/admin/refresh" && await refreshSession()) {
    res = await sendWithRateLimitRetry(path, init);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) clearAdminSession();
    if (res.status === 429) {
      const wait = retryAfterSeconds(res);
      throw new ApiError(
        429,
        wait !== undefined
          ? `Too many requests — try again in ${Math.ceil(wait)}s.`
          : "Too many requests — wait a moment and try again.",
        wait,
      );
    }
    let message = `${init?.method ?? "GET"} ${path} -> ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === "string") message = body.message;
      else if (Array.isArray(body?.message) && typeof body.message[0] === "string") {
        // class-validator's shape: one message per failed rule.
        message = body.message[0];
      }
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
