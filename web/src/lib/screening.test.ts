import { describe, expect, it } from "vitest";
import type { DisputeResolution } from "@/lib/domain";
import {
  CANCELLATION_MIN_ASSIGNED,
  CANCELLATION_RATE_MIN,
  CERTIFICATE_EXPIRY_WITHIN_DAYS,
  DISPUTES_LOST_MIN,
  RATING_BELOW,
  RATING_MIN_COMPLETED_JOBS,
  REJECTED_VERIFICATIONS_MIN,
  countDisputes,
  countProviderBookings,
  flagsCancellation,
  flagsCertificate,
  flagsDisputes,
  flagsRating,
  flagsRejections,
  flagsSuspension,
  screenProvider,
  toScreeningBooking,
  toScreeningCertificate,
  type ScreeningCertificate,
  type ScreeningInput,
  type ScreeningUser,
} from "@/lib/screening";

const TODAY = "2026-11-11";

function plusDays(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const user: ScreeningUser = {
  joinedOn: "2024-03-10",
  jobsCompleted: 10,
  rating: 4.8,
  suspended: false,
  suspendedUntil: null,
  suspensionReason: null,
};

function cert(expiresOn: string | null, status: ScreeningCertificate["status"] = "approved"): ScreeningCertificate {
  return { providerId: "p1", status, expiresOn };
}

/** A provider with no rule firing. Each flag test overrides one input. */
function input(overrides: Partial<ScreeningInput> = {}): ScreeningInput {
  return {
    user,
    assignedJobs: 10,
    cancelledJobs: 1,
    disputes: { total: 1, open: 0, lost: 0 },
    certificates: [cert(plusDays(TODAY, CERTIFICATE_EXPIRY_WITHIN_DAYS + 1))],
    rejectedVerifications: REJECTED_VERIFICATIONS_MIN - 1,
    today: TODAY,
    ...overrides,
  };
}

function row(report: ReturnType<typeof screenProvider>, label: string) {
  const found = report.rows.find((item) => item.label === label);
  if (!found) throw new Error(`missing row ${label}`);
  return found;
}

describe("cancellation flag", () => {
  it("does not flag below the rate, at the rate with too few assigned jobs, or when the counts are missing", () => {
    expect(flagsCancellation(2, 10)).toBe(false);
    expect(flagsCancellation(2, CANCELLATION_MIN_ASSIGNED - 1)).toBe(false);
    expect(flagsCancellation(0, CANCELLATION_MIN_ASSIGNED)).toBe(false);
    expect(flagsCancellation(null, null)).toBe(false);
    expect(flagsCancellation(3, null)).toBe(false);
  });

  it("flags at the rate with enough assigned jobs, and above it", () => {
    expect(CANCELLATION_RATE_MIN).toBe(0.3);
    expect(flagsCancellation(3, 10)).toBe(true);
    expect(flagsCancellation(1, CANCELLATION_MIN_ASSIGNED)).toBe(true);
    expect(flagsCancellation(4, 10)).toBe(true);
  });
});

describe("dispute flag", () => {
  it("ignores a single loss, a reviewed or cancelled outcome, and missing totals", () => {
    expect(flagsDisputes(0, DISPUTES_LOST_MIN - 1)).toBe(false);
    expect(flagsDisputes(0, 0)).toBe(false);
    expect(flagsDisputes(null, null)).toBe(false);
    expect(flagsDisputes(0, null)).toBe(false);

    const rows: { providerId: string | null; isOpen: boolean; resolution: DisputeResolution | null }[] = [
      { providerId: "p1", isOpen: false, resolution: "REVIEWED" },
      { providerId: "p1", isOpen: false, resolution: null },
      { providerId: "p1", isOpen: false, resolution: "RELEASED_TO_PROVIDER" },
      { providerId: "other", isOpen: true, resolution: "REFUNDED_TO_CLIENT" },
    ];
    expect(countDisputes(rows, "p1")).toEqual({ total: 3, open: 0, lost: 0 });
  });

  it("flags any open dispute, and losses only when the resolution is refunded to the client", () => {
    expect(flagsDisputes(1, 0)).toBe(true);
    expect(flagsDisputes(0, DISPUTES_LOST_MIN)).toBe(true);
    expect(flagsDisputes(0, DISPUTES_LOST_MIN + 1)).toBe(true);
    const rows = [
      { providerId: "p1", isOpen: true, resolution: null },
      { providerId: "p1", isOpen: false, resolution: "REFUNDED_TO_CLIENT" as const },
      { providerId: "p1", isOpen: false, resolution: "REFUNDED_TO_CLIENT" as const },
    ];
    expect(countDisputes(rows, "p1")).toEqual({ total: 3, open: 1, lost: 2 });
  });
});

describe("rating flag", () => {
  it("does not flag at 3.5, below 3.5 with too few completed jobs, or when either figure is missing", () => {
    expect(flagsRating(RATING_BELOW, RATING_MIN_COMPLETED_JOBS)).toBe(false);
    expect(flagsRating(RATING_BELOW - 0.1, RATING_MIN_COMPLETED_JOBS - 1)).toBe(false);
    expect(flagsRating(1, 0)).toBe(false);
    expect(flagsRating(null, 10)).toBe(false);
    expect(flagsRating(1, null)).toBe(false);
  });

  it("flags an average below 3.5 once the provider has enough completed jobs", () => {
    expect(flagsRating(RATING_BELOW - 0.01, RATING_MIN_COMPLETED_JOBS)).toBe(true);
    expect(flagsRating(1, RATING_MIN_COMPLETED_JOBS + 1)).toBe(true);
  });
});

describe("certificate flag", () => {
  it("does not flag a certificate expiring after the window, one with no date, or an empty list", () => {
    expect(flagsCertificate([cert(plusDays(TODAY, CERTIFICATE_EXPIRY_WITHIN_DAYS + 1))], TODAY)).toBe(false);
    expect(flagsCertificate([cert(null)], TODAY)).toBe(false);
    expect(flagsCertificate([], TODAY)).toBe(false);
  });

  it("flags a certificate on the 30-day boundary, inside the window, or already expired", () => {
    expect(flagsCertificate([cert(plusDays(TODAY, CERTIFICATE_EXPIRY_WITHIN_DAYS))], TODAY)).toBe(true);
    expect(flagsCertificate([cert(plusDays(TODAY, 1))], TODAY)).toBe(true);
    expect(flagsCertificate([cert(plusDays(TODAY, -1))], TODAY)).toBe(true);
    expect(flagsCertificate([cert(plusDays(TODAY, 0), "expired")], TODAY)).toBe(true);
    expect(flagsCertificate([cert(plusDays(TODAY, 90)), cert(plusDays(TODAY, 10))], TODAY)).toBe(true);
  });
});

describe("rejected-verification flag", () => {
  it("does not flag one rejection or a missing count", () => {
    expect(flagsRejections(REJECTED_VERIFICATIONS_MIN - 1)).toBe(false);
    expect(flagsRejections(0)).toBe(false);
    expect(flagsRejections(null)).toBe(false);
  });

  it("flags at two rejections and above", () => {
    expect(flagsRejections(REJECTED_VERIFICATIONS_MIN)).toBe(true);
    expect(flagsRejections(REJECTED_VERIFICATIONS_MIN + 1)).toBe(true);
  });
});

describe("suspension flag", () => {
  it("flags only a current suspension", () => {
    expect(flagsSuspension(false)).toBe(false);
    expect(flagsSuspension(null)).toBe(false);
    expect(flagsSuspension(true)).toBe(true);
  });
});

describe("past suspensions", () => {
  it("flags one suspension on record and shows the latest in Manila's day", () => {
    const report = screenProvider(input({
      pastSuspensions: { count: 1, latestAt: "2026-10-04T17:30:00Z", latestReason: "No-show twice" },
    }));
    expect(report.summary).toBe("1 thing to check");
    expect(row(report, "Past suspensions").flagged).toBe(true);
    expect(row(report, "Past suspensions").value).toBe("1 time (latest Oct 5, 2026 — No-show twice)");
  });

  it("shows None for a clean record and Not available when the audit log could not be read", () => {
    expect(row(screenProvider(input({ pastSuspensions: { count: 0, latestAt: null, latestReason: null } })), "Past suspensions"))
      .toEqual({ label: "Past suspensions", value: "None", flagged: false });
    expect(row(screenProvider(input({ pastSuspensions: null })), "Past suspensions").value).toBe("Not available");
  });

  it("says how many times", () => {
    const report = screenProvider(input({ pastSuspensions: { count: 3, latestAt: "2026-10-04T01:00:00Z", latestReason: null } }));
    expect(row(report, "Past suspensions").value).toBe("3 times (latest Oct 4, 2026)");
  });
});

describe("screenProvider", () => {
  it("reports no concerns and shows the soonest expiry when every rule is clear", () => {
    const report = screenProvider(input());
    expect(report.summary).toBe("No concerns found");
    expect(report.concerns).toBe(0);
    expect(row(report, "Joined").value).toBe("Mar 10, 2024");
    expect(row(report, "Jobs completed").value).toBe("10");
    expect(row(report, "Jobs cancelled").value).toBe("1");
    expect(row(report, "Cancellation rate").value).toBe("10% (1/10)");
    expect(row(report, "Certificate expiry").value).toContain("days left");
    expect(row(report, "Past suspensions").value).toBe("Not available");
    expect(row(report, "Past suspensions").flagged).toBe(false);
    expect(row(report, "Current suspension").value).toBe("Not suspended");
  });

  it("counts each firing rule once and shows the soonest certificate date", () => {
    const soon = plusDays(TODAY, 10);
    const later = plusDays(TODAY, 80);
    const report = screenProvider(input({
      user: { ...user, rating: 3.2, jobsCompleted: 4, suspended: true, suspendedUntil: "Dec 1, 2026", suspensionReason: "No-shows" },
      assignedJobs: 4,
      cancelledJobs: 2,
      disputes: { total: 3, open: 1, lost: 2 },
      certificates: [cert(later), cert(soon)],
      rejectedVerifications: 2,
    }));
    expect(report.summary).toBe("6 things to check");
    expect(row(report, "Cancellation rate").flagged).toBe(true);
    expect(row(report, "Cancellation rate").value).toBe("50% (2/4)");
    expect(row(report, "Open disputes").flagged).toBe(true);
    expect(row(report, "Disputes lost").flagged).toBe(true);
    expect(row(report, "Average rating").flagged).toBe(true);
    expect(row(report, "Average rating").value).toBe("3.2");
    expect(row(report, "Certificate expiry").flagged).toBe(true);
    expect(row(report, "Certificate expiry").value).toContain("Nov 21, 2026");
    expect(row(report, "Certificate expiry").value).not.toContain("Jan");
    expect(row(report, "Past rejected verifications").flagged).toBe(true);
    expect(row(report, "Current suspension").value).toBe("Until Dec 1, 2026 — No-shows");
    expect(row(report, "Current suspension").flagged).toBe(true);
  });

  it("says one thing to check for a single rule", () => {
    const report = screenProvider(input({ disputes: { total: 1, open: 1, lost: 0 } }));
    expect(report.summary).toBe("1 thing to check");
    expect(report.concerns).toBe(1);
  });

  it("says Not available when the lists and the user row are missing, and does not flag them", () => {
    const report = screenProvider(input({
      user: null,
      assignedJobs: null,
      cancelledJobs: null,
      disputes: null,
      certificates: null,
      rejectedVerifications: null,
    }));
    expect(report.summary).toBe("No concerns found");
    for (const item of report.rows) {
      expect(item.value).toBe("Not available");
      expect(item.flagged).toBe(false);
    }
  });

  it("shows an unrated provider and a zero denominator without flagging", () => {
    const report = screenProvider(input({
      user: { ...user, rating: null, jobsCompleted: 0 },
      assignedJobs: 0,
      cancelledJobs: 0,
      certificates: [],
    }));
    expect(row(report, "Average rating").value).toBe("Not yet rated");
    expect(row(report, "Average rating").flagged).toBe(false);
    expect(row(report, "Cancellation rate").value).toBe("Not available");
    expect(row(report, "Jobs cancelled").value).toBe("0");
    expect(row(report, "Certificate expiry").value).toBe("None");
  });
});

describe("screening mappings", () => {
  it("keeps the provider id on a booking row", () => {
    expect(toScreeningBooking({ provider: { id: "p1" }, status: "cancelled" })).toEqual({ providerId: "p1", status: "cancelled" });
    expect(toScreeningBooking({ provider: null, status: "open" })).toEqual({ providerId: null, status: "open" });
    expect(countProviderBookings([
      { providerId: "p1", status: "cancelled" },
      { providerId: "p1", status: "completed" },
      { providerId: "p1", status: "expired" },
      { providerId: null, status: "cancelled" },
      { providerId: "p2", status: "cancelled" },
    ], "p1")).toEqual({ assigned: 3, cancelled: 1 });
  });

  it("keeps expires_on for approved and expired certificates", () => {
    expect(toScreeningCertificate({ provider_id: "p1", status: "approved", expires_on: "2027-01-01" })).toEqual({
      providerId: "p1", status: "approved", expiresOn: "2027-01-01",
    });
    expect(toScreeningCertificate({ provider_id: "p1", status: "expired", expires_on: "2020-01-01" })?.status).toBe("expired");
    expect(toScreeningCertificate({ provider_id: "p1", status: "rejected", expires_on: "2027-01-01" })).toBeNull();
  });
});
