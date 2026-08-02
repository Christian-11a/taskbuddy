import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, client } from "./client";
import { getStoredSession, setStoredSession } from "./session";

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
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("client", () => {
  it("attaches the stored bearer token to requests", async () => {
    setStoredSession({ accessToken: "tok-abc", adminProfile: { name: "a", email: "a" } });
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await client.get("/admin/users");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok-abc");
  });

  it("sends no Authorization header when there is no session", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await client.get("/admin/users");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("clears the stored session and throws ApiError on 401", async () => {
    setStoredSession({ accessToken: "expired", adminProfile: { name: "a", email: "a" } });
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Invalid or expired token" }, 401)),
    ) as unknown as typeof fetch;

    await expect(client.get("/admin/users")).rejects.toThrow(ApiError);
    expect(localStorage.getItem("tb-admin-session")).toBeNull();
  });

  it("refreshes an expired token and retries the request once", async () => {
    setStoredSession({
      accessToken: "expired",
      refreshToken: "ref-1",
      adminProfile: { name: "a", email: "a" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Invalid or expired token" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ session: { access_token: "fresh", refresh_token: "ref-2" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ users: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(client.get("/admin/users")).resolves.toEqual({ users: [] });

    // The retry carries the new token, and both tokens are persisted.
    const [, retryInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer fresh");
    expect(getStoredSession()).toMatchObject({
      accessToken: "fresh",
      refreshToken: "ref-2",
    });
  });

  it("clears the session when the refresh itself fails", async () => {
    setStoredSession({
      accessToken: "expired",
      refreshToken: "ref-dead",
      adminProfile: { name: "a", email: "a" },
    });
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Invalid or expired token" }, 401)),
    ) as unknown as typeof fetch;

    await expect(client.get("/admin/users")).rejects.toThrow(ApiError);
    expect(localStorage.getItem("tb-admin-session")).toBeNull();
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
