import { describe, expect, it } from "vitest";
import { summarizeAnalytics } from "./browserAnalytics";
import type { AdminBookingApiRow, AdminUserApiRow, AdminWalletTxnApiRow } from "@/lib/api/types";

function user(id: string, role: AdminUserApiRow["role"], extra: Partial<AdminUserApiRow> = {}): AdminUserApiRow {
  return {
    id, role, email: `${id}@x.test`, full_name: id.toUpperCase(), deactivated_at: null, created_at: "2026-01-01",
    cached_avg_rating: null, cached_completed_jobs: null, phone: null, city: null, category_name: null,
    suspended_until: null, suspension_reason: null, ...extra,
  };
}
const job = (status: string, posted_at: string, category: string | null): AdminBookingApiRow =>
  ({ id: posted_at + status, status, posted_at, budget: 100, service_categories: category ? { name: category } : null, client: null, provider: null }) as AdminBookingApiRow;
const payout = (amount: string, created_at: string) => ({ amount, created_at, kind: "payout", status: "completed" }) as unknown as AdminWalletTxnApiRow;

describe("summarizeAnalytics", () => {
  const now = new Date("2026-09-15T00:00:00Z");
  const summary = summarizeAnalytics(
    {
      users: [
        user("c1", "client"),
        user("p1", "provider", { cached_avg_rating: 4, cached_completed_jobs: 3, category_name: "Plumbing" }),
        user("p2", "provider", { cached_avg_rating: 5, cached_completed_jobs: 9, deactivated_at: "2026-09-01" }),
        user("p3", "provider"),
        user("c1", "client"), // same profile from a second list call
      ],
      jobs: [job("completed", "2026-09-02T10:00:00Z", "Plumbing"), job("open", "2026-09-02T12:00:00Z", null), job("completed", "2026-08-30T08:00:00Z", "Cleaning")],
      payouts: [payout("1000.50", "2026-09-03T00:00:00Z"), payout("500", "2026-08-10T00:00:00Z")],
      releasedEscrow: [
        { commission_amount: "100.05", released_at: "2026-09-03T00:00:00Z" },
        { commission_amount: 0, released_at: "2026-09-04T00:00:00Z" },
      ] as never,
      pendingVerifications: 2,
      pendingWithdrawals: 1,
    },
    now,
  );

  it("counts people once and by role", () => {
    expect(summary.totals).toMatchObject({ users: 4, clients: 1, providers: 3, suspended: 1 });
  });

  it("uses completed payouts for revenue and released commission, by month", () => {
    expect(summary.totals.total_revenue).toBe(1500.5);
    expect(summary.totals.monthly_revenue).toBe(1000.5);
    expect(summary.revenue_trend).toEqual([{ month: "2026-08", amount: 500 }, { month: "2026-09", amount: 1000.5 }]);
    expect(summary.totals.total_commission).toBe(100.05);
    expect(summary.totals.monthly_commission).toBe(100.05);
  });

  it("buckets bookings by status, category and day", () => {
    expect(summary.totals.bookings).toBe(3);
    expect(summary.bookings_by_status).toEqual({ completed: 2, open: 1 });
    expect(summary.bookings_by_category).toEqual({ Plumbing: 1, Unknown: 1, Cleaning: 1 });
    expect(summary.booking_trend).toEqual([{ date: "2026-08-30", count: 1 }, { date: "2026-09-02", count: 2 }]);
  });

  it("averages only rated providers and ranks top providers by completed jobs", () => {
    expect(summary.totals.avg_rating).toBe(4.5);
    expect(summary.top_providers.map((p) => p.profile_id)).toEqual(["p2", "p1", "p3"]);
    expect(summary.top_providers[1].service_categories).toEqual({ name: "Plumbing" });
  });
});
