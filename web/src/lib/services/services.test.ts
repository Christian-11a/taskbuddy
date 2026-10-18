import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAdminSession, getAdminSession, setAdminSession } from "@/lib/api/session";
import * as services from "./index";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  } as Response;
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  clearAdminSession();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("login", () => {
  it("creates a cookie session and returns the validated admin identity", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          user: {
            id: "u1",
            email: "admin@taskbuddy.io",
            full_name: "Ana Cruz",
            role: "admin",
          },
          csrf_token: "csrf-123",
        }),
      ),
    ) as unknown as typeof fetch;

    const profile = await services.login("admin@taskbuddy.io", "pw");

    expect(profile).toEqual({ id: "u1", name: "Ana Cruz", email: "admin@taskbuddy.io" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/admin/login"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("rejects a login response without an admin identity or CSRF token", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          user: {
            id: "u1",
            email: "admin@taskbuddy.io",
            full_name: "Ana Cruz",
            role: "client",
          },
          csrf_token: "",
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(services.login("admin@taskbuddy.io", "pw")).resolves.toBeNull();
  });

  it("returns false on invalid credentials", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Invalid login credentials" }, 401)),
    ) as unknown as typeof fetch;

    const ok = await services.login("admin@taskbuddy.io", "wrong");

    expect(ok).toBeNull();
  });
});

describe("loginDetailed", () => {
  it("reports wrong credentials as 'credentials'", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Invalid login credentials" }, 401)),
    ) as unknown as typeof fetch;

    await expect(services.loginDetailed("admin@taskbuddy.io", "wrong")).resolves.toEqual({ ok: false, reason: "credentials" });
  });

  it("reports an unreachable API as 'network', not as a wrong password", async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;

    await expect(services.loginDetailed("admin@taskbuddy.io", "pw")).resolves.toEqual({ ok: false, reason: "network" });
  });

  it("reports a server error as 'server'", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "boom" }, 500)),
    ) as unknown as typeof fetch;

    await expect(services.loginDetailed("admin@taskbuddy.io", "pw")).resolves.toEqual({ ok: false, reason: "server" });
  });

  it("reports the rate limiter with its wait time", async () => {
    // A long Retry-After is not retried by the client, so the reason surfaces at once.
    const limited = new Response(JSON.stringify({ message: "Too Many Requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "60" },
    });
    global.fetch = vi.fn(() => Promise.resolve(limited)) as unknown as typeof fetch;

    await expect(services.loginDetailed("admin@taskbuddy.io", "pw")).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 60,
    });
  });
});

describe("restoreSession", () => {
  it("restores an admin identity and CSRF token from the cookie session", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({
        user: { id: "u1", email: "admin@taskbuddy.io", full_name: "Ana Cruz", role: "admin" },
        csrf_token: "csrf-restored",
      })),
    ) as unknown as typeof fetch;

    await expect(services.restoreSession()).resolves.toEqual({
      id: "u1", name: "Ana Cruz", email: "admin@taskbuddy.io",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/admin/session"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(getAdminSession()?.csrfToken).toBe("csrf-restored");
  });

  it("restores identity after refreshing an expired cookie before memory exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-refreshed" }))
      .mockResolvedValueOnce(jsonResponse({
        user: { id: "u1", email: "admin@taskbuddy.io", full_name: "Ana Cruz", role: "admin" },
        csrf_token: "csrf-session",
      }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.restoreSession()).resolves.toEqual({
      id: "u1", name: "Ana Cruz", email: "admin@taskbuddy.io",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/auth/admin/refresh"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(getAdminSession()?.csrfToken).toBe("csrf-session");
  });
});

describe("loginDetailed cookie check", () => {
  const adminUser = { id: "u1", email: "admin@taskbuddy.io", full_name: "Ana Cruz", role: "admin" };

  /** Answers by endpoint, so the order the client calls them in does not matter. */
  function serve(routes: Record<string, () => Promise<Response>>) {
    return vi.fn((url: string) => {
      const match = Object.keys(routes).find((path) => url.endsWith(path));
      if (!match) return Promise.reject(new Error(`unexpected request ${url}`));
      return routes[match]();
    }) as unknown as typeof fetch;
  }

  it("reports 'cookies_blocked' when the browser does not keep the session cookie", async () => {
    // The sign-in POST succeeds and returns a CSRF token, but the cookie never
    // comes back on the next request (mobile third-party cookie blocking).
    global.fetch = serve({
      "/auth/admin/login": () => Promise.resolve(jsonResponse({ user: adminUser, csrf_token: "csrf-1" })),
      "/auth/admin/session": () => Promise.resolve(jsonResponse({ message: "Unauthorized" }, 401)),
      "/auth/admin/refresh": () => Promise.resolve(jsonResponse({ message: "Missing refresh token" }, 401)),
    });

    await expect(services.loginDetailed("admin@taskbuddy.io", "pw")).resolves.toEqual({
      ok: false,
      reason: "cookies_blocked",
    });
    expect(getAdminSession()).toBeNull();
  });

  it("signs in only after the session check returns, using the CSRF token the cookie holds", async () => {
    global.fetch = serve({
      "/auth/admin/login": () => Promise.resolve(jsonResponse({ user: adminUser, csrf_token: "csrf-login" })),
      "/auth/admin/session": () => Promise.resolve(jsonResponse({ user: adminUser, csrf_token: "csrf-session" })),
    });

    await expect(services.loginDetailed("admin@taskbuddy.io", "pw")).resolves.toEqual({
      ok: true,
      profile: { id: "u1", name: "Ana Cruz", email: "admin@taskbuddy.io" },
    });
    expect(getAdminSession()?.csrfToken).toBe("csrf-session");
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/admin/session"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reports an unreachable API during the session check as 'network', and keeps no session", async () => {
    global.fetch = serve({
      "/auth/admin/login": () => Promise.resolve(jsonResponse({ user: adminUser, csrf_token: "csrf-1" })),
      "/auth/admin/session": () => Promise.reject(new TypeError("Failed to fetch")),
    });

    await expect(services.loginDetailed("admin@taskbuddy.io", "pw")).resolves.toEqual({
      ok: false,
      reason: "network",
    });
    expect(getAdminSession()).toBeNull();
  });
});

describe("logout", () => {
  it("calls the admin cookie logout endpoint", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;

    await services.logout();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/admin/logout"),
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });
});

