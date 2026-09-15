import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, client, RATE_LIMIT_RETRY } from "./client";
import { clearAdminSession, getAdminSession, setAdminSession } from "./session";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  } as Response;
}

const throttled = (retryAfter?: string) =>
  jsonResponse(
    { statusCode: 429, message: "ThrottlerException: Too Many Requests" },
    429,
    retryAfter === undefined ? {} : { "Retry-After": retryAfter },
  );

const originalFetch = global.fetch;

beforeEach(() => {
  localStorage.clear();
  clearAdminSession();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("client", () => {
  it("includes browser cookies on every request without a bearer token", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await client.get("/admin/users");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("attaches the in-memory CSRF token to unsafe requests", async () => {
    setAdminSession({
      csrfToken: "csrf-123",
      adminProfile: { id: "admin-1", name: "Ana", email: "ana@taskbuddy.io" },
    });
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await client.post("/admin/users/u1/suspend", { reason: "Fraud" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-123");
  });

  it("does not attach CSRF to safe requests", async () => {
    setAdminSession({
      csrfToken: "csrf-123",
      adminProfile: { id: "admin-1", name: "Ana", email: "ana@taskbuddy.io" },
    });
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await client.get("/admin/users");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-CSRF-Token"]).toBeUndefined();
  });

  it("clears the in-memory session and throws ApiError on 401 or 403", async () => {
    setAdminSession({
      csrfToken: "csrf-123",
      adminProfile: { id: "admin-1", name: "Ana", email: "ana@taskbuddy.io" },
    });
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Invalid session" }, 403)),
    ) as unknown as typeof fetch;

    await expect(client.get("/admin/users")).rejects.toThrow(ApiError);
    expect(getAdminSession()).toBeNull();
    expect(localStorage.getItem("tb-admin-session")).toBeNull();
  });

  it("refreshes a 401 once, updates CSRF, and retries the unsafe request", async () => {
    setAdminSession({
      csrfToken: "csrf-old",
      adminProfile: { id: "admin-1", name: "Ana", email: "ana@taskbuddy.io" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-new" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(client.post("/admin/users/u1/suspend", { reason: "Fraud" })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/auth/admin/refresh"),
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-old" }),
      }),
    );
    const [, retry] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect((retry.headers as Record<string, string>)["X-CSRF-Token"]).toBe("csrf-new");
    expect(getAdminSession()?.csrfToken).toBe("csrf-new");
  });

  it("shares one refresh between simultaneous 401 responses", async () => {
    setAdminSession({
      csrfToken: "csrf-old",
      adminProfile: { id: "admin-1", name: "Ana", email: "ana@taskbuddy.io" },
    });
    const calls = new Map<string, number>();
    const fetchMock = vi.fn((url: string) => {
      const count = (calls.get(url) ?? 0) + 1;
      calls.set(url, count);
      if (url.endsWith("/auth/admin/refresh")) return Promise.resolve(jsonResponse({ csrf_token: "csrf-new" }));
      return Promise.resolve(count === 1 ? jsonResponse({}, 401) : jsonResponse({ ok: url }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await Promise.all([client.get("/admin/users"), client.get("/admin/disputes")]);

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/admin/refresh"))).toHaveLength(1);
  });

  it("surfaces the backend's error message when present", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Account is already suspended" }, 400)),
    ) as unknown as typeof fetch;

    await expect(client.post("/admin/users/u1/suspend")).rejects.toThrow(
      "Account is already suspended",
    );
  });
});

describe("client rate-limit handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits the Retry-After the API asked for, then resends — POSTs included", async () => {
    // The throttler rejects before the handler runs, so the first attempt did
    // nothing and resending a POST cannot double-apply it.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled("2"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = client.post("/admin/users/u1/suspend", { reason: "Fraud" });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially when no Retry-After is given, and stops after the cap", async () => {
    const fetchMock = vi.fn().mockResolvedValue(throttled());
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = client.get("/admin/users").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500); // 0.5s
    await vi.advanceTimersByTimeAsync(1000); // 1s
    const err = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1 + RATE_LIMIT_RETRY.attempts);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(429);
    expect((err as ApiError).message).toMatch(/Too many requests/);
  });

  it("fails fast with the wait in the error when Retry-After is longer than the cap", async () => {
    // A minute-long window is not worth sitting silently through; the admin
    // gets the reason immediately instead.
    const fetchMock = vi.fn().mockResolvedValue(throttled("45"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const err = await client.get("/admin/users").catch((e: unknown) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((err as ApiError).retryAfterSeconds).toBe(45);
    expect((err as ApiError).message).toBe("Too many requests — try again in 45s.");
  });

  it("does not sign the admin out on a 429", async () => {
    setAdminSession({
      csrfToken: "csrf-123",
      adminProfile: { id: "admin-1", name: "Ana", email: "ana@taskbuddy.io" },
    });
    global.fetch = vi.fn().mockResolvedValue(throttled("60")) as unknown as typeof fetch;

    await client.get("/admin/users").catch(() => undefined);

    expect(getAdminSession()).not.toBeNull();
  });
});
