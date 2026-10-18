// ─── Adapters: domain → display ───────────────────────────────────────────────
// Pure functions that turn backend-shaped domain data into the exact display
// shapes the components render (formatted currency, badge classes, initials…).
// Keeping this mapping in one place means components never change when the
// data source flips from mock to the real API.

import { isTestModeRefund } from "@/lib/legacyRecords";
import type {
  AdminBooking,
  AdminUser,
  BookingStatus,
  Dispute,
  DisputeResolution,
  DisputeStatus,
  Transaction,
  TransactionStatus,
  UserStatus,
  Verification,
  WalletTransaction,
  WalletTxnKind,
  WalletTxnStatus,
  TransferStatus,
} from "@/lib/domain";

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** "Morgan Lee" → "ML"; single names use the first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** 1200 → "₱1,200"; 1820.5 → "₱1,820.50" (centavos always get two digits). */
export function formatCurrency(amount: number): string {
  const fractional = Math.round(amount * 100) % 100 !== 0;
  return `₱${amount.toLocaleString("en-PH", fractional ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 })}`;
}

/** 2400000 → "₱2.4M", 184200 → "₱184.2K" (dashboard-style compact figures). */
export function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000) return `₱${(amount / 1_000_000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}M`;
  if (amount >= 100_000) return `₱${(amount / 1_000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}K`;
  return formatCurrency(amount);
}

/** 4.08333 → 4.08. Ratings are averages, so they are rounded for display and export. */
export function roundRating(rating: number): number {
  return Math.round(rating * 100) / 100;
}

/** 4.08333 → "4.08", 4.9 → "4.9", and "—" for unrated (null, undefined, or 0). */
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || !Number.isFinite(rating) || rating <= 0) return "—";
  return String(roundRating(rating));
}

/** Rounded rating for a CSV cell; blank for unrated so the column stays numeric. */
export function ratingForCsv(rating: number | null | undefined): number | "" {
  if (rating === null || rating === undefined || !Number.isFinite(rating) || rating <= 0) return "";
  return roundRating(rating);
}

/** ISO "2026-04-10" → "Apr 10, 2026". Parsed as local date to avoid TZ drift. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Status → display maps ────────────────────────────────────────────────────

export const USER_STATUS_DISPLAY: Record<UserStatus, { label: string; badgeClass: string }> = {
  ACTIVE:    { label: "Active",    badgeClass: "badge-active" },
  SUSPENDED: { label: "Suspended", badgeClass: "badge-suspended" },
  DELETED:   { label: "Deleted",   badgeClass: "badge-banned" },
};

export const TRANSACTION_STATUS_DISPLAY: Record<TransactionStatus, { label: string; badgeClass: string }> = {
  COMPLETED: { label: "Completed", badgeClass: "badge-completed" },
  IN_ESCROW: { label: "In Escrow", badgeClass: "badge-processing" },
  DISPUTED:  { label: "Disputed",  badgeClass: "badge-rejected" },
  REFUNDED:  { label: "Refunded",  badgeClass: "badge-refunded" },
};

/** Mirrors the real `job_status` enum — each status gets its own label so
 *  the admin view reflects the real lifecycle, not a re-collapsed one. */
export const BOOKING_STATUS_DISPLAY: Record<BookingStatus, { label: string; badgeClass: string }> = {
  open:         { label: "Open",        badgeClass: "badge-pending" },
  recommending: { label: "Matching",    badgeClass: "badge-processing" },
  assigned:     { label: "Awaiting Provider", badgeClass: "badge-pending" },
  confirmed:    { label: "Confirmed",   badgeClass: "badge-active" },
  in_progress:  { label: "In Progress", badgeClass: "badge-active" },
  completed:    { label: "Completed",   badgeClass: "badge-completed" },
  cancelled:    { label: "Cancelled",   badgeClass: "badge-cancelled" },
  expired:      { label: "Expired",     badgeClass: "badge-rejected" },
};

/** A job with an open complaint. Same danger badge as a disputed escrow on the Transactions page. */
const DISPUTED_BOOKING_DISPLAY = { label: "Disputed", badgeClass: "badge-rejected" };

