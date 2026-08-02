import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/session", () => ({
  getStoredSession: vi.fn(() => null),
  setStoredSession: vi.fn(),
  clearStoredSession: vi.fn(),
}));

import { clearStoredSession, setStoredSession } from "@/lib/api/session";
import * as services from "./index";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("login", () => {
  it("stores the session and returns true on success", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          user: {
            id: "u1",
            email: "admin@taskbuddy.io",
            full_name: "Ana Cruz",
            role: "admin",
          },
          session: { access_token: "tok", refresh_token: "ref", expires_at: 123 },
        }),
      ),
    ) as unknown as typeof fetch;

    const ok = await services.login("admin@taskbuddy.io", "pw");

    expect(ok).toBe(true);
    // The refresh token is kept so an expired session renews instead of
    // forcing a logout, and the display name comes from the profile now.
    expect(setStoredSession).toHaveBeenCalledWith({
      accessToken: "tok",
      refreshToken: "ref",
      adminProfile: { name: "Ana Cruz", email: "admin@taskbuddy.io" },
    });
  });

  it("falls back to the email when the profile has no name", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          user: {
            id: "u1",
            email: "admin@taskbuddy.io",
            full_name: null,
            role: "admin",
          },
          session: { access_token: "tok", refresh_token: "ref", expires_at: 123 },
        }),
      ),
    ) as unknown as typeof fetch;

    await services.login("admin@taskbuddy.io", "pw");

    expect(setStoredSession).toHaveBeenCalledWith(
      expect.objectContaining({
        adminProfile: { name: "admin@taskbuddy.io", email: "admin@taskbuddy.io" },
      }),
    );
  });

  it("returns false on invalid credentials", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: "Invalid login credentials" }, 401)),
    ) as unknown as typeof fetch;

    const ok = await services.login("admin@taskbuddy.io", "wrong");

    expect(ok).toBe(false);
  });
});

describe("logout", () => {
  it("clears the stored session even if the request fails", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;

    await services.logout();

    expect(clearStoredSession).toHaveBeenCalled();
  });
});

describe("getUsers", () => {
  it("maps API rows to AdminUser, deriving status from deactivated_at", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          users: [
            { id: "u1", email: "a@b.c", full_name: "Alice", role: "client", deactivated_at: null, created_at: "2026-01-01", cached_avg_rating: null, cached_completed_jobs: null },
            { id: "u2", email: "b@b.c", full_name: "Bob", role: "provider", deactivated_at: "2026-02-01", created_at: "2026-01-02", cached_avg_rating: 4.5, cached_completed_jobs: 9 },
          ],
          total: 2,
        }),
      ),
    ) as unknown as typeof fetch;

    const users = await services.getUsers();

    expect(users).toEqual([
      { id: "u1", email: "a@b.c", role: "client", createdAt: "2026-01-01", name: "Alice", status: "ACTIVE", jobsCompleted: 0, rating: null },
      { id: "u2", email: "b@b.c", role: "provider", createdAt: "2026-01-02", name: "Bob", status: "SUSPENDED", jobsCompleted: 9, rating: 4.5 },
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
    expect(users[0].status).toBe("SUSPENDED");
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
      { id: "j1", customerName: "Alice", providerName: "Unassigned", service: "Plumbing", status: "open", scheduledDate: "2026-01-01", amount: 0 },
    ]);
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
      },
    ]);
  });
});

describe("getTransactions", () => {
  it("maps escrow states onto the page's display statuses", async () => {
    const row = (id: string, status: string) => ({
      id,
      job_id: `job-${id}`,
      amount: "1200.50",
      status,
      held_at: "2026-08-01",
      jobs: { title: "Deep clean", service_categories: { name: "Cleaning" } },
      client: { id: "c1", full_name: "Alice" },
      provider: { id: "p1", full_name: "Bob" },
    });
    global.fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          transactions: [
            row("t1", "held"),
            row("t2", "released"),
            row("t3", "disputed"),
            row("t4", "refunded"),
            row("t5", "cancelled"),
          ],
          total: 5,
        }),
      ),
    ) as unknown as typeof fetch;

    const transactions = await services.getTransactions();

    expect(transactions.map((t) => t.status)).toEqual([
      "IN_ESCROW",
      "COMPLETED",
      "DISPUTED",
      "REFUNDED",
      // No dedicated UI state for a cancelled hold.
      "REFUNDED",
    ]);
    expect(transactions[0]).toMatchObject({
      customerName: "Alice",
      providerName: "Bob",
      service: "Cleaning",
      amount: 1200.5,
    });
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