describe("getUsers", () => {
  it("maps API rows to AdminUser, deriving status from deactivated_at", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          users: [
            { id: "u1", email: "a@b.c", full_name: "Alice", role: "client", deactivated_at: null, created_at: "2026-01-01", cached_avg_rating: null, cached_completed_jobs: null, phone: null, city: null, category_name: null },
            { id: "u2", email: "b@b.c", full_name: "Bob", role: "provider", deactivated_at: "2026-02-01", created_at: "2026-01-02", cached_avg_rating: 4.5, cached_completed_jobs: 9, phone: "0917 555 0101", city: "Cebu", category_name: "Plumbing" },
          ],
          total: 2,
        }),
      ),
    ) as unknown as typeof fetch;

    const users = await services.getUsers();

    expect(users).toEqual([
      { id: "u1", email: "a@b.c", role: "client", createdAt: "2026-01-01", name: "Alice", status: "ACTIVE", jobsCompleted: 0, rating: null, phone: null, city: null, categoryName: null, suspendedUntil: null, suspensionReason: null, verification: null },
      { id: "u2", email: "b@b.c", role: "provider", createdAt: "2026-01-02", name: "Bob", status: "SUSPENDED", jobsCompleted: 9, rating: 4.5, phone: "0917 555 0101", city: "Cebu", categoryName: "Plumbing", suspendedUntil: null, suspensionReason: null, verification: "UNVERIFIED" },
    ]);
  });
});

describe("setUserStatus", () => {
  it("posts to suspend then refetches users", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u1", deactivated_at: "now" })))
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            users: [{ id: "u1", email: "a@b.c", full_name: "Alice", role: "client", deactivated_at: "now", created_at: "2026-01-01", cached_avg_rating: null, cached_completed_jobs: null }],
            total: 1,
          }),
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const users = await services.setUserStatus("u1", "SUSPENDED");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/admin/users/u1/suspend"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(users.rows?.[0].status).toBe("SUSPENDED");
    expect(users.refreshFailed).toBeUndefined();
  });

  it("reports a failed user refresh after the status change succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u1" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ message: "temporary failure" }, 503)));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.setUserStatus("u1", "SUSPENDED")).resolves.toEqual({
      rows: null,
      refreshFailed: true,
    });
  });

  it("throws when the status change POST fails", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ message: "cannot suspend admin" }, 400))) as unknown as typeof fetch;

    await expect(services.setUserStatus("u1", "SUSPENDED")).rejects.toThrow("cannot suspend admin");
  });
});

describe("getBookings", () => {
  it("maps API rows to AdminBooking, defaulting unassigned providers", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          bookings: [
            { id: "j1", status: "open", posted_at: "2026-01-01", service_categories: { name: "Plumbing" }, client: { id: "c1", full_name: "Alice" }, provider: null },
          ],
          total: 1,
        }),
      ),
    ) as unknown as typeof fetch;

    const bookings = await services.getBookings();

    expect(bookings).toEqual([
      { id: "j1", customerName: "Alice", providerName: "Unassigned", service: "Plumbing", status: "open", displayStatus: "open", scheduledDate: "2026-01-01", amount: 0 },
    ]);
  });

  it("derives displayStatus 'disputed' from an open dispute_state on admin rows", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          bookings: [
            { id: "j2", status: "in_progress", posted_at: "2026-01-02", dispute_state: "open", service_categories: { name: "Plumbing" }, client: { id: "c1", full_name: "Alice" }, provider: null },
            { id: "j3", status: "completed", posted_at: "2026-01-03", dispute_state: "resolved", service_categories: { name: "Plumbing" }, client: { id: "c1", full_name: "Alice" }, provider: null },
          ],
          total: 2,
        }),
      ),
    ) as unknown as typeof fetch;

    const bookings = await services.getBookings();

    expect(bookings.map((b) => [b.status, b.displayStatus])).toEqual([
      ["in_progress", "disputed"],
      ["completed", "completed"],
    ]);
  });
});

describe("paginated admin searches", () => {
  it("constructs booking search, status, limit, and offset from page state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ bookings: [], total: 23 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.searchBookings({ search: "Ramos", status: "completed", page: 3, pageSize: 7 }))
      .resolves.toEqual({ items: [], total: 23, statusCounts: undefined });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/bookings?search=Ramos&status=completed&limit=7&offset=14"),
      expect.any(Object),
    );
  });

  it("sends the confirmed booking status supported by the booking filter", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ bookings: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await services.searchBookings({ search: "", status: "confirmed", page: 1, pageSize: 7 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/bookings?status=confirmed&limit=7&offset=0"),
      expect.any(Object),
    );
  });

  it("constructs escrow search, status, limit, and offset from page state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ transactions: [], total: 8 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.searchTransactions({ search: "Ana Cruz", status: "held", page: 2, pageSize: 7 }))
      .resolves.toEqual({ items: [], total: 8 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/transactions?search=Ana+Cruz"),
      expect.any(Object),
    );
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("status=held&limit=7&offset=7");
  });

  it("constructs activity search, limit, and offset from page state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ items: [], total: 15 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.searchActivity({ search: "sink repair", page: 2, pageSize: 7 }))
      .resolves.toEqual({ items: [], total: 15 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/activity?search=sink+repair&limit=7&offset=7"),
      expect.any(Object),
    );
  });
});

describe("getBookings amount", () => {
  it("reads the real job budget, and 0 for pre-pricing jobs", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          bookings: [
            { id: "j1", status: "assigned", posted_at: "2026-01-01", budget: "1500.00", service_categories: { name: "Plumbing" }, client: { id: "c1", full_name: "Alice" }, provider: { id: "p1", full_name: "Bob" } },
            { id: "j2", status: "open", posted_at: "2026-01-02", budget: null, service_categories: null, client: null, provider: null },
          ],
          total: 2,
        }),
      ),
    ) as unknown as typeof fetch;

    const bookings = await services.getBookings();

    // Postgres numeric arrives as a string over PostgREST.
    expect(bookings[0].amount).toBe(1500);
    expect(bookings[1].amount).toBe(0);
  });
});

describe("getRecentActivity", () => {
  it("unwraps { items, total } into a flat mapped array", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          items: [
            {
              id: 1,
              old_status: "in_progress",
              new_status: "completed",
              changed_at: new Date().toISOString(),
              jobs: { title: "Fix sink" },
              changed_by: { full_name: "Bob" },
            },
          ],
          total: 1,
        }),
      ),
    ) as unknown as typeof fetch;

    const activity = await services.getRecentActivity();

    expect(activity).toEqual([
      { id: 1, time: "just now", text: 'Booking "Fix sink" was completed', type: "tx" },
    ]);
  });
});

describe("getPendingVerifications", () => {
  it("asks the server for the pending queue only, and keeps only pending rows", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(new URL(url).searchParams.get("status")).toBe("pending");
      return Promise.resolve(jsonResponse({
        verifications: [
          { id: "v1", provider_id: "p1", full_name: "Juan Cruz", email: "juan@test.com", status: "pending", submitted_at: "2026-08-01", documents: [] },
          { id: "v0", provider_id: "p0", full_name: "Old Case", email: "old@test.com", status: "approved", submitted_at: "2026-07-01", documents: [] },
        ],
        total: 2,
      }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = await services.getPendingVerifications();

    expect(pending.map((v) => [v.id, v.status])).toEqual([["v1", "PENDING"]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getVerifications", () => {
  it("maps rows and uppercases the backend's lowercase status", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          verifications: [
            {
              id: "v1",
              provider_id: "p1",
              full_name: "Juan Cruz",
              email: "juan@test.com",
              status: "pending",
              submitted_at: "2026-08-01",
              reviewed_at: null,
              rejection_reason: null,
              documents: ["https://signed/id", "https://signed/selfie"],
            },
          ],
          total: 1,
        }),
      ),
    ) as unknown as typeof fetch;

    const verifications = await services.getVerifications();

    expect(verifications).toEqual([
      {
        id: "v1",
        providerId: "p1",
        name: "Juan Cruz",
        email: "juan@test.com",
        submittedAt: "2026-08-01",
        status: "PENDING",
        documents: ["https://signed/id", "https://signed/selfie"],
        documentType: null,
        method: "manual",
      },
    ]);
  });
});

