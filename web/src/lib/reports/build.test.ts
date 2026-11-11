import { describe, expect, it } from "vitest";
import { buildPlatformReport, buildProviderReport, type ReportFilters } from "./build";
import type { ReportBooking, ReportEscrow } from "./types";

function booking(over: Partial<ReportBooking> = {}): ReportBooking {
  return {
    id: "j1",
    postedAt: "2026-10-05T00:00:00Z",
    status: "completed",
    disputeState: null,
    categoryId: 4,
    categoryName: "Plumbing",
    clientName: "Ana",
    providerId: "p1",
    providerName: "Mark Santos",
    budget: 0,
    ...over,
  };
}

function escrow(over: Partial<ReportEscrow> = {}): ReportEscrow {
  return {
    id: "e1",
    jobId: "j1",
    amount: 1000,
    commission: 150,
    status: "released",
    heldAt: "2026-10-05T00:00:00Z",
    releasedAt: "2026-10-06T00:00:00Z",
    refundedAt: null,
    categoryName: "Plumbing",
    clientName: "Ana",
    providerId: "p1",
    providerName: "Mark Santos",
    ...over,
  };
}

function filters(over: Partial<ReportFilters> = {}): ReportFilters {
  return {
    from: "2026-10-01",
    to: "2026-10-31",
    status: "all",
    categoryId: null,
    categoryName: null,
    providerId: null,
    ...over,
  };
}

const bookings = [
  booking(),
  booking({ id: "j2", status: "cancelled", clientName: "Bea", postedAt: "2026-10-08T00:00:00Z" }),
  booking({
    id: "j3",
    categoryId: 5,
    categoryName: "Electrical",
    clientName: "Cara",
    providerId: "p2",
    providerName: "Lee Tan",
    postedAt: "2026-10-09T00:00:00Z",
  }),
];

const escrows = [
  escrow(),
  escrow({
    id: "e2",
    jobId: "j2",
    amount: 200,
    commission: 0,
    status: "refunded",
    releasedAt: null,
    refundedAt: "2026-10-10T00:00:00Z",
    clientName: "Bea",
  }),
  escrow({
    id: "e3",
    jobId: "j3",
    amount: 500,
    commission: 50,
    categoryName: "Electrical",
    clientName: "Cara",
    providerId: "p2",
    providerName: "Lee Tan",
    releasedAt: "2026-10-12T00:00:00Z",
  }),
];

describe("buildPlatformReport", () => {
  it("changes totals when the status, category, or dates change", () => {
    const all = buildPlatformReport(bookings, escrows, filters());
    expect(all.bookings).toBe(3);
    expect(all.completed).toBe(2);
    expect(all.cancelled).toBe(1);
    expect(all.money).toEqual({ grossReleased: 1500, commission: 200, providerPayouts: 1300, refunds: 200 });

    const cancelled = buildPlatformReport(bookings, escrows, filters({ status: "cancelled" }));
    expect(cancelled.bookings).toBe(1);
    expect(cancelled.money.grossReleased).toBe(0);
    expect(cancelled.money.refunds).toBe(200);

    const plumbing = buildPlatformReport(bookings, escrows, filters({ categoryId: 4, categoryName: "Plumbing" }));
    expect(plumbing.bookings).toBe(2);
    expect(plumbing.money.grossReleased).toBe(1000);

    const september = buildPlatformReport(bookings, escrows, filters({ from: "2026-09-01", to: "2026-09-30" }));
    expect(september.bookings).toBe(0);
    expect(september.money.grossReleased).toBe(0);
  });

  it("keeps a released payment that settled in the period even when the job was posted earlier", () => {
    const early = booking({ id: "j9", postedAt: "2026-08-01T00:00:00Z" });
    const paid = escrow({ id: "e9", jobId: "j9", amount: 80, commission: 8, releasedAt: "2026-10-02T00:00:00Z" });
    const report = buildPlatformReport([early], [paid], filters());
    expect(report.bookings).toBe(0);
    expect(report.money.grossReleased).toBe(80);
    expect(report.money.providerPayouts).toBe(72);
  });
});

describe("buildProviderReport", () => {
  it("includes only that provider's jobs and leaves the period rating unavailable", () => {
    const report = buildProviderReport(bookings, escrows, filters({ providerId: "p1" }), { id: "p1", name: "Mark Santos" });
    expect(report.providerName).toBe("Mark Santos");
    expect(report.jobs).toBe(2);
    expect(report.jobRows.map((row) => row.client)).toEqual(["Bea", "Ana"]);
    expect(report.grossEarned).toBe(1000);
    expect(report.platformFee).toBe(150);
    expect(report.netReceived).toBe(850);
    expect(report.averageRating).toBeNull();
  });

  it("is empty until a provider is chosen", () => {
    const report = buildProviderReport(bookings, escrows, filters(), null);
    expect(report.jobs).toBe(0);
    expect(report.jobRows).toEqual([]);
  });
});
