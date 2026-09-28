// ─── Analytics summary, computed in the browser ───────────────────────────────
// Stand-in for GET /admin/analytics/summary while that endpoint is failing
// (see README → Needed to Move Forward). Every figure is rebuilt from list
// endpoints that do work, using the same rules as the backend's
// `AdminService.analyticsSummary()` so the numbers mean the same thing:
//
// - revenue      = completed wallet `payout` rows, by created_at month
// - commission   = released escrow `commission_amount` > 0, by released_at month
// - bookings     = every job, by status / category name / posted_at day
// - avg rating   = mean of provider cached_avg_rating, unrated excluded
// - top providers = providers by cached_completed_jobs, top 10
//
// Pure (no fetching) so it's unit-testable; services/index.ts does the I/O.

import type {
  AdminBookingApiRow,
  AdminTransactionApiRow,
  AdminUserApiRow,
  AdminWalletTxnApiRow,
  AnalyticsSummaryApiResponse,
} from "@/lib/api/types";

/** Escrow rows come back as `to_jsonb(escrow)`, so these columns are present
 *  even though the list mapping doesn't use them. */
export type EscrowRowWithCommission = AdminTransactionApiRow & {
  commission_amount?: number | string | null;
  released_at?: string | null;
};

export interface BrowserAnalyticsInput {
  users: AdminUserApiRow[];
  jobs: AdminBookingApiRow[];
  payouts: AdminWalletTxnApiRow[];
  releasedEscrow: EscrowRowWithCommission[];
  pendingVerifications: number;
  pendingWithdrawals: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function byMonth<T>(rows: T[], amountOf: (r: T) => number, dateOf: (r: T) => string | null | undefined) {
  const months: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const amount = amountOf(row);
    if (!Number.isFinite(amount)) continue;
    total += amount;
    const month = (dateOf(row) ?? "").slice(0, 7);
    if (month) months[month] = (months[month] ?? 0) + amount;
  }
  return { months, total };
}

export function summarizeAnalytics(input: BrowserAnalyticsInput, now: Date = new Date()): AnalyticsSummaryApiResponse {
  const currentMonth = now.toISOString().slice(0, 7);

  // The list endpoint can return a profile in more than one call (active +
  // deleted); count each once.
  const users = [...new Map(input.users.map((u) => [u.id, u])).values()];
  const providers = users.filter((u) => u.role === "provider");

  const revenue = byMonth(input.payouts, (t) => Number(t.amount), (t) => t.created_at);
  const commission = byMonth(
    input.releasedEscrow.filter((e) => Number(e.commission_amount ?? 0) > 0),
    (e) => Number(e.commission_amount),
    (e) => e.released_at,
  );

  const bookingsByStatus: Record<string, number> = {};
  const bookingsByCategory: Record<string, number> = {};
  const trendByDay: Record<string, number> = {};
  for (const job of input.jobs) {
    bookingsByStatus[job.status] = (bookingsByStatus[job.status] ?? 0) + 1;
    const category = job.service_categories?.name ?? "Unknown";
    bookingsByCategory[category] = (bookingsByCategory[category] ?? 0) + 1;
    const day = (job.posted_at ?? "").slice(0, 10);
    if (day) trendByDay[day] = (trendByDay[day] ?? 0) + 1;
  }

  const ratings = providers.map((p) => p.cached_avg_rating).filter((r): r is number => r !== null && r !== undefined);
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;

  const topProviders = [...providers]
    .sort((a, b) => (b.cached_completed_jobs ?? 0) - (a.cached_completed_jobs ?? 0))
    .slice(0, 10)
    .map((p) => ({
      profile_id: p.id,
      cached_avg_rating: p.cached_avg_rating,
      cached_ratings_count: null,
      cached_completed_jobs: p.cached_completed_jobs,
      profiles: { full_name: p.full_name },
      service_categories: p.category_name ? { name: p.category_name } : null,
    }));

  const sortedEntries = (rec: Record<string, number>) => Object.entries(rec).sort(([a], [b]) => a.localeCompare(b));

  return {
    totals: {
      users: users.length,
      clients: users.filter((u) => u.role === "client").length,
      providers: providers.length,
      suspended: users.filter((u) => u.deactivated_at).length,
      bookings: input.jobs.length,
      avg_rating: avgRating,
      total_revenue: round2(revenue.total),
      monthly_revenue: round2(revenue.months[currentMonth] ?? 0),
      total_commission: round2(commission.total),
      monthly_commission: round2(commission.months[currentMonth] ?? 0),
      pending_verifications: input.pendingVerifications,
      pending_withdrawals: input.pendingWithdrawals,
    },
    bookings_by_status: bookingsByStatus,
    bookings_by_category: bookingsByCategory,
    booking_trend: sortedEntries(trendByDay).map(([date, count]) => ({ date, count })),
    revenue_trend: sortedEntries(revenue.months).map(([month, amount]) => ({ month, amount: round2(amount) })),
    top_providers: topProviders,
  };
}
