// ─── Domain types ─────────────────────────────────────────────────────────────
// "Backend-shaped" data: numbers, enums, ISO dates. UserRole/BookingStatus
// mirror the real Supabase enums (`user_role`, `job_status` — see
// backend/BACKEND_SCHEMA.md §4). Verification/Transaction stay invented:
// no backend tables exist for them yet (see the non-goals in
// docs/superpowers/specs/2026-07-20-web-backend-integration-design.md).

export type Page =
  | "dashboard"
  | "verifications"
  | "users"
  | "transactions"
  | "disputes"
  | "activity-log"
  | "audit-log"
  | "bookings"
  | "reports"
  | "settings";

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserRole = "client" | "provider" | "admin";
/** The real schema only has `deactivated_at` — no separate "banned" tier. */
export type UserStatus = "ACTIVE" | "SUSPENDED";

/** Admin view of a user: the `admin_user_overview` row (migration 0005),
 *  remapped for display. */
export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  name: string;
  status: UserStatus;
  /** Provider's completed-job count; 0 for clients — the view has no
   *  per-client completed-job count today. */
  jobsCompleted: number;
  /** Provider average rating; null for clients. */
  rating: number | null;
  phone: string | null;
  city: string | null;
  /** The provider's service category; null for clients. */
  categoryName: string | null;
  /** Null unless the account is under a timed suspension (migration 0014). */
  suspendedUntil: string | null;
  suspensionReason: string | null;
}

// ─── Verifications ────────────────────────────────────────────────────────────

export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Verification {
  id: string;
  providerId: string;
  // Denormalized for the admin list — the backend admin API returns these joined.
  name: string;
  email: string;
  submittedAt: string; // ISO date
  status: VerificationStatus;
  documents: string[];
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TransactionStatus = "COMPLETED" | "IN_ESCROW" | "DISPUTED" | "REFUNDED";

export interface Transaction {
  id: string;
  jobId: string;
  customerName: string;
  providerName: string;
  service: string;
  amount: number;
  status: TransactionStatus;
  date: string; // ISO date
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

export type DisputeStatus = "OPEN" | "RESOLVED" | "CANCELLED";
export type DisputeResolution = "RELEASED_TO_PROVIDER" | "REFUNDED_TO_CLIENT";

export interface Dispute {
  id: string;
  jobId: string;
  jobTitle: string;
  service: string;
  /** Always the client — only clients can raise a dispute (backend `@Roles('client')`). */
  clientName: string;
  /** Cross-referenced from the Transactions list by job id — "Unknown provider" if not found. */
  providerName: string;
  amount: number;
  reason: string;
  details: string | null;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolutionNote: string | null;
  createdAt: string; // ISO date
  resolvedAt: string | null;
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

/** Mirrors the real `job_status` enum (BACKEND_SCHEMA.md §4). */
export type BookingStatus =
  | "open"
  | "recommending"
  // The provider was hired ('assigned') and has accepted ('confirmed') —
  // migration 0018.
  | "assigned"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

export interface AdminBooking {
  id: string;
  customerName: string;
  providerName: string;
  service: string;
  status: BookingStatus;
  /** The job's `posted_at` — the real schema has no scheduling/time-slot
   *  concept (BACKEND_SCHEMA.md §14), so this is "when posted", not "when
   *  scheduled for". */
  scheduledDate: string;
  /** Placeholder — the real `jobs` table has no price field (payments are
   *  out of scope). Not sourced from the backend; see the design spec's
   *  non-goals. */
  amount: number;
}

/** GET /admin/bookings/:id (migration 0014) — fetched on demand when a row
 *  is expanded, not part of the list. */
export interface AdminBookingDetail {
  description: string | null;
  address: string | null;
  scheduledAt: string | null;
  photoUrls: string[];
  escrowStatus: TransactionStatus | null;
  escrowAmount: number | null;
}

// ─── Platform maintenance mode (migration 0017) ───────────────────────────────

export interface MaintenanceStatus {
  enabled: boolean;
  message: string | null;
  updatedAt: string | null;
}

// ─── Admin wallet visibility (migration 0017) ─────────────────────────────────
// A user's running balance ledger (top-ups, withdrawals, escrow payouts/refunds)
// — distinct from Transaction above, which is money held for one job.

export type WalletTxnKind =
  | "topup"
  | "withdrawal"
  | "escrow_hold"
  | "payout"
  | "refund"
  | "adjustment";
export type WalletTxnStatus = "pending" | "completed" | "failed";

export interface WalletTransaction {
  id: string;
  profileName: string;
  direction: "credit" | "debit";
  kind: WalletTxnKind;
  status: WalletTxnStatus;
  amount: number;
  title: string;
  createdAt: string; // ISO date
}

// ─── Admin audit log (migration 0014) ─────────────────────────────────────────

export interface AuditAction {
  id: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Admin read-only chat (migration 0014) ────────────────────────────────────

export interface ConversationMessage {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
}

// ─── Analytics / dashboard ────────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  activeProviders: number;
  totalBookings: number;
  pendingVerifications: number;
  totalRevenue: number;
  monthlyRevenue: number;
  completionRate: number; // 0–100
  avgRating: number;
}

export interface MonthlyPoint {
  month: string;
  value: number;
}

export interface CategoryShare {
  label: string;
  value: number; // percent 0–100
}

export type ActivityType = "verif" | "tx" | "user" | "alert";

export interface ActivityEvent {
  time: string;
  text: string;
  type: ActivityType;
}

export interface TopProvider {
  name: string;
  jobs: number;
  rating: number;
}
