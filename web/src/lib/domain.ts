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
  | "assigned"
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