/** Bookings an admin can still cancel — anything not yet in a terminal state. */
export function isCancellableBooking(status: BookingStatus): boolean {
  return (
    status === "open" ||
    status === "recommending" ||
    status === "assigned" ||
    status === "confirmed" ||
    status === "in_progress"
  );
}

export const DISPUTE_STATUS_DISPLAY: Record<DisputeStatus, { label: string; badgeClass: string }> = {
  OPEN:      { label: "Open",     badgeClass: "badge-pending" },
  RESOLVED:  { label: "Resolved", badgeClass: "badge-completed" },
  CANCELLED: { label: "Cancelled", badgeClass: "badge-cancelled" },
};

export const DISPUTE_RESOLUTION_LABEL: Record<DisputeResolution, string> = {
  RELEASED_TO_PROVIDER: "Released to provider",
  REFUNDED_TO_CLIENT: "Refunded to client",
  REVIEWED: "Reviewed by admin",
};

export const WALLET_KIND_DISPLAY: Record<WalletTxnKind, { label: string; badgeClass: string }> = {
  topup:        { label: "Client payment",       badgeClass: "badge-completed" },
  withdrawal:   { label: "Payout to provider",   badgeClass: "badge-processing" },
  escrow_hold:  { label: "Payment held",         badgeClass: "badge-pending" },
  payout:       { label: "Earnings credited",    badgeClass: "badge-active" },
  refund:       { label: "Refund to client",     badgeClass: "badge-refunded" },
  adjustment:   { label: "Adjustment",           badgeClass: "badge-cancelled" },
  recovery_credit: { label: "Recovery credit",   badgeClass: "badge-completed" },
  connect_transfer: { label: "Sent to Stripe",   badgeClass: "badge-processing" },
};

export const WALLET_STATUS_DISPLAY: Record<WalletTxnStatus, { label: string; badgeClass: string }> = {
  completed: { label: "Completed", badgeClass: "badge-completed" },
  pending:   { label: "Pending",   badgeClass: "badge-pending" },
  failed:    { label: "Failed",    badgeClass: "badge-rejected" },
};

/** How a payment was funded. 'wallet' is the legacy API name for today's online (Xendit) payment. */
export const FUNDING_LABEL = { wallet: "Online payment", card: "Card (Stripe)" } as const;
export type FundingLabel = (typeof FUNDING_LABEL)[keyof typeof FUNDING_LABEL];
export function fundingLabel(method: "wallet" | "card"): FundingLabel {
  return method === "card" ? FUNDING_LABEL.card : FUNDING_LABEL.wallet;
}

/** Non-card payouts are automatic and not tied to one job (payout records carry no job link yet). */
export const NON_CARD_PAYOUT_NOTE = "Paid out with the provider's next automatic payout";

/**
 * The Payout column on the Escrow tab. Only card-funded escrows are sent on to
 * Stripe (BACKEND_SCHEMA.md §29.5); other payouts are automatic (see payoutCell).
 */
export const TRANSFER_STATUS_DISPLAY: Record<TransferStatus, { label: string; badgeClass: string }> = {
  none:         { label: "Not sent",            badgeClass: "badge-pending" },
  pending:      { label: "Sending to Stripe",   badgeClass: "badge-processing" },
  transferred:  { label: "Sent to Stripe",      badgeClass: "badge-completed" },
  failed:       { label: "Transfer failed",     badgeClass: "badge-rejected" },
  not_eligible: { label: "Not set up", badgeClass: "badge-pending" },
  abandoned:    { label: "Not sent",      badgeClass: "badge-rejected" },
};

/** Transfer states an admin may retry from (POST /admin/escrow/:id/retry-transfer). */
export const RETRYABLE_TRANSFER: ReadonlySet<TransferStatus> = new Set(["failed", "abandoned", "not_eligible"]);

