import { describe, expect, it } from "vitest";
import { LEGACY_CUTOFF, hasXenditMarker, isLegacyEscrowRow, isLegacyWalletRow } from "./legacyRecords";
import type { WalletTransaction } from "@/lib/domain";

const after = "2026-10-20T10:00:00.000Z";

const wallet = (over: Partial<WalletTransaction> & { reviewNote?: string | null } = {}) => ({
  id: "w",
  profileName: "Test",
  direction: "debit" as const,
  kind: "topup" as const,
  status: "completed" as const,
  amount: 100,
  title: "Client payment",
  createdAt: after,
  ...over,
});

describe("LEGACY_CUTOFF", () => {
  it("is the Xendit switch date", () => {
    expect(LEGACY_CUTOFF).toBe("2026-10-16");
  });
});

describe("hasXenditMarker", () => {
  it.each([
    ["Sending via Xendit", true],
    ["XENDIT-9f2a", true],
    ["Xendit: Account number invalid", true],
    ["  Xendit: padded  ", true],
    ["SIM-AB12CD34EF", false],
    ["Ref 8812 3301", false],
    ["sending via xendit", false],
    [null, false],
  ])("review_note %j -> %s", (note, expected) => {
    expect(hasXenditMarker(note)).toBe(expected);
  });
});

describe("isLegacyWalletRow", () => {
  it("keeps a post-cutoff row with no legacy marker", () => {
    expect(isLegacyWalletRow(wallet())).toBe(false);
  });

  it("hides rows created before the cutoff, judged in UTC", () => {
    expect(isLegacyWalletRow(wallet({ createdAt: "2026-10-15T23:59:00Z" }))).toBe(true);
    expect(isLegacyWalletRow(wallet({ createdAt: "2026-10-16T00:00:00Z" }))).toBe(false);
    // Philippine midnight of 16 Oct is 15 Oct 16:00Z, so it is still hidden.
    expect(isLegacyWalletRow(wallet({ createdAt: "2026-10-15T16:00:00Z" }))).toBe(true);
  });

  it("hides the retired prototype wallet title", () => {
    expect(isLegacyWalletRow(wallet({ title: "Prototype wallet retired" }))).toBe(true);
  });

  it("hides recovery credits", () => {
    expect(isLegacyWalletRow(wallet({ kind: "recovery_credit", title: "Dispute credit" }))).toBe(true);
  });

  it("hides a withdrawal with no Xendit marker, including a simulated SIM reference", () => {
    expect(isLegacyWalletRow(wallet({ kind: "withdrawal", reviewNote: null }))).toBe(true);
    expect(isLegacyWalletRow(wallet({ kind: "withdrawal", reviewNote: "SIM-AB12CD34EF" }))).toBe(true);
  });

  it.each(["Sending via Xendit", "XENDIT-abc", "Xendit: refused"])("keeps a withdrawal with the marker %j", (note) => {
    expect(isLegacyWalletRow(wallet({ kind: "withdrawal", reviewNote: note }))).toBe(false);
  });

  it("does not read the marker on non-withdrawal kinds", () => {
    expect(isLegacyWalletRow(wallet({ kind: "payout", reviewNote: null }))).toBe(false);
    expect(isLegacyWalletRow(wallet({ kind: "refund", reviewNote: null }))).toBe(false);
  });
});

describe("isLegacyEscrowRow", () => {
  it("hides card-funded escrow rows", () => {
    expect(isLegacyEscrowRow({ fundingMethod: "card" })).toBe(true);
  });

  it("keeps wallet-funded escrow rows", () => {
    expect(isLegacyEscrowRow({ fundingMethod: "wallet" })).toBe(false);
  });
});
