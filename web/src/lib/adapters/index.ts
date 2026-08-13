// ─── Adapters: domain → display ───────────────────────────────────────────────
// Pure functions that turn backend-shaped domain data into the exact display
// shapes the components render (formatted currency, badge classes, initials…).
// Keeping this mapping in one place means components never change when the
// data source flips from mock to the real API.

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
} from "@/lib/domain";

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** "Morgan Lee" → "ML"; single names use the first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** 1200 → "₱1,200" */
export function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString("en-PH")}`;
}

/** 2400000 → "₱2.4M", 184200 → "₱184.2K" (dashboard-style compact figures). */
export function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000) return `₱${(amount / 1_000_000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}M`;
  if (amount >= 100_000) return `₱${(amount / 1_000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}K`;
  return formatCurrency(amount);
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
  REFUNDED_TO_CLIENT: "Refunded to homeowner",
};

export const WALLET_KIND_DISPLAY: Record<WalletTxnKind, { label: string; badgeClass: string }> = {
  topup:        { label: "Top-up",      badgeClass: "badge-completed" },
  withdrawal:   { label: "Withdrawal",  badgeClass: "badge-processing" },
  escrow_hold:  { label: "Escrow hold", badgeClass: "badge-pending" },
  payout:       { label: "Payout",      badgeClass: "badge-active" },
  refund:       { label: "Refund",      badgeClass: "badge-refunded" },
  adjustment:   { label: "Adjustment",  badgeClass: "badge-cancelled" },
};

// ─── Display row types (what components render) ───────────────────────────────

export interface UserRow {
  id: string;
  initials: string;
  name: string;
  email: string;
  /** Display label, emoji-prefixed (e.g. "🔧 Provider"). Use `rolePlain` for exports. */
  role: string;
  /** Same role without the emoji — CSV exports and any non-visual consumer. */
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
  /** Display string, e.g. "⭐ 4.5" or "Not yet rated". */
  rating: string;
  /** Raw value for exports and sorting; null when the provider has no ratings. */
  ratingValue: number | null;
  /** "—" when not suspended or the suspension is indefinite (migration 0014). */
  suspendedUntil: string;
  suspensionReason: string;
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
}

export interface DisputeRow {
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
  createdAt: string;
  resolvedAt: string | null;
  isOpen: boolean;
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
    role: isProvider ? "🔧 Provider" : u.role === "admin" ? "🛡️ Admin" : "👤 Homeowner",
    rolePlain: isProvider ? "Provider" : u.role === "admin" ? "Admin" : "Homeowner",
    isProvider,
    status: display.label,
    statusClass: display.badgeClass,
    joined: formatDate(u.createdAt),
    createdAt: u.createdAt,
    activity: `${u.jobsCompleted} job${u.jobsCompleted === 1 ? "" : "s"}${u.rating ? ` ⭐${u.rating}` : ""}`,
    phone: u.phone ?? "—",
    city: u.city ?? "—",
    category: u.categoryName ?? "—",
    jobsCompleted: u.jobsCompleted,
    rating: u.rating ? `⭐ ${u.rating}` : "Not yet rated",
    ratingValue: u.rating,
    suspendedUntil: u.suspendedUntil ? formatDate(u.suspendedUntil) : "—",
    suspensionReason: u.suspensionReason ?? "—",
  };
}

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
  };
}

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
  };
}

export function toDisputeRow(d: Dispute): DisputeRow {
  const display = DISPUTE_STATUS_DISPLAY[d.status];
  return {
    id: d.id,
    jobId: d.jobId,
    jobTitle: d.jobTitle,
    service: d.service,
    clientName: d.clientName,
    providerName: d.providerName,
    amount: formatCurrency(d.amount),
    reason: d.reason,
    details: d.details,
    status: display.label,
    statusClass: display.badgeClass,
    resolution: d.resolution ? DISPUTE_RESOLUTION_LABEL[d.resolution] : null,
    resolutionNote: d.resolutionNote,
    createdAt: formatDate(d.createdAt),
    resolvedAt: d.resolvedAt ? formatDate(d.resolvedAt) : null,
    isOpen: d.status === "OPEN",
  };
}

export function toWalletTxnRow(t: WalletTransaction): WalletTxnRow {
  const display = WALLET_KIND_DISPLAY[t.kind];
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
  };
}

export function toBookingRow(b: AdminBooking): BookingRow {
  const display = BOOKING_STATUS_DISPLAY[b.status];
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
