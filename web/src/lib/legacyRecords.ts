import type { Transaction, WalletTransaction } from "@/lib/domain";

/**
 * The Xendit switch. Wallet-era records were written before this date and are
 * test data, so the money lists hide them. Read as a UTC calendar day
 * (2026-10-16T00:00:00Z), not the Philippine local day: a row at
 * 2026-10-15T23:59Z is hidden, and one at 2026-10-16T00:00Z is kept.
 */
export const LEGACY_CUTOFF = "2026-10-16";

const LEGACY_CUTOFF_MS = Date.parse(`${LEGACY_CUTOFF}T00:00:00Z`);

/** review_note prefix of a queued or in-flight provider payout (backend escrow.service, migration 0058). */
const XENDIT_QUEUED_NOTE = "Sending via Xendit";
/** Prefix finishPayout writes on a refused Xendit payout. */
const XENDIT_FAILURE_PREFIX = "Xendit:";
/** Substring of the Xendit payout id written on a completed payout ("XENDIT-<id>"). */
const XENDIT_REFERENCE_MARK = "XENDIT-";
/** Title of the retired prototype wallet's rows. */
const PROTOTYPE_WALLET_RETIRED_TITLE = "Prototype wallet retired";

/**
 * True when a withdrawal's review_note shows Xendit handled it: a queued or
 * in-flight payout, a completed payout's XENDIT- id, or a refused payout's "Xendit:"
 * reason. Simulated 'SIM-…' notes carry no marker, so they count as no marker.
 */
export function hasXenditMarker(reviewNote: string | null | undefined): boolean {
  const note = (reviewNote ?? "").trim();
  return note.startsWith(XENDIT_QUEUED_NOTE) || note.includes(XENDIT_REFERENCE_MARK) || note.startsWith(XENDIT_FAILURE_PREFIX);
}

/** Wallet/payment record rows from the wallet era: hidden from the Payment records tab. */
export function isLegacyWalletRow(
  row: Pick<WalletTransaction, "kind" | "title" | "createdAt"> & { reviewNote?: string | null },
): boolean {
  const createdMs = Date.parse(row.createdAt);
  if (!Number.isNaN(createdMs) && createdMs < LEGACY_CUTOFF_MS) return true;
  if (row.title === PROTOTYPE_WALLET_RETIRED_TITLE) return true;
  // Admin-issued recovery credits (Issue Credit) are wallet-era records.
  if (row.kind === "recovery_credit") return true;
  // A withdrawal with no Xendit marker is a pre-Xendit payout, or a simulated 'SIM-' refund sweep.
  if (row.kind === "withdrawal" && !hasXenditMarker(row.reviewNote)) return true;
  return false;
}

/**
 * Escrow rows funded by card (the old Stripe flow): hidden from the Escrow tab.
 * Wallet-funded escrows are kept whatever their date; the owner asked for
 * card jobs only, and a date rule here would also hide live wallet escrows.
 */
export function isLegacyEscrowRow(row: Pick<Transaction, "fundingMethod">): boolean {
  return row.fundingMethod === "card";
}