describe("getWalletTransactions", () => {
  it("maps wallet ledger rows, keeping direction/kind/amount as numbers", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          transactions: [
            {
              id: "wt1",
              direction: "credit",
              status: "completed",
              kind: "topup",
              amount: "1000.00",
              title: "TaskBuddy wallet top-up",
              created_at: "2026-08-09T16:47:00Z",
              profile: { id: "u1", full_name: "Eduard" },
            },
          ],
          total: 1,
        }),
      ),
    ) as unknown as typeof fetch;

    const txns = await services.getWalletTransactions();

    expect(txns).toEqual([
      {
        id: "wt1",
        profileName: "Eduard",
        direction: "credit",
        kind: "topup",
        status: "completed",
        amount: 1000,
        title: "TaskBuddy wallet top-up",
        createdAt: "2026-08-09T16:47:00Z",
        reviewNote: null,
      },
    ]);
  });

  it("falls back to 'Unknown user' when the profile join is missing", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          transactions: [
            {
              id: "wt2",
              direction: "debit",
              status: "completed",
              kind: "withdrawal",
              amount: "50.00",
              title: "Cash out",
              created_at: "2026-08-09T16:47:00Z",
              profile: null,
            },
          ],
          total: 1,
        }),
      ),
    ) as unknown as typeof fetch;

    const [txn] = await services.getWalletTransactions();

    expect(txn.profileName).toBe("Unknown user");
  });
});

describe("maintenance mode", () => {
  it("getMaintenanceStatus maps the API response to domain shape", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          maintenance_mode: true,
          maintenance_message: "Back at 9am",
          updated_at: "2026-08-10T00:00:00Z",
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(services.getMaintenanceStatus()).resolves.toEqual({
      enabled: true,
      message: "Back at 9am",
      updatedAt: "2026-08-10T00:00:00Z",
    });
  });

  it("getMaintenanceStatus falls back to 'off' instead of throwing (e.g. route not deployed yet)", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Not Found" }, 404)),
    ) as unknown as typeof fetch;

    // Must not reject — this call sits inside AppContext's initial-load
    // Promise.all, and a throw here would abort every other fetch in that
    // batch, not just this one value.
    await expect(services.getMaintenanceStatus()).resolves.toEqual({
      enabled: false,
      message: null,
      updatedAt: null,
    });
  });

  it("setMaintenanceStatus PATCHes and returns the updated status", async () => {
    // Typed via the generic rather than unused params, so `mock.calls[0]`
    // still destructures to [url, init] below.
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(
        jsonResponse({
          maintenance_mode: false,
          maintenance_message: null,
          updated_at: "2026-08-10T00:05:00Z",
        }),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await services.setMaintenanceStatus(false);

    expect(result).toEqual({ enabled: false, message: null, updatedAt: "2026-08-10T00:05:00Z" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ maintenance_mode: false, maintenance_message: undefined });
  });
});

describe("updateDisplayName", () => {
  it("patches the profile and mirrors the new name into the in-memory session", async () => {
    setAdminSession({
      csrfToken: "csrf-123",
      adminProfile: { id: "u1", name: "Old Name", email: "admin@taskbuddy.io" },
    });
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: "u1", full_name: "New Name" })));
    global.fetch = fetchMock as unknown as typeof fetch;

    const ok = await services.updateDisplayName("New Name");

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/profiles/me"),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ full_name: "New Name" }) }),
    );
    expect(getAdminSession()?.adminProfile).toEqual({
      id: "u1", name: "New Name", email: "admin@taskbuddy.io",
    });
  });

  it("returns false when the request fails", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ message: "nope" }, 400))) as unknown as typeof fetch;

    expect(await services.updateDisplayName("New Name")).toBe(false);
  });
});

describe("getDisputes", () => {
  const disputeRow = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    job_id: "job-1",
    escrow_id: "e1",
    reason: "Never showed up",
    details: "Waited 2 hours.",
    status: "open",
    resolution: null,
    resolution_note: null,
    created_at: "2026-08-01",
    resolved_at: null,
    jobs: {
      title: "Fix sink",
      service_categories: { name: "Plumbing" },
      client: { full_name: "Alice" },
      provider: { full_name: "Bob" },
    },
    escrow_transactions: { amount: "500.00", status: "disputed" },
    raised_by_profile: { id: "c1", full_name: "Alice" },
    ...over,
  });

  it("reads the job, provider, client and amount from the disputes query alone", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain("/admin/disputes");
      return Promise.resolve(jsonResponse({ disputes: [disputeRow()], total: 1 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const disputes = await services.getDisputes();

    expect(disputes).toEqual([
      expect.objectContaining({
        id: "d1",
        jobId: "job-1",
        jobTitle: "Fix sink",
        service: "Plumbing",
        clientName: "Alice",
        providerName: "Bob",
        amount: 500,
        hasPayment: true,
        status: "OPEN",
        paymentSettled: false,
      }),
    ]);
    // Only the disputes list is read: no transaction list is downloaded to name a party or a sum.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows explicit unknowns for parties and service the job does not join, never another job's", async () => {
    const unjoined = disputeRow({
      jobs: { title: "Fix sink", service_categories: null, client: undefined, provider: undefined },
    });
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ disputes: [unjoined], total: 1 }))) as unknown as typeof fetch;

    const [dispute] = await services.getDisputes();

    expect(dispute).toMatchObject({ clientName: "Unknown client", providerName: "Unknown provider", service: "Uncategorized" });
  });

  it("reports an unknown amount, not 0, when the dispute has an escrow whose amount did not join", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ disputes: [disputeRow({ escrow_transactions: null })], total: 1 })),
    ) as unknown as typeof fetch;

    const [dispute] = await services.getDisputes();

    expect(dispute.hasPayment).toBe(true);
    expect(Number.isNaN(dispute.amount)).toBe(true);
  });
});