/** What an admin is told after retrying a payout (see ConnectPayoutsService). */
export const RETRY_OUTCOME_MESSAGE: Record<"transferred" | "not_eligible" | "failed" | "abandoned" | "retry" | "skipped", string> = {
  transferred: "Payout sent to the provider.",
  not_eligible: "The provider hasn't finished setting up payouts yet. Ask them to link a payout account, then retry.",
  failed: "The payout was refused again. Try again later or ask the provider to check their payout account.",
  abandoned: "The payout was refused. Ask the provider to check their payout account, then retry.",
  retry: "The payment service didn't answer. The payout is queued and will be retried automatically.",
  skipped: "Nothing to retry for this payout.",
};

// ─── Display row types (what components render) ───────────────────────────────

export interface UserRow {
  id: string;
  initials: string;
  name: string;
  email: string;
  /** Display label (e.g. "Provider") — the badge it renders in already carries color by role. */
  role: string;
  /** Same as `role` — kept as a separate field for CSV exports and any non-visual consumer. */
  rolePlain: string;
  isProvider: boolean;
  status: string;
  statusClass: string;
  joined: string;
  /** Raw ISO signup date — `joined` is display-formatted, this is for real date math (e.g. "signups this month"). */
  createdAt: string;
  activity: string;
  // Detail-view fields (already on admin_user_overview — no extra request).
  phone: string;
  city: string;
  category: string;
  jobsCompleted: number;
  /** Display string, e.g. "4.5 rating" or "Not yet rated". */
  rating: string;
  /** Raw value for exports and sorting; null when the provider has no ratings. */
  ratingValue: number | null;
  /** "—" when not suspended or the suspension is indefinite (migration 0014). */
  suspendedUntil: string;
  suspensionReason: string;
  deletedAt?: string | null;
  /** "Verified" / "Pending review" / "Rejected" / "Not submitted"; "—" for non-providers. */
  verification: string;
  verificationClass: string;
}

export interface VerificationDocument {
  label: string;
  /** Short-lived signed Storage URL — treat as an image src, not a permanent link. */
  url: string;
}

export interface VerificationRow {
  id: string;
  initials: string;
  name: string;
  email: string;
  date: string;
  status: "pending" | "approved" | "rejected";
  documents: VerificationDocument[];
  /** Display name of the ID type, or "Not specified" for older submissions. */
  documentType: string;
  method: Verification["method"];
}

export interface DisputeRow {
  entries?: import("../domain").CaseEntry[];
  hasPayment?: boolean;
  id: string;
  jobId: string;
  jobTitle: string;
  service: string;
  clientName: string;
  providerName: string;
  amount: string;
  reason: string;
  details: string | null;
  status: string;
  statusClass: string;
  resolution: string | null;
  resolutionNote: string | null;
  paymentSettled: boolean;
  createdAt: string;
  resolvedAt: string | null;
  isOpen: boolean;
  cancellationState: string | null;
  cancellationDeadline: string | null;
  clientId?: string | null;
  providerId?: string | null;
  photoUrls?: string[];
  raisedById?: string | null;
  chatMessageCount?: number | null;
}

export interface TransactionRow {
  id: string;
  /** The job this escrow belongs to — shown in the detail view. */
  jobId: string;
  customer: string;
  provider: string;
  service: string;
  amount: string;
  /** Raw numeric amount for aggregations (total volume, etc.). */
  amountValue: number;
  status: string;
  statusClass: string;
  date: string;
  funding: FundingLabel;
  /** Empty until the escrow is released — nothing has been paid out yet. */
  payout: string;
  payoutClass: string;
  /** The Stripe transfer id, or why it failed — the Payout cell's tooltip. */
  payoutDetail: string | null;
  canRetryTransfer: boolean;
  /** Tooltip for the empty Payout cell of a non-card job. */
  payoutNote: string | null;
}

export interface WalletTxnRow {
  id: string;
  profileName: string;
  kindLabel: string;
  kindClass: string;
  /** "+" for credits, "-" for debits, so the sign reads without a legend. */
  amount: string;
  amountValue: number;
  direction: "credit" | "debit";
  title: string;
  createdAt: string;
  statusLabel: string;
  statusClass: string;
}

export interface BookingRow {
  id: string;
  customer: string;
  provider: string;
  service: string;
  status: string;
  statusClass: string;
  date: string;
  amount: string;
  cancellable: boolean;
}

