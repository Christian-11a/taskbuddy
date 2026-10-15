import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUS_DISPLAY,
  DISPUTE_STATUS_DISPLAY,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatRating,
  initials,
  ratingForCsv,
  roundRating,
  isCancellableBooking,
  toBookingRow,
  toDisputeRow,
  toTransactionRow,
  toUserRow,
  toVerificationRow,
  toWalletTxnRow,
  verificationMethodLabel,
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
    expect(formatCurrency(1820.5)).toBe("₱1,820.50");
    expect(formatCurrency(99.999)).toBe("₱100");
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
    expect(BOOKING_STATUS_DISPLAY.assigned.label).toBe("Awaiting Provider");
    expect(BOOKING_STATUS_DISPLAY.confirmed.label).toBe("Confirmed");
    expect(BOOKING_STATUS_DISPLAY.in_progress.label).toBe("In Progress");
    expect(BOOKING_STATUS_DISPLAY.completed.label).toBe("Completed");
    expect(BOOKING_STATUS_DISPLAY.cancelled.label).toBe("Cancelled");
    expect(BOOKING_STATUS_DISPLAY.expired.label).toBe("Expired");
  });
  it("only allows cancelling bookings still in flight", () => {
    expect(isCancellableBooking("open")).toBe(true);
    expect(isCancellableBooking("recommending")).toBe(true);
    expect(isCancellableBooking("assigned")).toBe(true);
    expect(isCancellableBooking("confirmed")).toBe(true);
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
      id: "u-001", initials: "ML", role: "Provider", isProvider: true,
      status: "Active", statusClass: "badge-active",
      joined: "Mar 10, 2024", activity: "21 jobs · 4.9 rating",
    });
    // Export/logic consumers use the plain variant — same text, raw number.
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

  it("labels a provider's verification state and leaves clients out of it", () => {
    const base: AdminUser = {
      id: "u-010", email: "p@example.com", role: "provider",
      createdAt: "2026-09-01", name: "Pat Provider", status: "ACTIVE",
      jobsCompleted: 0, rating: null, phone: null, city: null, categoryName: null,
      suspendedUntil: null, suspensionReason: null,
    };
    expect(toUserRow({ ...base, verification: "PENDING" })).toMatchObject({
      verification: "Pending review",
      verificationClass: "badge-pending",
    });
    expect(toUserRow({ ...base, verification: "VERIFIED" }).verification).toBe("Verified");
    expect(toUserRow({ ...base, role: "client", verification: null }).verification).toBe("—");
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
    expect(row.role).toBe("Client");
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
      status: "PENDING", documents: ["https://example.com/id.jpg", "https://example.com/selfie.jpg"], method: "manual",
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
      status: "PENDING", documents: ["https://example.com/id.jpg"], method: "manual",
    };
    expect(toVerificationRow(v).documents).toEqual([{ label: "Government ID", url: "https://example.com/id.jpg" }]);
  });

  it("maps transactions with both display and numeric amounts", () => {
    const t: Transaction = {
      id: "TXN-002", jobId: "job-002", customerName: "Jamie Kim", providerName: "Pat Morgan",
      service: "Plumbing", amount: 850, status: "IN_ESCROW", date: "2026-04-12",
      fundingMethod: "wallet", transferStatus: "none", stripeTransferId: null, transferError: null,
    };
    const row = toTransactionRow(t);
    expect(row.amount).toBe("₱850");
    expect(row.amountValue).toBe(850);
    expect(row.status).toBe("In Escrow");
    expect(row.statusClass).toBe("badge-processing");
    expect(row.funding).toBe("Wallet");
    // Nothing has been paid out yet, so there is nothing to say about it.
    expect(row.payout).toBe("");
    expect(row.canRetryTransfer).toBe(false);
  });

  it("shows where a card-funded payout went, and when an admin can retry it", () => {
    const base: Transaction = {
      id: "TXN-003", jobId: "job-003", customerName: "Jamie Kim", providerName: "Pat Morgan",
      service: "Plumbing", amount: 1500, status: "COMPLETED", date: "2026-09-16",
      fundingMethod: "card", transferStatus: "transferred", stripeTransferId: "tr_1", transferError: null,
    };
    const sent = toTransactionRow(base);
    expect(sent.funding).toBe("Card");
    expect(sent.payout).toBe("Sent to Stripe");
    expect(sent.payoutDetail).toBe("tr_1");
    expect(sent.canRetryTransfer).toBe(false);

    const failed = toTransactionRow({
      ...base, transferStatus: "failed", stripeTransferId: null, transferError: "Account is restricted",
    });
    expect(failed.payout).toBe("Transfer failed");
    expect(failed.payoutDetail).toBe("Account is restricted");
    expect(failed.canRetryTransfer).toBe(true);

    // A released wallet-funded payout is a wallet credit, not a failure.
    const wallet = toTransactionRow({ ...base, fundingMethod: "wallet", transferStatus: "none" });
    expect(wallet.payout).toBe("Wallet");
    expect(wallet.canRetryTransfer).toBe(false);
  });

  it("maps an open dispute to a display row", () => {
    const d: Dispute = {
      id: "DSP-001", jobId: "job-003", jobTitle: "Fix kitchen sink", service: "Plumbing",
      clientName: "Jamie Kim", providerName: "Pat Morgan", amount: 500,
      reason: "Job not completed", details: "Provider never showed up.",
      status: "OPEN", resolution: null, resolutionNote: null, paymentSettled: false,
      createdAt: "2026-05-01", resolvedAt: null, cancellationState: null, cancellationDeadline: null,
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
      status: "RESOLVED", resolution: "REFUNDED_TO_CLIENT", resolutionNote: "Verified with photos.", paymentSettled: true,
      createdAt: "2026-05-01", resolvedAt: "2026-05-03", cancellationState: null, cancellationDeadline: null,
    };
    const row = toDisputeRow(d);
    expect(row.isOpen).toBe(false);
    expect(row.resolution).toBe("Refunded to client");
    expect(row.resolvedAt).toBe("May 3, 2026");
  });

  it("shows an unknown amount rather than a peso figure when the payment amount is unknown", () => {
    const d: Dispute = {
      id: "DSP-003", jobId: "job-005", jobTitle: "Re-tile bathroom", service: "Renovation",
      clientName: "Jamie Kim", providerName: "Pat Morgan", amount: Number.NaN, hasPayment: true,
      reason: "Poor quality", details: null,
      status: "OPEN", resolution: null, resolutionNote: null, paymentSettled: false,
      createdAt: "2026-05-01", resolvedAt: null, cancellationState: null, cancellationDeadline: null,
    };
    expect(toDisputeRow(d).amount).toBe("Unknown");
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
    expect(row.status).toBe("Awaiting Provider");
    expect(row.cancellable).toBe(true);
    expect(toBookingRow({ ...b, status: "completed" }).cancellable).toBe(false);
  });
});