it("maps zero-budget case participants and evidence without a transaction fallback", async () => {
  const activity = { id: "e1", kind: "statement", body: "Provider evidence", created_at: "2026-10-04T00:00:00Z", author: { id: "p1", full_name: "Provider", role: "provider" }, message: null, attachment_url: null };
  global.fetch = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ disputes: [{ id: "d-zero", job_id: "j-zero", escrow_id: null, reason: "Work quality", details: null, status: "open", resolution: null, resolution_note: null, resolved_at: null, created_at: "2026-10-04", escrow_transactions: null, entries: [activity], jobs: { title: "Zero budget repair", service_categories: { name: "Plumbing" }, client: { full_name: "Client" }, provider: { full_name: "Provider" } } }], total: 1 }))
    .mockResolvedValueOnce(jsonResponse({ transactions: [], total: 0 })) as unknown as typeof fetch;
  expect(await services.getDisputes()).toEqual([expect.objectContaining({ clientName: "Client", providerName: "Provider", hasPayment: false, paymentSettled: true, amount: 0, entries: [activity] })]);
});

describe("resolveDispute", () => {
  it("posts the backend resolution enum then refetches disputes", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "d1", status: "resolved" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ disputes: [], total: 0 })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ transactions: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await services.resolveDispute("d1", "REFUNDED_TO_CLIENT", "Confirmed no-show");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/admin/disputes/d1/resolve"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ resolution: "refunded_to_client", note: "Confirmed no-show" }),
      }),
    );
  });
});

describe("bulk actions", () => {
  it("bulkSetUserStatus fires one request per id then refetches users", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u1" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u2" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ users: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await services.bulkSetUserStatus(["u1", "u2"], "SUSPENDED");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toContain("/admin/users/u1/suspend");
    expect(fetchMock.mock.calls[1][0]).toContain("/admin/users/u2/suspend");
  });

  it("bulkSetUserStatus tolerates a per-id failure, still refetches, and reports the counts", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ message: "cannot suspend admin" }, 400)))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u2" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ users: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    // The counts are the point: one id failing used to be swallowed entirely,
    // so the admin was never told their bulk action only partly worked.
    await expect(services.bulkSetUserStatus(["u1", "u2"], "SUSPENDED")).resolves.toEqual({
      rows: [],
      succeeded: 1,
      failed: 1,
      errors: [{ id: "u1", status: 400, message: "cannot suspend admin" }],
    });
  });

  it("reports a failed user refresh after all bulk status POSTs succeed", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u1" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u2" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ message: "temporary failure" }, 503)));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.bulkSetUserStatus(["u1", "u2"], "SUSPENDED")).resolves.toEqual({
      rows: null,
      refreshFailed: true,
      succeeded: 2,
      failed: 0,
      errors: [],
    });
  });

  it("preserves partial bulk counts and errors when the user refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ message: "cannot suspend admin" }, 400)))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "u2" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ message: "temporary failure" }, 503)));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.bulkSetUserStatus(["u1", "u2"], "SUSPENDED")).resolves.toEqual({
      rows: null,
      refreshFailed: true,
      succeeded: 1,
      failed: 1,
      errors: [{ id: "u1", status: 400, message: "cannot suspend admin" }],
    });
  });

  it("never has more than BULK_CONCURRENCY requests in flight", async () => {
    // Every bulk request hits the same handler, and the API limits per
    // endpoint per IP — an unbounded Promise.all over 300 ids earned 429s.
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/admin/users?")) return Promise.resolve(jsonResponse({ users: [], total: 0 }));
      inFlight++;
      peak = Math.max(peak, inFlight);
      return new Promise<Response>((resolve) =>
        setTimeout(() => {
          inFlight--;
          resolve(jsonResponse({ ok: true }));
        }, 1),
      );
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const ids = Array.from({ length: 20 }, (_, i) => `u${i}`);
    const result = await services.bulkSetUserStatus(ids, "ACTIVE");

    expect(result.succeeded).toBe(20);
    expect(peak).toBe(services.BULK_CONCURRENCY);
  });

  it("bulkApproveVerifications reports counts when every id succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "v1" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "v2" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ verifications: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(services.bulkApproveVerifications(["v1", "v2"])).resolves.toEqual({
      rows: [],
      succeeded: 2,
      failed: 0,
      errors: [],
    });
  });

  it("bulkApproveVerifications and bulkRejectVerifications post per id then refetch", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "v1" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ verifications: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await services.bulkApproveVerifications(["v1"]);
    expect(fetchMock.mock.calls[0][0]).toContain("/admin/verifications/v1/approve");

    fetchMock.mockClear();
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "v2" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ verifications: [], total: 0 })));

    await services.bulkRejectVerifications(["v2"]);
    expect(fetchMock.mock.calls[0][0]).toContain("/admin/verifications/v2/reject");
  });

  it("rejectVerification sends the reason in the request body when given", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "v3" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ verifications: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await services.rejectVerification("v3", "Blurry ID photo");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ reason: "Blurry ID photo" });
  });

  it("rejectVerification sends no body when no reason is given", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "v4" })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ verifications: [], total: 0 })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await services.rejectVerification("v4");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeUndefined();
  });
});

describe("write-then-read helpers", () => {
  it("counts pending payouts from the total alone", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ items: [], total: 3 }))) as unknown as typeof fetch;
    expect(await services.getPendingWithdrawalCount()).toBe(3);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/admin/withdrawals?status=pending&limit=1&offset=0"), expect.anything());
  });

  it("posts a verification approval with no follow-up read", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ id: "v1" })));
    global.fetch = fetchMock as unknown as typeof fetch;
    await services.postApproveVerification("v1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/admin/verifications/v1/approve"), expect.objectContaining({ method: "POST" }));
  });
});

describe("cancelBooking", () => {
  it("posts the cancel action then refetches bookings", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ id: "j1", status: "cancelled" })))
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            bookings: [
              { id: "j1", status: "cancelled", posted_at: "2026-01-01", service_categories: { name: "Plumbing" }, client: { id: "c1", full_name: "Alice" }, provider: { id: "p1", full_name: "Bob" } },
            ],
            total: 1,
          }),
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const bookings = await services.cancelBooking("j1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/admin/bookings/j1/cancel"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(bookings[0].status).toBe("cancelled");
  });
});