// ─── Row adapters ─────────────────────────────────────────────────────────────

export function toUserRow(u: AdminUser): UserRow {
  const display = USER_STATUS_DISPLAY[u.status];
  const isProvider = u.role === "provider";
  return {
    id: u.id,
    initials: initials(u.name),
    name: u.name,
    email: u.email,
    role: isProvider ? "Provider" : u.role === "admin" ? "Admin" : "Client",
    rolePlain: isProvider ? "Provider" : u.role === "admin" ? "Admin" : "Client",
    isProvider,
    status: display.label,
    statusClass: display.badgeClass,
    joined: formatDate(u.createdAt),
    createdAt: u.createdAt,
    activity: `${u.jobsCompleted} job${u.jobsCompleted === 1 ? "" : "s"}${u.rating ? ` · ${formatRating(u.rating)} rating` : ""}`,
    phone: u.phone ?? "—",
    city: u.city ?? "—",
    category: u.categoryName ?? "—",
    jobsCompleted: u.jobsCompleted,
    rating: u.rating ? `${formatRating(u.rating)} rating` : "Not yet rated",
    ratingValue: u.rating ? roundRating(u.rating) : null,
    suspendedUntil: u.suspendedUntil ? formatDate(u.suspendedUntil) : "—",
    suspensionReason: u.suspensionReason ?? "—",
    deletedAt: u.deletedAt ? formatDate(u.deletedAt) : null,
    verification: u.verification ? VERIFICATION_DISPLAY[u.verification].label : "—",
    verificationClass: u.verification ? VERIFICATION_DISPLAY[u.verification].badgeClass : "",
  };
}

const VERIFICATION_DISPLAY: Record<NonNullable<AdminUser["verification"]>, { label: string; badgeClass: string }> = {
  VERIFIED: { label: "Verified", badgeClass: "badge-approved" },
  IDENTITY_ONLY: { label: "Identity approved · certificate needed", badgeClass: "badge-pending" },
  PENDING: { label: "Pending review", badgeClass: "badge-pending" },
  REJECTED: { label: "Rejected", badgeClass: "badge-rejected" },
  UNVERIFIED: { label: "Not submitted", badgeClass: "badge-processing" },
};

/** Backend always signs [id_document_path, selfie_path] in that order (verifications.service.ts `shape()`);
 *  a doc is dropped from the array entirely if its signed URL failed to generate. */
const DOCUMENT_LABELS = ["Government ID", "Selfie"];

export function toVerificationRow(v: Verification): VerificationRow {
  return {
    id: v.id,
    initials: initials(v.name),
    name: v.name,
    email: v.email,
    date: formatDate(v.submittedAt),
    status: v.status.toLowerCase() as VerificationRow["status"],
    documents: v.documents.map((url, i) => ({ label: DOCUMENT_LABELS[i] ?? `Document ${i + 1}`, url })),
    documentType: (v.documentType && DOCUMENT_TYPE_LABELS[v.documentType]) ?? "Not specified",
    method: v.method,
  };
}

/** How a provider's ID was checked, as shown to admins. */
export function verificationMethodLabel(method: Verification["method"]): string {
  return method === "stripe_identity" ? "Stripe Identity" : "ID + selfie review";
}

/** Mirrors the mobile picker and the CHECK in migration 0034. */
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  philsys: "PhilSys (National ID)",
  drivers_license: "Driver's licence",
  umid: "UMID",
  passport: "Passport",
  postal_id: "Postal ID",
};

export function toTransactionRow(t: Transaction): TransactionRow {
  const display = TRANSACTION_STATUS_DISPLAY[t.status];
  return {
    id: t.id,
    jobId: t.jobId,
    customer: t.customerName,
    provider: t.providerName,
    service: t.service,
    amount: formatCurrency(t.amount),
    amountValue: t.amount,
    status: display.label,
    statusClass: display.badgeClass,
    date: formatDate(t.date),
    funding: fundingLabel(t.fundingMethod),
    ...payoutCell(t),
  };
}