describe("cancellation, warranty and verification method in adapters", () => {
  it("keeps the cancellation state and deadline on a dispute row", () => {
    const d: Dispute = {
      id: "DSP-010", jobId: "job-010", jobTitle: "Paint fence", service: "Painting",
      clientName: "Ana", providerName: "Rico", amount: 300,
      reason: "Cancelled late", details: null,
      status: "OPEN", resolution: null, resolutionNote: null, paymentSettled: false,
      createdAt: "2026-10-14", resolvedAt: null,
      cancellationState: "pending", cancellationDeadline: "2026-10-16T00:00:00Z",
    };
    const row = toDisputeRow(d);
    expect(row.cancellationState).toBe("pending");
    expect(row.cancellationDeadline).toBe("2026-10-16T00:00:00Z");
  });

  it("exposes the verification method on a verification row", () => {
    const v: Verification = {
      id: "v-1", providerId: "p-1", name: "Lia Cruz", email: "lia@test.com",
      submittedAt: "2026-10-10", status: "PENDING", documents: [], documentType: null,
      method: "stripe_identity",
    };
    expect(toVerificationRow(v).method).toBe("stripe_identity");
  });

  it("labels each verification method for display", () => {
    expect(verificationMethodLabel("manual")).toBe("ID + selfie review");
    expect(verificationMethodLabel("stripe_identity")).toBe("Stripe Identity");
  });
});

describe("rating formatting", () => {
  it("rounds to at most two decimals without trailing zeros", () => {
    expect(formatRating(4.0833)).toBe("4.08");
    expect(formatRating(4.9)).toBe("4.9");
    expect(formatRating(5)).toBe("5");
    expect(roundRating(4.0833)).toBe(4.08);
    expect(roundRating(4.999)).toBe(5);
  });

  it("shows an em dash when there is no rating (null, undefined, or 0)", () => {
    expect(formatRating(null)).toBe("—");
    expect(formatRating(undefined)).toBe("—");
    expect(formatRating(0)).toBe("—");
    expect(formatRating(Number.NaN)).toBe("—");
  });

  it("gives CSV a rounded number, and blank for unrated", () => {
    expect(ratingForCsv(4.0833)).toBe(4.08);
    expect(ratingForCsv(0)).toBe("");
    expect(ratingForCsv(null)).toBe("");
  });

  it("rounds the activity and rating text of user rows", () => {
    const u: AdminUser = {
      id: "u-010", email: "pat@example.com", role: "provider",
      createdAt: "2024-03-10", name: "Pat Cruz", status: "ACTIVE",
      jobsCompleted: 12, rating: 4.08333,
      phone: null, city: null, categoryName: null,
      suspendedUntil: null, suspensionReason: null,
    };
    const row = toUserRow(u);
    expect(row.activity).toBe("12 jobs · 4.08 rating");
    expect(row.rating).toBe("4.08 rating");
    expect(row.ratingValue).toBe(4.08);
  });
});