describe("getDashboardStats", () => {
  it("uses the new summary totals without separate escrow/job list calls", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({
      totals: { users: 39, providers: 13, bookings: 19, total_revenue: 0, monthly_revenue: 0,
        pending_verifications: 0, escrow_held_total: 500, escrow_held_count: 1, open_jobs: 0, matching_jobs: 1 },
      bookings_by_status: {},
    })));
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await services.getDashboardStats()).toMatchObject({ escrowHeld: 500, escrowCount: 1, openJobs: 0, matchingJobs: 1, pendingWithdrawals: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses real totals/completion-rate/revenue/rating from the summary", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          totals: {
            users: 10,
            clients: 6,
            providers: 4,
            suspended: 1,
            bookings: 5,
            avg_rating: 4.2,
            total_revenue: 1500,
            monthly_revenue: 600,
          },
          bookings_by_status: { completed: 3, open: 2 },
          bookings_by_category: {},
          booking_trend: [],
          revenue_trend: [],
          top_providers: [],
        }),
      ),
    ) as unknown as typeof fetch;

    const stats = await services.getDashboardStats();

    expect(stats.totalUsers).toBe(10);
    expect(stats.activeProviders).toBe(4);
    expect(stats.totalBookings).toBe(5);
    expect(stats.completionRate).toBe(60);
    expect(stats.totalRevenue).toBe(1500);
    expect(stats.monthlyRevenue).toBe(600);
    expect(stats.avgRating).toBe(4.2);
  });

  it("reports released payments as provider payouts plus commission", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          totals: {
            users: 1, clients: 0, providers: 1, bookings: 0, avg_rating: null,
            total_revenue: 1500, monthly_revenue: 600, total_commission: 150.25, monthly_commission: 60,
          },
          bookings_by_status: {},
          bookings_by_category: {},
          booking_trend: [],
          revenue_trend: [],
          top_providers: [],
        }),
      ),
    ) as unknown as typeof fetch;
    const stats = await services.getDashboardStats();
    expect(stats.totalRevenue).toBe(1650.25);
    expect(stats.monthlyRevenue).toBe(660);
    expect(stats.totalCommission).toBe(150.25);
  });

  it("reports a zero avgRating when no provider has been rated", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          totals: {
            users: 1,
            clients: 1,
            providers: 0,
            suspended: 0,
            bookings: 0,
            avg_rating: null,
            total_revenue: 0,
            monthly_revenue: 0,
          },
          bookings_by_status: {},
          bookings_by_category: {},
          booking_trend: [],
          revenue_trend: [],
          top_providers: [],
        }),
      ),
    ) as unknown as typeof fetch;

    const stats = await services.getDashboardStats();

    // There is no mock fallback any more — an unrated platform reads as 0.
    expect(stats.avgRating).toBe(0);
  });
});

