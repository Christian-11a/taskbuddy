import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUS_DISPLAY,
  DISPUTE_STATUS_DISPLAY,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  initials,
  isCancellableBooking,
  toBookingRow,
  toDisputeRow,
  toTransactionRow,
  toUserRow,
  toVerificationRow,
  toWalletTxnRow,
} from "./index";
import type { AdminBooking, AdminUser, Dispute, Transaction, Verification, WalletTransaction } from "@/lib/domain";

describe("initials", () => {
  it("takes first and last name initials", () => {
    expect(initials("Morgan Lee")).toBe("ML");
    expect(initials("Jamie de la Cruz")).toBe("JC");
  });
  it("handles single names and empty input", () => {
    expect(initials("Cher")).toBe("CH");
    expect(initials("  ")).toBe("?");
  });
});

describe("formatCurrency", () => {
  it("formats pesos with thousands separators", () => {
    expect(formatCurrency(1200)).toBe("₱1,200");
    expect(formatCurrency(184200)).toBe("₱184,200");
  });
  it("compacts large figures", () => {
    expect(formatCurrencyCompact(2_400_000)).toBe("₱2.4M");
    expect(formatCurrencyCompact(184_200)).toBe("₱184.2K");
    expect(formatCurrencyCompact(980)).toBe("₱980");
  });
});

