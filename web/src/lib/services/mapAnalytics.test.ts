import { describe, expect, it } from "vitest";
import {
  mapActivity,
  mapBookingsByCategory,
  mapBookingsSeries,
  mapCommissionSeries,
  mapCompletionRate,
  mapRevenueSeries,
  mapTopProviders,
} from "./mapAnalytics";
import type { AnalyticsSummaryApiResponse } from "@/lib/api/types";

const NOW = new Date("2026-05-20T00:00:00Z"); // UTC 2026-05-20

const SUMMARY: AnalyticsSummaryApiResponse = {
  totals: {
    users: 10,
    clients: 6,
    providers: 4,
    suspended: 1,
    bookings: 5,
    avg_rating: 4.5,
    total_revenue: 1500,
    monthly_revenue: 600,
    pending_verifications: 2,
  },
  bookings_by_status: { completed: 3, open: 2 },
  bookings_by_category: { Plumbing: 3, Cleaning: 1 },
  booking_trend: [
    { date: "2026-04-01", count: 2 },
    { date: "2026-04-15", count: 1 },
    { date: "2026-05-02", count: 2 },
  ],
  revenue_trend: [
    { month: "2026-04", amount: 900 },
    { month: "2026-05", amount: 600 },
  ],
  top_providers: [
    {
      profile_id: "p1",
      cached_avg_rating: 4.8,
      cached_ratings_count: 12,
      cached_completed_jobs: 20,
      profiles: { full_name: "Pat Morgan" },
      service_categories: { name: "Plumbing" },
    },
    {
      profile_id: "p2",
      cached_avg_rating: null,
      cached_ratings_count: 0,
      cached_completed_jobs: 0,
      profiles: null,
      service_categories: null,
    },
  ],
};

describe("mapCompletionRate", () => {
  it("computes completed / total as a percentage", () => {
    expect(mapCompletionRate(SUMMARY)).toBe(60);
  });
  it("returns 0 when there are no bookings", () => {
    expect(
      mapCompletionRate({ ...SUMMARY, totals: { ...SUMMARY.totals, bookings: 0 } }),
    ).toBe(0);
  });
});

describe("mapBookingsSeries", () => {
  it("sums daily counts into monthly buckets, keyed by YYYY-MM, zero-filled to 12 months ending this month", () => {
    const series = mapBookingsSeries(SUMMARY, NOW);
    expect(series).toHaveLength(12);
    expect(series[0]).toEqual({ month: "2025-06", value: 0 });
    expect(series.slice(-3)).toEqual([
      { month: "2026-03", value: 0 },
      { month: "2026-04", value: 3 },
      { month: "2026-05", value: 2 },
    ]);
  });

  it("keeps the year across the Dec to Jan boundary", () => {
    const series = mapBookingsSeries(
      { ...SUMMARY, booking_trend: [{ date: "2026-12-30", count: 4 }, { date: "2027-01-02", count: 1 }] },
      new Date("2027-01-15T00:00:00Z"),
    );
    expect(series.slice(-3)).toEqual([
      { month: "2026-11", value: 0 },
      { month: "2026-12", value: 4 },
      { month: "2027-01", value: 1 },
    ]);
  });

  it("drops activity outside the 12-month window", () => {
    const series = mapBookingsSeries({ ...SUMMARY, booking_trend: [{ date: "2024-01-05", count: 9 }] }, NOW);
    expect(series.every((p) => p.value === 0)).toBe(true);
  });
});

describe("mapBookingsByCategory", () => {
  it("converts counts to percentage shares, largest first", () => {
    expect(mapBookingsByCategory(SUMMARY)).toEqual([
      { label: "Plumbing", value: 75 },
      { label: "Cleaning", value: 25 },
    ]);
  });
  it("returns an empty array when there are no bookings", () => {
    expect(mapBookingsByCategory({ ...SUMMARY, bookings_by_category: {} })).toEqual([]);
  });
});