describe("list paging", () => {
  it("rejects a malformed list response instead of showing an empty queue", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ wrong_key: [], total: 0 }))) as unknown as typeof fetch;
    await expect(services.getVerifications()).rejects.toThrow("Invalid list response");
  });

  it("requests the selected service-request page and search from the server", async () => {
    const all = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`, type: "add_secondary", status: "pending", reason: "Experience", category_id: 1,
      provider: { full_name: `Provider ${i}` }, category: { name: "Plumbing" }, created_at: "2026-09-30",
    }));
    const fetchMock = vi.fn((url: string) => {
      const params = new URL(url).searchParams;
      expect(params.get("status")).toBe("pending");
      expect(params.get("search")).toBe("Rico");
      expect(params.get("limit")).toBe("20");
      expect(params.get("offset")).toBe("100");
      return Promise.resolve(jsonResponse({ items: all, total: 205 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const result = await services.getSkillRequests({ status: "pending", search: "Rico", page: 6, pageSize: 20 });
    expect(result.total).toBe(205);
    expect(result.items).toHaveLength(20);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed service-request page", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ items: null, total: 2 }))) as unknown as typeof fetch;
    await expect(services.getSkillRequests({ status: "pending", search: "", page: 1, pageSize: 20 })).rejects.toThrow("pagination is unavailable");
  });

  it("uses the service request total even when only one row is requested", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ items: [], total: 205 }))) as unknown as typeof fetch;
    expect(await services.getSkillRequestCount()).toBe(205);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("status=pending&limit=1&offset=0"), expect.anything());
  });

  it("returns booking status counts from the same filtered page response", async () => {
    const counts = { assigned: 3, completed: 2 };
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ bookings: [], total: 3, status_counts: counts }))) as unknown as typeof fetch;
    expect(await services.searchBookings({ search: "Pat", page: 2, pageSize: 2, status: "assigned" }))
      .toEqual({ items: [], total: 3, statusCounts: counts });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses a single request for booking counts when the backend supplies them", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ bookings: [], total: 3, status_counts: { assigned: 3 } }))) as unknown as typeof fetch;
    expect(await services.getBookingStatusCounts()).toMatchObject({ assigned: 3, open: 0 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("sends audit search and action filters before pagination", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ actions: [], total: 0 }))) as unknown as typeof fetch;
    expect(await services.searchAuditLog({ search: "  Pat  ", action: "user.suspend", page: 2, pageSize: 20 })).toEqual({ items: [], total: 0 });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/admin/audit?search=Pat&limit=20&offset=20&action=user.suspend"), expect.anything());
  });

  it("maps only the requested wallet page and preserves the server total", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ transactions: [
      { id: "w1", profile: { full_name: "Pat" }, direction: "credit", kind: "topup", status: "completed", amount: "25", title: "Top-up", created_at: "2026-09-30" },
    ], total: 50 }))) as unknown as typeof fetch;
    const result = await services.searchWalletTransactions({ search: "Pat", page: 3, pageSize: 20 });
    expect(result.total).toBe(50);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ amount: 25, profileName: "Pat" });
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/admin/wallet-transactions?search=Pat&limit=20&offset=40"), expect.anything());
  });
  it("walks limit/offset until every row is loaded", async () => {
    const all = Array.from({ length: 250 }, (_, i) => ({
      id: `u${i}`, email: `u${i}@x.test`, full_name: `U${i}`, role: "client", deactivated_at: null, created_at: "2026-01-01",
      cached_avg_rating: null, cached_completed_jobs: null, phone: null, city: null, category_name: null,
      suspended_until: null, suspension_reason: null,
    }));
    const fetchMock = vi.fn((url: string) => {
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset"));
      const limit = Number(u.searchParams.get("limit"));
      return Promise.resolve(jsonResponse({ users: all.slice(offset, offset + limit), total: all.length }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const users = await services.getUsers();
    expect(users).toHaveLength(250);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("offset=200");
  });
});

describe("fetchAllRows paging", () => {
  interface ListServer {
    /** Milliseconds a reply waits, per offset, so later pages can answer first. */
    delayMs?: (offset: number) => number;
    /** Offsets that answer 500 with a message. */
    failAt?: (offset: number) => boolean;
  }

  /** A fake list endpoint: `total` rows under `key`, paged by limit/offset. */
  function serveList(key: string, total: number, row: (i: number) => Record<string, unknown>, server: ListServer = {}) {
    return vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const offset = Number(params.get("offset"));
      const limit = Number(params.get("limit"));
      const wait = server.delayMs?.(offset) ?? 0;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      if (server.failAt?.(offset)) return jsonResponse({ message: "database unavailable" }, 500);
      const count = Math.max(0, Math.min(limit, total - offset));
      const rows = Array.from({ length: count }, (_, i) => row(offset + i));
      return jsonResponse({ [key]: rows, total });
    });
  }

  const userRow = (i: number) => ({
    id: `u${i}`, email: `u${i}@x.test`, full_name: `U${i}`, role: "client", deactivated_at: null, created_at: "2026-01-01",
    cached_avg_rating: null, cached_completed_jobs: null, phone: null, city: null, category_name: null,
    suspended_until: null, suspension_reason: null,
  });

  it("returns rows in offset order even when later pages answer first", async () => {
    global.fetch = serveList("users", 1000, userRow, {
      delayMs: (offset) => Math.max(0, 40 - offset / 25),
    }) as unknown as typeof fetch;

    const users = await services.getUsers();

    expect(users.map((u) => u.id)).toEqual(Array.from({ length: 1000 }, (_, i) => `u${i}`));
  });

  it("keeps at most six page requests in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const serve = serveList("users", 3000, userRow, { delayMs: () => 5 });
    global.fetch = vi.fn(async (url: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await serve(url);
      } finally {
        inFlight -= 1;
      }
    }) as unknown as typeof fetch;

    const users = await services.getUsers();

    expect(users).toHaveLength(3000);
    expect(global.fetch).toHaveBeenCalledTimes(15);
    expect(maxInFlight).toBe(6);
  });

  it("reads a list shorter than one page with a single request", async () => {
    global.fetch = serveList("users", 3, userRow) as unknown as typeof fetch;

    await expect(services.getUsers()).resolves.toHaveLength(3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list from a single request when the table is empty", async () => {
    global.fetch = serveList("users", 0, userRow) as unknown as typeof fetch;

    await expect(services.getUsers()).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects the whole list when one page fails, rather than returning a partial list", async () => {
    global.fetch = serveList("users", 1000, userRow, { failAt: (offset) => offset === 400 }) as unknown as typeof fetch;

    await expect(services.getUsers()).rejects.toThrow("database unavailable");
  });

  it("reports a short page in the middle of the walk as an incomplete list", async () => {
    global.fetch = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      // The page at offset 200 comes back with 150 of its 200 rows.
      const count = offset === 200 ? 150 : Math.min(200, 1000 - offset);
      return jsonResponse({ users: Array.from({ length: count }, (_, i) => userRow(offset + i)), total: 1000 });
    }) as unknown as typeof fetch;

    await expect(services.getUsers()).rejects.toThrow("Incomplete list response");
  });

  it("warns and returns the first 5,000 rows when a list is larger than the page cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = serveList("users", 6000, userRow) as unknown as typeof fetch;

    const users = await services.getUsers();

    expect(users).toHaveLength(5000);
    expect(users[4999].id).toBe("u4999");
    expect(global.fetch).toHaveBeenCalledTimes(25);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("6000 rows"));
    warn.mockRestore();
  });

  it("refuses to total a list that is larger than the page cap, so a sum is never partial", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    global.fetch = serveList("transactions", 6000, (i) => ({ id: `t${i}`, amount: "10" })) as unknown as typeof fetch;

    await expect(services.getEscrowHeld()).rejects.toThrow("exceeds 5000 rows");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("queue counts", () => {
  it("counts providers still owed after a refused Xendit payout (by wallet balance) plus card failures", async () => {
    const row = (id: string, profile_id: string, status: string, review_note: string | null, created_at: string) => ({
      id, profile_id, profile: { id: profile_id, full_name: profile_id }, amount: "100.00", title: "Payout", withdrawal_destination: null,
      status, created_at, reviewed_at: null, reviewed_by: null, review_note, direction: "debit", kind: "withdrawal",
    });
    const failed = [
      row("a", "p1", "failed", "Xendit: refused", "2026-10-01T00:00:00Z"),
      row("b", "p1", "failed", "Xendit: refused again", "2026-10-03T00:00:00Z"),
      row("c", "p2", "failed", "Xendit: bad account", "2026-10-02T00:00:00Z"),
      row("d", "p3", "failed", "Rejected by admin", "2026-10-02T00:00:00Z"),
      row("e", "p4", "failed", "xendit: lower", "2026-10-02T00:00:00Z"),
    ];
    const completed = [row("z", "p2", "completed", null, "2026-10-04T00:00:00Z")];
    const wt = (id: string, profile_id: string, direction: string, status: string, amount: string) => ({
      id, profile: { id: profile_id, full_name: profile_id }, direction, status, kind: "payout", amount, title: "t", created_at: "2026-10-01T00:00:00Z",
    });
    const fetchMock = vi.fn((url: string) => {
      // p1 has 400 credited and a 100 pending debit, so 300 is owed. p4 has nothing left, so is not owed.
      if (url.includes("/admin/wallet-transactions") && url.includes("direction=credit")) return Promise.resolve(jsonResponse({ transactions: [wt("c1", "p1", "credit", "completed", "400"), wt("c4", "p4", "credit", "completed", "80")], total: 2 }));
      if (url.includes("/admin/wallet-transactions") && url.includes("status=completed")) return Promise.resolve(jsonResponse({ transactions: [wt("d4", "p4", "debit", "completed", "80")], total: 1 }));
      if (url.includes("/admin/wallet-transactions")) return Promise.resolve(jsonResponse({ transactions: [wt("d1", "p1", "debit", "pending", "100")], total: 1 }));
      if (url.includes("status=completed")) return Promise.resolve(jsonResponse({ withdrawals: completed, total: 1 }));
      if (url.includes("status=failed")) return Promise.resolve(jsonResponse({ withdrawals: failed, total: 5 }));
      return Promise.resolve(jsonResponse({ withdrawals: [], total: 0 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const split = await services.getPayoutFailures();
    expect(split.unresolved.map((w) => w.id)).toEqual(["b", "a"]);
    expect(split.resolved.map((r) => r.withdrawal.id)).toEqual(["c"]);
    expect(split.owed).toEqual([{ profileId: "p1", profileName: "p1", owed: 300 }]);
    // Xendit: p1 only (p2 was paid later, p4 has no balance left, p3 and "xendit: lower" have no Xendit prefix).
    await expect(services.getFailedPayoutCount()).resolves.toBe(1);
  });

  it("counts pending service requests with a one-row request and the exact total", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({
      items: [{ id: "s1", status: "pending" }],
      total: 250,
    })));
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(services.getPendingServiceRequestCount()).resolves.toBe(250);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/skill-requests?status=pending&limit=1&offset=0"),
      expect.anything(),
    );
  });
});

describe("cancellation and completion fields", () => {
  const txnResponse = () => Promise.resolve(jsonResponse({ transactions: [], total: 0 }));
  const disputeRow = (extra: Record<string, unknown>) => ({
    id: "d-c1",
    job_id: "job-c1",
    escrow_id: "esc-1",
    reason: "Cancelled late",
    details: null,
    status: "open",
    resolution: null,
    resolution_note: null,
    created_at: "2026-10-14",
    resolved_at: null,
    jobs: { title: "Paint fence", service_categories: { name: "Painting" }, client: { full_name: "Ana" }, provider: { full_name: "Rico" } },
    escrow_transactions: { amount: "300.00", status: "held" },
    raised_by_profile: { id: "c1", full_name: "Ana" },
    ...extra,
  });

  it("maps the cancellation state and deadline of a dispute", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        disputes: [disputeRow({ cancellation_state: "pending", cancellation_deadline: "2026-10-16T00:00:00Z" })],
        total: 1,
      }))
      .mockResolvedValueOnce(txnResponse()) as unknown as typeof fetch;

    const [d] = await services.getDisputes();
    expect(d.cancellationState).toBe("pending");
    expect(d.cancellationDeadline).toBe("2026-10-16T00:00:00Z");
  });

  it("maps an unknown cancellation state through unchanged", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        disputes: [disputeRow({ cancellation_state: "escalated", cancellation_deadline: null })],
        total: 1,
      }))
      .mockResolvedValueOnce(txnResponse()) as unknown as typeof fetch;

    const [d] = await services.getDisputes();
    expect(d.cancellationState).toBe("escalated");
    expect(d.cancellationDeadline).toBeNull();
  });

  it("sets cancellation fields to null when the API omits them", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ disputes: [disputeRow({})], total: 1 }))
      .mockResolvedValueOnce(txnResponse()) as unknown as typeof fetch;

    const [d] = await services.getDisputes();
    expect(d.cancellationState).toBeNull();
    expect(d.cancellationDeadline).toBeNull();
  });

  it("maps completed_at and status on the booking detail", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      id: "job-9",
      status: "completed",
      completed_at: "2026-10-14T12:00:00Z",
      description: null,
      address: null,
      scheduled_at: null,
      photo_urls: null,
      escrow: null,
    }))) as unknown as typeof fetch;

    const detail = await services.getBookingDetail("job-9");
    expect(detail.completedAt).toBe("2026-10-14T12:00:00Z");
    expect(detail.status).toBe("completed");
  });

  it("sets completedAt to null on a booking that has not completed", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      id: "job-10",
      status: "posted",
      description: null,
      address: null,
      scheduled_at: null,
      photo_urls: null,
      escrow: null,
    }))) as unknown as typeof fetch;

    const detail = await services.getBookingDetail("job-10");
    expect(detail.completedAt).toBeNull();
    expect(detail.status).toBe("posted");
  });

  it("maps the verification method and defaults it to manual", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      verifications: [
        {
          id: "v-s", provider_id: "p-s", full_name: "Lia", email: "lia@test.com", status: "pending",
          submitted_at: "2026-10-10", reviewed_at: null, rejection_reason: null, documents: [], method: "stripe_identity",
        },
        {
          id: "v-m", provider_id: "p-m", full_name: "Mo", email: "mo@test.com", status: "pending",
          submitted_at: "2026-10-10", reviewed_at: null, rejection_reason: null, documents: [],
        },
      ],
      total: 2,
    }))) as unknown as typeof fetch;

    const [stripe, manual] = await services.getVerifications();
    expect(stripe.method).toBe("stripe_identity");
    expect(manual.method).toBe("manual");
  });
});

describe("analytics summary stand-in", () => {
  it("rebuilds the summary from list endpoints when /admin/analytics/summary fails", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/admin/analytics/summary")) {
        return Promise.resolve(jsonResponse({ message: "Could not embed because more than one relationship was found" }, 400));
      }
      if (url.includes("/admin/users")) {
        return Promise.resolve(jsonResponse({
          users: url.includes("status=deleted") ? [] : [
            { id: "p1", role: "provider", full_name: "Pat", cached_avg_rating: 4.5, cached_completed_jobs: 7, deactivated_at: null },
            { id: "c1", role: "client", full_name: "Cam", cached_avg_rating: null, cached_completed_jobs: null, deactivated_at: null },
          ],
          total: url.includes("status=deleted") ? 0 : 2,
        }));
      }
      if (url.includes("/admin/bookings")) {
        return Promise.resolve(jsonResponse({ bookings: [{ id: "j1", status: "completed", posted_at: "2026-09-01T00:00:00Z", service_categories: { name: "Plumbing" } }], total: 1 }));
      }
      if (url.includes("/admin/wallet-transactions")) {
        return Promise.resolve(jsonResponse({ transactions: [{ amount: "900", created_at: "2026-09-02T00:00:00Z" }], total: 1 }));
      }
      if (url.includes("/admin/transactions")) {
        return Promise.resolve(jsonResponse({ transactions: [{ commission_amount: "100", released_at: "2026-09-02T00:00:00Z" }], total: 1 }));
      }
      if (url.includes("/admin/verifications")) return Promise.resolve(jsonResponse({ verifications: [], total: 3 }));
      if (url.includes("/admin/withdrawals")) return Promise.resolve(jsonResponse({ withdrawals: [], total: 1 }));
      return Promise.resolve(jsonResponse({}, 404));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const stats = await services.getDashboardStats();
    expect(services.lastAnalyticsSource()).toBe("browser");
    expect(stats).toMatchObject({
      totalUsers: 2,
      activeProviders: 1,
      totalBookings: 1,
      // Released payments: the 900 paid to providers plus the 100 commission.
      totalRevenue: 1000,
      totalCommission: 100,
      completionRate: 100,
      avgRating: 4.5,
      pendingVerifications: 3,
      pendingWithdrawals: 1,
    });
  });

  it("does not hide a signed-out session behind the stand-in", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ message: "Unauthorized" }, 401))) as unknown as typeof fetch;
    await expect(services.getDashboardStats()).rejects.toMatchObject({ status: 401 });
  });
});

describe("dispute case parties", () => {
  it("carries the job's client and assigned provider ids when the API sends them", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        disputes: [{
          id: "d-parties", job_id: "j-parties", escrow_id: null, reason: "Work quality", details: null, status: "open", resolution: null,
          resolution_note: null, resolved_at: null, created_at: "2026-10-04", escrow_transactions: null,
          jobs: { title: "Repair", service_categories: null, client_id: "c-1", assigned_provider_id: "p-1", client: { full_name: "Ana" }, provider: { full_name: "Rico" } },
        }],
        total: 1,
      }))
      .mockResolvedValueOnce(jsonResponse({ transactions: [], total: 0 })) as unknown as typeof fetch;
    const [d] = await services.getDisputes();
    expect(d.clientId).toBe("c-1");
    expect(d.providerId).toBe("p-1");
  });
});

describe("getJobConversation", () => {
  it("maps each message's sender id, body and signed attachment url", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({
      messages: [
        { id: "m1", sender_id: "c-1", sender_name: "Ana", body: "Here is the leak", attachment_path: "j/leak.jpg", attachment_url: "https://signed.test/leak.jpg", read_at: null, created_at: "2026-10-04T10:00:00Z" },
        { id: "m2", sender_id: "p-1", sender_name: "Rico", body: "", attachment_path: null, attachment_url: null, read_at: null, created_at: "2026-10-04T10:05:00Z" },
      ],
    }))) as unknown as typeof fetch;
    const { messages } = await services.getJobConversation("j-1");
    expect(messages[0]).toMatchObject({ id: "m1", senderId: "c-1", senderName: "Ana", body: "Here is the leak", attachmentUrl: "https://signed.test/leak.jpg" });
    expect(messages[1]).toMatchObject({ id: "m2", senderId: "p-1", senderName: "Rico" });
    expect(messages[1].attachmentUrl).toBeNull();
  });

  it("returns the total and has_more, and sends the before cursor for an older page", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() => Promise.resolve(jsonResponse({
      messages: [{ id: "m0", sender_id: "c-1", sender_name: "Ana", body: "Older", attachment_path: null, attachment_url: null, read_at: null, created_at: "2026-10-04T09:00:00Z" }],
      total: 51,
      has_more: true,
    })));
    global.fetch = fetchMock as unknown as typeof fetch;
    const page = await services.getJobConversation("j-1", { before: "11111111-2222-3333-4444-555555555555" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/admin/jobs/j-1/conversation?before=11111111-2222-3333-4444-555555555555");
    expect(page).toMatchObject({ total: 51, hasMore: true });
    expect(page.messages.map((m) => m.id)).toEqual(["m0"]);
  });

  it("sends no cursor for the newest page", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(() => Promise.resolve(jsonResponse({ messages: [], total: 0, has_more: false })));
    global.fetch = fetchMock as unknown as typeof fetch;
    const page = await services.getJobConversation("j-1");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("before=");
    expect(page).toEqual({ messages: [], total: 0, hasMore: false });
  });
});

describe("commission overview (migration 0024)", () => {
  it("maps the rate and the earnings figures the commission tab leads with", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          commission_rate: "0.15",
          updated_at: "2026-10-01T00:00:00Z",
          total_earned: 22.58,
          earned_this_month: 7.58,
          released_jobs: 2,
          pending_estimate: 125.05,
        }),
      ),
    ) as unknown as typeof fetch;

    await expect(services.getCommission()).resolves.toEqual({
      rate: 0.15,
      updatedAt: "2026-10-01T00:00:00Z",
      totalEarned: 22.58,
      earnedThisMonth: 7.58,
      releasedJobs: 2,
      pendingEstimate: 125.05,
    });
  });
});

describe("platform identity (migration 0047)", () => {
  const row = { platform_name: "TaskBuddy", support_email: "help@taskbuddy.test", identity_version: 4 };

  it("maps the settings row and sends the expected version on save", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ ...row, platform_name: "TaskBuddy PH", identity_version: 5 })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const saved = await services.updatePlatformIdentity({ platformName: " TaskBuddy PH ", supportEmail: "help@taskbuddy.test", expectedVersion: 4 });

    expect(saved).toEqual({ platformName: "TaskBuddy PH", supportEmail: "help@taskbuddy.test", identityVersion: 5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/admin\/platform-identity$/);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ expected_version: 4, platform_name: "TaskBuddy PH", support_email: "help@taskbuddy.test" });
  });

  it("sends a cleared support email as null so the backend clears it", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ ...row, support_email: null, identity_version: 5 })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await services.updatePlatformIdentity({ platformName: "TaskBuddy", supportEmail: null, expectedVersion: 4 });

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({ support_email: null });
  });

  it("reads the current identity", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(row))) as unknown as typeof fetch;
    await expect(services.getPlatformIdentity()).resolves.toEqual({
      platformName: "TaskBuddy",
      supportEmail: "help@taskbuddy.test",
      identityVersion: 4,
    });
  });

  it("returns null when the endpoint is not deployed yet (404)", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ message: "Cannot GET /admin/platform-identity" }, 404))) as unknown as typeof fetch;
    await expect(services.getPlatformIdentity()).resolves.toBeNull();
  });

  it("returns null when the settings table is missing (the backend's error names it)", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: 'relation "public.platform_settings" does not exist' }, 500)),
    ) as unknown as typeof fetch;
    await expect(services.getPlatformIdentity()).resolves.toBeNull();
  });

  it("still throws other read failures", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ message: "Database unavailable" }, 500))) as unknown as typeof fetch;
    await expect(services.getPlatformIdentity()).rejects.toMatchObject({ status: 500, message: "Database unavailable" });
  });

  it("surfaces a 409 conflict from a stale save", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Platform settings changed; reload and try again" }, 409)),
    ) as unknown as typeof fetch;
    await expect(
      services.updatePlatformIdentity({ platformName: "TaskBuddy", supportEmail: null, expectedVersion: 4 }),
    ).rejects.toMatchObject({ status: 409, message: "Platform settings changed; reload and try again" });
  });
});

describe("job capacity (migration 0048)", () => {
  const row = {
    client_active_max: 3, provider_active_max: 3, provider_pending_max: 3,
    daily_hours_max: "8", rest_hours: "1", travel_kmh: 20,
  };
  const limits = {
    clientActiveMax: 3, providerActiveMax: 3, providerPendingMax: 3,
    dailyHoursMax: 8, restHours: 1, travelKmh: 20,
  };

  it("reads the limits, converting numeric strings", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(row))) as unknown as typeof fetch;
    await expect(services.getJobCapacity()).resolves.toEqual(limits);
  });

  it("returns null when the endpoint or table is not deployed yet", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ message: "Not Found" }, 404))) as unknown as typeof fetch;
    await expect(services.getJobCapacity()).resolves.toBeNull();
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: 'Could not find the table \'public.job_capacity_settings\' in the schema cache' }, 500)),
    ) as unknown as typeof fetch;
    await expect(services.getJobCapacity()).resolves.toBeNull();
  });

  it("PATCHes all six limits in snake_case and returns the saved row", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ ...row, client_active_max: 5 })),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const saved = await services.updateJobCapacity({ ...limits, clientActiveMax: 5 });

    expect(saved).toEqual({ ...limits, clientActiveMax: 5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/admin\/job-capacity$/);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({
      client_active_max: 5, provider_active_max: 3, provider_pending_max: 3,
      daily_hours_max: 8, rest_hours: 1, travel_kmh: 20,
    });
  });
});

describe("getVerificationHistory", () => {
  it("keeps approved certificates that later expired, newest decision first", async () => {
    const cert = (id: string, status: string, reviewed_at: string) => ({
      id, provider_id: "p1", category_id: 1, title: "NC II", status, rejection_reason: null, reviewed_at, created_at: "2026-01-01T00:00:00Z",
      service_categories: { id: 1, name: "Plumbing" }, profiles: { full_name: "Ana" },
    });
    global.fetch = vi.fn((url: string) => {
      if (String(url).includes("/admin/credentials?status=approved")) {
        return Promise.resolve(jsonResponse({ credentials: [cert("c-old", "expired", "2026-08-01T00:00:00Z"), cert("c-ok", "approved", "2026-10-01T00:00:00Z")], total: 2 }));
      }
      if (String(url).includes("/admin/credentials?status=rejected")) {
        return Promise.resolve(jsonResponse({ credentials: [cert("c-no", "rejected", "2026-09-01T00:00:00Z")], total: 1 }));
      }
      return Promise.resolve(jsonResponse({ verifications: [], total: 0 }));
    }) as unknown as typeof fetch;

    const history = await services.getVerificationHistory();

    expect(history.map((h) => [h.id, h.result])).toEqual([
      ["c:c-ok", "approved"],
      ["c:c-no", "rejected"],
      ["c:c-old", "expired"],
    ]);
  });
});
