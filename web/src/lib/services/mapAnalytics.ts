// ─── Analytics mapping ────────────────────────────────────────────────────────
// Pure functions turning the backend's /admin/analytics/summary response into
// the separate display shapes the Reports page (and, incidentally, the
// Dashboard Overview page — they share AppContext state) expect. Kept apart
// from services/index.ts so the mapping logic is unit-testable without
// mocking fetch.

import type { AdminActivityApiRow, AnalyticsSummaryApiResponse } from "@/lib/api/types";
import type { ActivityEvent, ActivityType, CategoryShare, MonthlyPoint, TopProvider } from "@/lib/domain";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** completed / total bookings, 0–100, one decimal place. */
export function mapCompletionRate(summary: AnalyticsSummaryApiResponse): number {
  const total = summary.totals.bookings;
  if (total === 0) return 0;
  const completed = summary.bookings_by_status["completed"] ?? 0;
  return Math.round((completed / total) * 1000) / 10;
}

/** Daily booking_trend entries summed into monthly buckets, sorted ascending. */
export function mapBookingsSeries(summary: AnalyticsSummaryApiResponse): MonthlyPoint[] {
  const byMonth = new Map<string, number>();
  for (const { date, count } of summary.booking_trend) {
    const key = date.slice(0, 7); // "YYYY-MM"
    byMonth.set(key, (byMonth.get(key) ?? 0) + count);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const monthIndex = Number(key.slice(5, 7)) - 1;
      return { month: MONTH_LABELS[monthIndex] ?? key, value };
    });
}

/** bookings_by_category counts converted to percentage shares (rounded —
 *  may not sum to exactly 100, acceptable for a display chart). */
export function mapBookingsByCategory(summary: AnalyticsSummaryApiResponse): CategoryShare[] {
  const entries = Object.entries(summary.bookings_by_category);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return [];
  return entries
    .map(([label, count]) => ({ label, value: Math.round((count / total) * 100) }))
    .sort((a, b) => b.value - a.value);
}

export function mapTopProviders(summary: AnalyticsSummaryApiResponse): TopProvider[] {
  return summary.top_providers.map((p) => ({
    name: p.profiles?.full_name ?? "Unknown provider",
    jobs: p.cached_completed_jobs ?? 0,
    rating: p.cached_avg_rating ?? 0,
  }));
}

/** revenue_trend entries (already monthly) mapped to the chart's display shape. */
export function mapRevenueSeries(summary: AnalyticsSummaryApiResponse): MonthlyPoint[] {
  return summary.revenue_trend.map(({ month, amount }) => {
    const monthIndex = Number(month.slice(5, 7)) - 1;
    return { month: MONTH_LABELS[monthIndex] ?? month, value: amount };
  });
}

const activityTypeFor = (status: string): ActivityType => {
  if (status === "completed") return "tx";
  if (status === "cancelled" || status === "expired") return "alert";
  return "user";
};

/** Coarse "Xm/h/d ago" — matches the mock data's granularity; no need for
 *  anything more precise on an admin activity feed. */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** job_status_history rows (the existing audit trail) turned into the
 *  dashboard's activity feed — no new table needed. */
export function mapActivity(rows: AdminActivityApiRow[]): ActivityEvent[] {
  return rows.map((row) => {
    const title = row.jobs?.title ?? "a job";
    const text =
      row.new_status === "completed"
        ? `Booking "${title}" was completed`
        : row.new_status === "cancelled"
          ? `Booking "${title}" was cancelled`
          : `Booking "${title}" moved to ${row.new_status.replace("_", " ")}`;
    return {
      time: formatRelativeTime(row.changed_at),
      text,
      type: activityTypeFor(row.new_status),
    };
  });
}