describe("formatDate", () => {
  it("renders ISO dates without timezone drift", () => {
    expect(formatDate("2026-04-10")).toBe("Apr 10, 2026");
    expect(formatDate("2024-03-01")).toBe("Mar 1, 2024");
  });
  it("passes through malformed input", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("booking status mapping", () => {
  it("maps every real job_status to a distinct label", () => {
    expect(BOOKING_STATUS_DISPLAY.open.label).toBe("Open");
    expect(BOOKING_STATUS_DISPLAY.recommending.label).toBe("Matching");
    expect(BOOKING_STATUS_DISPLAY.assigned.label).toBe("Assigned");
    expect(BOOKING_STATUS_DISPLAY.in_progress.label).toBe("In Progress");
    expect(BOOKING_STATUS_DISPLAY.completed.label).toBe("Completed");
    expect(BOOKING_STATUS_DISPLAY.cancelled.label).toBe("Cancelled");
    expect(BOOKING_STATUS_DISPLAY.expired.label).toBe("Expired");
  });
  it("only allows cancelling bookings still in flight", () => {
    expect(isCancellableBooking("open")).toBe(true);
    expect(isCancellableBooking("recommending")).toBe(true);
    expect(isCancellableBooking("assigned")).toBe(true);
    expect(isCancellableBooking("in_progress")).toBe(true);
    expect(isCancellableBooking("completed")).toBe(false);
    expect(isCancellableBooking("cancelled")).toBe(false);
    expect(isCancellableBooking("expired")).toBe(false);
  });
});

describe("row adapters", () => {
  it("maps a provider user to a display row", () => {
    const u: AdminUser = {
      id: "u-001", email: "morgan@example.com", role: "provider",
      createdAt: "2024-03-10", name: "Morgan Lee", status: "ACTIVE",
      jobsCompleted: 21, rating: 4.9,
      phone: "0917 555 0101", city: "Quezon City", categoryName: "Plumbing",
      suspendedUntil: null, suspensionReason: null,
    };
    const row = toUserRow(u);
    expect(row).toMatchObject({
      id: "u-001", initials: "ML", role: "🔧 Provider", isProvider: true,
      status: "Active", statusClass: "badge-active",
      joined: "Mar 10, 2024", activity: "21 jobs ⭐4.9",
    });
    // Export/logic consumers use the plain variants — no emoji, raw number.
    expect(row.rolePlain).toBe("Provider");
    expect(row.ratingValue).toBe(4.9);
  });

  it("gives admins a plain role label that logic can compare against", () => {
    const u: AdminUser = {
      id: "u-003", email: "admin@taskbuddy.com", role: "admin",
      createdAt: "2024-01-01", name: "Task Admin", status: "ACTIVE",
      jobsCompleted: 0, rating: null, phone: null, city: null, categoryName: null,
      suspendedUntil: null, suspensionReason: null,
    };
    const row = toUserRow(u);
    expect(row.rolePlain).toBe("Admin");
    expect(row.ratingValue).toBeNull();
  });

  it("maps a suspended client without rating", () => {
    const u: AdminUser = {
      id: "u-002", email: "j.kim@example.com", role: "client",
      createdAt: "2024-02-22", name: "Jamie Kim", status: "SUSPENDED",
      jobsCompleted: 0, rating: null,
      phone: null, city: null, categoryName: null,
      suspendedUntil: null, suspensionReason: null,
    };
    const row = toUserRow(u);
    expect(row.role).toBe("👤 Homeowner");
    expect(row.activity).toBe("0 jobs");
    expect(row.statusClass).toBe("badge-suspended");
    // Detail fields fall back to a dash rather than rendering "null".
    expect(row.phone).toBe("—");
    expect(row.city).toBe("—");
    expect(row.category).toBe("—");
    expect(row.rating).toBe("Not yet rated");
  });

  it("maps verification documents to labeled signed URLs, in ID/selfie order", () => {
    const v: Verification = {
      id: "vr-001", providerId: "u-001", name: "Morgan Lee",
      email: "morgan@example.com", submittedAt: "2026-05-02",
      status: "PENDING", documents: ["https://example.com/id.jpg", "https://example.com/selfie.jpg"],
    };
    const row = toVerificationRow(v);
    expect(row.status).toBe("pending");
    expect(row.documents).toEqual([
      { label: "Government ID", url: "https://example.com/id.jpg" },
      { label: "Selfie", url: "https://example.com/selfie.jpg" },
    ]);
    expect(row.date).toBe("May 2, 2026");
  });

  it("handles a verification with a dropped document (failed signed URL)", () => {
    const v: Verification = {
      id: "vr-002", providerId: "u-002", name: "Pat Morgan",
      email: "pat@example.com", submittedAt: "2026-05-03",
      status: "PENDING", documents: ["https://example.com/id.jpg"],
    };
    expect(toVerificationRow(v).documents).toEqual([{ label: "Government ID", url: "https://example.com/id.jpg" }]);
  });

  it("maps transactions with both display and numeric amounts", () => {
    const t: Transaction = {
      id: "TXN-002", jobId: "job-002", customerName: "Jamie Kim", providerName: "Pat Morgan",
      service: "Plumbing", amount: 850, status: "IN_ESCROW", date: "2026-04-12",
    };
    const row = toTransactionRow(t);
    expect(row.amount).toBe("₱850");
    expect(row.amountValue).toBe(850);
    expect(row.status).toBe("In Escrow");
    expect(row.statusClass).toBe("badge-processing");
  });

  it("maps an open dispute to a display row", () => {
    const d: Dispute = {
      id: "DSP-001", jobId: "job-003", jobTitle: "Fix kitchen sink", service: "Plumbing",
      clientName: "Jamie Kim", providerName: "Pat Morgan", amount: 500,
      reason: "Job not completed", details: "Provider never showed up.",
      status: "OPEN", resolution: null, resolutionNote: null,
      createdAt: "2026-05-01", resolvedAt: null,
    };
    const row = toDisputeRow(d);
    expect(row.status).toBe(DISPUTE_STATUS_DISPLAY.OPEN.label);
    expect(row.statusClass).toBe(DISPUTE_STATUS_DISPLAY.OPEN.badgeClass);
    expect(row.isOpen).toBe(true);
    expect(row.resolution).toBeNull();
    expect(row.amount).toBe("₱500");
  });

  it("maps a resolved dispute with its resolution", () => {
    const d: Dispute = {
      id: "DSP-002", jobId: "job-004", jobTitle: "Deep clean", service: "Cleaning",
      clientName: "Jamie Kim", providerName: "Pat Morgan", amount: 1200,
      reason: "Poor quality", details: null,
      status: "RESOLVED", resolution: "REFUNDED_TO_CLIENT", resolutionNote: "Verified with photos.",
      createdAt: "2026-05-01", resolvedAt: "2026-05-03",
    };
    const row = toDisputeRow(d);
    expect(row.isOpen).toBe(false);
    expect(row.resolution).toBe("Refunded to homeowner");
    expect(row.resolvedAt).toBe("May 3, 2026");
  });

  it("maps a wallet top-up with a + sign", () => {
    const t: WalletTransaction = {
      id: "wt-1", profileName: "Eduard", direction: "credit", kind: "topup",
      status: "completed", amount: 1000, title: "Stripe Checkout top-up",
      createdAt: "2026-08-09",
    };
    const row = toWalletTxnRow(t);
    expect(row.amount).toBe("+₱1,000");
    expect(row.kindLabel).toBe("Top-up");
  });

  it("maps a wallet withdrawal with a - sign", () => {
    const t: WalletTransaction = {
      id: "wt-2", profileName: "Jamie Kim", direction: "debit", kind: "withdrawal",
      status: "completed", amount: 250, title: "Cash out",
      createdAt: "2026-08-09",
    };
    const row = toWalletTxnRow(t);
    expect(row.amount).toBe("-₱250");
    expect(row.kindLabel).toBe("Withdrawal");
  });

  it("maps bookings with cancellability", () => {
    const b: AdminBooking = {
      id: "BK-0090", customerName: "Jamie Kim", providerName: "Pat Morgan",
      service: "Plumbing Repair", status: "assigned",
      scheduledDate: "2026-04-12", amount: 0,
    };
    const row = toBookingRow(b);
    expect(row.status).toBe("Assigned");
    expect(row.cancellable).toBe(true);
    expect(toBookingRow({ ...b, status: "completed" }).cancellable).toBe(false);
  });
});