function payoutCell(t: Transaction): Pick<TransactionRow, "payout" | "payoutClass" | "payoutDetail" | "canRetryTransfer" | "payoutNote"> {
  // Non-card (Xendit) payouts are automatic and payout records carry no job link,
  // so no per-job state is shown. Change here if a link is ever added.
  if (t.fundingMethod !== "card") {
    return { payout: "", payoutClass: "", payoutDetail: null, canRetryTransfer: false, payoutNote: NON_CARD_PAYOUT_NOTE };
  }
  if (t.status !== "COMPLETED" && t.transferStatus === "none") {
    return { payout: "", payoutClass: "", payoutDetail: null, canRetryTransfer: false, payoutNote: null };
  }
  const display = TRANSFER_STATUS_DISPLAY[t.transferStatus];
  return {
    payout: display.label,
    payoutClass: display.badgeClass,
    payoutDetail: t.stripeTransferId ?? t.transferError,
    canRetryTransfer: RETRYABLE_TRANSFER.has(t.transferStatus),
    payoutNote: null,
  };
}

export function toDisputeRow(d: Dispute): DisputeRow {
  const display = DISPUTE_STATUS_DISPLAY[d.status];
  return {
    entries: d.entries,
    photoUrls: d.photoUrls,
    raisedById: d.raisedById,
    chatMessageCount: d.chatMessageCount,
    hasPayment: d.hasPayment,
    id: d.id,
    jobId: d.jobId,
    jobTitle: d.jobTitle,
    service: d.service,
    clientName: d.clientName,
    providerName: d.providerName,
    // NaN means the escrow's amount did not come back: say so, never print a peso figure for it.
    amount: Number.isFinite(d.amount) ? formatCurrency(d.amount) : "Unknown",
    reason: d.reason,
    details: d.details,
    status: display.label,
    statusClass: display.badgeClass,
    resolution: d.resolution ? DISPUTE_RESOLUTION_LABEL[d.resolution] : null,
    resolutionNote: d.resolutionNote,
    paymentSettled: d.paymentSettled,
    createdAt: formatDate(d.createdAt),
    resolvedAt: d.resolvedAt ? formatDate(d.resolvedAt) : null,
    isOpen: d.status === "OPEN",
    cancellationState: d.cancellationState,
    cancellationDeadline: d.cancellationDeadline,
    clientId: d.clientId,
    providerId: d.providerId,
  };
}

/**
 * Client refunds are written as 'withdrawal' rows (pass_through_balances, migration 0058)
 * titled "Refund sent". The wallet payload carries no profile role, so the title is the
 * only signal; any other withdrawal stays a provider payout.
 */
export function isClientRefundWithdrawal(t: Pick<WalletTransaction, "kind" | "title">): boolean {
  return t.kind === "withdrawal" && t.title === "Refund sent";
}

export function toWalletTxnRow(t: WalletTransaction): WalletTxnRow {
  const display = isTestModeRefund(t)
    ? { label: "Refund recorded (test mode)", badgeClass: WALLET_KIND_DISPLAY.refund.badgeClass }
    : isClientRefundWithdrawal(t) ? WALLET_KIND_DISPLAY.refund : WALLET_KIND_DISPLAY[t.kind];
  const sign = t.direction === "credit" ? "+" : "-";
  return {
    id: t.id,
    profileName: t.profileName,
    kindLabel: display.label,
    kindClass: display.badgeClass,
    amount: `${sign}${formatCurrency(t.amount)}`,
    amountValue: t.amount,
    direction: t.direction,
    title: t.title,
    createdAt: formatDate(t.createdAt),
    statusLabel: WALLET_STATUS_DISPLAY[t.status].label,
    statusClass: WALLET_STATUS_DISPLAY[t.status].badgeClass,
  };
}

export function toBookingRow(b: AdminBooking): BookingRow {
  const display = b.displayStatus === "disputed" ? DISPUTED_BOOKING_DISPLAY : BOOKING_STATUS_DISPLAY[b.status];
  return {
    id: b.id,
    customer: b.customerName,
    provider: b.providerName,
    service: b.service,
    status: display.label,
    statusClass: display.badgeClass,
    date: formatDate(b.scheduledDate),
    amount: formatCurrency(b.amount),
    cancellable: isCancellableBooking(b.status),
  };
}

