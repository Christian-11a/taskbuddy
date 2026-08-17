import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, client } from "./client";
import { clearAdminSession, getAdminSession, setAdminSession } from "./session";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

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