describe("mapTopProviders", () => {
  it("maps provider rows, defaulting missing names/ratings", () => {
    expect(mapTopProviders(SUMMARY)).toEqual([
      { name: "Pat Morgan", jobs: 20, rating: 4.8 },
      { name: "Unknown provider", jobs: 0, rating: 0 },
    ]);
  });
});

describe("mapRevenueSeries", () => {
  it("maps revenue_trend months to chart points, zero-filled", () => {
    const series = mapRevenueSeries(SUMMARY, NOW);
    expect(series).toHaveLength(12);
    expect(series.slice(-3)).toEqual([
      { month: "2026-03", value: 0 },
      { month: "2026-04", value: 900 },
      { month: "2026-05", value: 600 },
    ]);
  });
});

describe("mapRevenueSeries with commission", () => {
  it("sums provider payouts and commission per month into released payments", () => {
    const summary = {
      ...SUMMARY,
      revenue_trend: [{ month: "2026-04", amount: 900 }, { month: "2026-05", amount: 600 }],
      commission_trend: [{ month: "2026-05", amount: 60 }, { month: "2026-06", amount: 5.5 }],
    } as AnalyticsSummaryApiResponse;
    expect(mapRevenueSeries(summary, new Date("2026-06-10T00:00:00Z")).slice(-3)).toEqual([
      { month: "2026-04", value: 900 },
      { month: "2026-05", value: 660 },
      { month: "2026-06", value: 5.5 },
    ]);
  });

  it("names the year when the window crosses a year, and fills the gap months with 0", () => {
    const summary = {
      ...SUMMARY,
      revenue_trend: [{ month: "2026-12", amount: 50 }],
      commission_trend: [],
    } as AnalyticsSummaryApiResponse;
    const series = mapRevenueSeries(summary, new Date("2027-01-15T00:00:00Z"));
    expect(series[0].month).toBe("2026-02");
    expect(series.at(-1)).toEqual({ month: "2027-01", value: 0 });
    expect(series.find((p) => p.month === "2026-12")).toEqual({ month: "2026-12", value: 50 });
    expect(series.find((p) => p.month === "2026-11")).toEqual({ month: "2026-11", value: 0 });
  });

  it("ends the window at the UTC month: 2026-10-31 20:00 UTC is still October", () => {
    const series = mapRevenueSeries(SUMMARY, new Date("2026-10-31T20:00:00Z"));
    expect(series.at(-1)?.month).toBe("2026-10");
  });
});

describe("mapCommissionSeries", () => {
  it("returns the released commission per month, zero-filled, keyed YYYY-MM", () => {
    const summary = { ...SUMMARY, commission_trend: [{ month: "2026-05", amount: 60 }] } as AnalyticsSummaryApiResponse;
    const series = mapCommissionSeries(summary, NOW);
    expect(series).toHaveLength(12);
    expect(series.slice(-2)).toEqual([
      { month: "2026-04", amount: 0 },
      { month: "2026-05", amount: 60 },
    ]);
  });
});

describe("mapActivity", () => {
  it("describes completed/cancelled/other transitions distinctly", () => {
    const now = new Date().toISOString();
    const result = mapActivity([
      {
        id: 1,
        old_status: "in_progress",
        new_status: "completed",
        changed_at: now,
        jobs: { title: "3 bedroom clean" },
        changed_by: { full_name: "Georgina Ramos" },
      },
      {
        id: 2,
        old_status: "open",
        new_status: "cancelled",
        changed_at: now,
        jobs: null,
        changed_by: null,
      },
      {
        id: 3,
        old_status: "open",
        new_status: "in_progress",
        changed_at: now,
        jobs: { title: "Fix sink" },
        changed_by: null,
      },
    ]);

    expect(result.map((r) => r.text)).toEqual([
      'Booking "3 bedroom clean" was completed',
      'Booking "a job" was cancelled',
      'Booking "Fix sink" moved to in progress',
    ]);
    expect(result.map((r) => r.type)).toEqual(["tx", "alert", "user"]);
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(result.every((r) => r.time === "just now")).toBe(true);
  });
});