/** A failed withdrawal that is a refused Xendit payout (finishPayout writes the "Xendit:" prefix). Older cancelled or rejected requests fail the check. */
export function isXenditPayoutFailure(w: { status: string; reviewNote: string | null }): boolean {
  return w.status === "failed" && (w.reviewNote ?? "").trimStart().startsWith("Xendit:");
}

export interface PayoutFailureSplit<W> {
  /** Failed Xendit rows with no completed payout for that provider after them, newest first. */
  unresolved: W[];
  /** Failed Xendit rows a later completed payout covers, newest first, with that payout's date. */
  resolved: { withdrawal: W; paidAt: string }[];
  /** The newest unresolved failure per provider: who still has a refused payout. How much they are owed is their wallet balance, not this row's amount. */
  providers: W[];
}

/**
 * Splits failed Xendit payouts into still-owed and paid-later. A failure is
 * resolved when the same provider has a completed withdrawal created after it
 * (the next balance sweep sends the balance again as a new row). Pure, so the
 * list, the total and the sidebar count all agree.
 */
export function splitPayoutFailures<W extends { id: string; profileId: string; amount: number; status: string; reviewNote: string | null; createdAt: string }>(
  failed: W[],
  completed: W[],
): PayoutFailureSplit<W> {
  const newestFirst = (a: W, b: W) => b.createdAt.localeCompare(a.createdAt);
  const paid = completed.filter((c) => c.status === "completed");
  const unresolved: W[] = [];
  const resolved: { withdrawal: W; paidAt: string }[] = [];
  for (const f of failed.filter(isXenditPayoutFailure).sort(newestFirst)) {
    // Earliest completed payout after the failure is the one that settled it.
    const later = paid
      .filter((c) => c.profileId === f.profileId && c.createdAt > f.createdAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (later) resolved.push({ withdrawal: f, paidAt: later.createdAt });
    else unresolved.push(f);
  }
  const latest = new Map<string, W>();
  for (const f of unresolved) if (!latest.has(f.profileId)) latest.set(f.profileId, f); // unresolved is newest first
  return { unresolved, resolved, providers: [...latest.values()] };
}

/**
 * What the next automatic payout will send a profile. Mirrors the SQL function
 * public.wallet_available_balance (migration 0028), which pass_through_balances
 * (migration 0058) calls: completed credits, minus completed debits, minus
 * pending debits. Failed rows and pending credits count for nothing.
 */
export function walletAvailableBalance(rows: { direction: string; status: string; amount: number }[]): number {
  let sum = 0;
  for (const t of rows) {
    if (t.status === "completed" && t.direction === "credit") sum += t.amount;
    else if (t.status === "completed" && t.direction === "debit") sum -= t.amount;
    else if (t.status === "pending" && t.direction === "debit") sum -= t.amount;
  }
  return Math.round(sum * 100) / 100;
}

export interface OwedProvider {
  profileId: string;
  profileName: string;
  /** The provider's wallet balance, i.e. what pass_through_balances will send next. */
  owed: number;
}

/**
 * Providers with an unresolved Xendit failure and a balance still to send.
 * pass_through_balances skips a balance of 0 or less, so such a provider is
 * owed nothing and is not counted (their failed row still lists on the page).
 */
export function owedProviders(
  providers: { profileId: string; profileName: string }[],
  balances: ReadonlyMap<string, number>,
): OwedProvider[] {
  return providers
    .map((p) => ({ profileId: p.profileId, profileName: p.profileName, owed: balances.get(p.profileId) ?? 0 }))
    .filter((p) => p.owed > 0);
}

/** The one rule behind the page header and the sidebar count: providers still owed after a refused Xendit payout, and the sum of their balances. */
export function payoutHeadline(owed: { owed: number }[]): { count: number; total: number } {
  const total = owed.reduce((n, o) => n + o.owed, 0);
  return { count: owed.length, total: Math.round(total * 100) / 100 };
}
