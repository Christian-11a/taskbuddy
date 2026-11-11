import { describe, expect, it } from "vitest";
import { buildPlatformReport, buildProviderReport } from "./build";
import { platformReportCsv, providerReportCsv } from "./exportReport";
import type { ReportBooking, ReportEscrow } from "./types";

const booking: ReportBooking = {
  id: "j1",
  postedAt: "2026-10-05T00:00:00Z",
  status: "completed",
  disputeState: null,
  categoryId: 4,
  categoryName: "Plumbing",
  clientName: "Ana Cruz",
  providerId: "p1",
  providerName: "Mark Santos",
  budget: 0,
};

const escrow: ReportEscrow = {
  id: "e1",
  jobId: "j1",
  amount: 1000,
  commission: 150,
  status: "released",
  heldAt: "2026-10-05T00:00:00Z",
  releasedAt: "2026-10-06T00:00:00Z",
  refundedAt: null,
  categoryName: "Plumbing",
  clientName: "Ana Cruz",
  providerId: "p1",
  providerName: "Mark Santos",
};

const filters = {
  from: "2026-10-01",
  to: "2026-10-31",
  status: "all" as const,
  categoryId: null,
  categoryName: null,
  providerId: "p1",
};

describe("report CSV", () => {
  it("names the platform file with the period and writes the platform columns", () => {
    const report = buildPlatformReport([booking], [escrow], { ...filters, providerId: null });
    const file = platformReportCsv(report, "2026-10-01", "2026-10-31");
    expect(file.filename).toBe("taskbuddy-platform-2026-10-01_2026-10-31.csv");
    expect(file.csv).toContain("SUMMARY\r\nMetric,Value\r\nBookings,1\r\n");
    expect(file.csv).toContain("Gross released payments,1000\r\n");
    expect(file.csv).toContain("BY CATEGORY\r\nCategory,Bookings,Gross released payments,TaskBuddy commission,Provider payouts,Refunds\r\n");
    expect(file.csv).toContain("BY MONTH\r\nMonth,Bookings,Gross released payments,TaskBuddy commission,Provider payouts,Refunds\r\n");
  });

  it("names the provider file with the provider and period, and uses job columns", () => {
    const report = buildProviderReport([booking], [escrow], filters, { id: "p1", name: "Mark Santos" });
    const file = providerReportCsv(report, "2026-10-01", "2026-10-31", false);
    expect(file.filename).toBe("taskbuddy-provider-mark-santos-2026-10-01_2026-10-31.csv");
    expect(file.csv).toContain("Average rating,Not available\r\n");
    expect(file.csv).toContain("JOBS\r\nDate,Client,Service,Amount,Fee,Status\r\n");
    expect(file.csv).toContain("2026-10-05,Ana Cruz,Plumbing,1000,150,Completed");
  });
});
