// ─── Wire types ───────────────────────────────────────────────────────────────
// Exact JSON shapes the backend's /admin/* and /auth/* endpoints return.
// Only the fields the web app actually reads are declared — extra backend
// fields present at runtime are simply ignored. Mapped into
// web/src/lib/domain.ts shapes by the services layer; nothing outside
// lib/services should import from here.

/** Per-user preferences (migration 0011). Only `dark_mode` has an admin-console
 *  counterpart today — the rest exist for the mobile app's Settings screen. */
export interface UserSettingsApiResponse {
  profile_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  location_sharing: boolean;
  dark_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginApiResponse {
  user: {
    id: string;
    email: string;
    // Added so the console can show a name instead of an email address.
    full_name: string | null;
    role: "client" | "provider" | "admin" | null;
  };
  csrf_token: string;
}

export interface AdminSessionApiResponse {
  user: {
    id: string;
    full_name: string | null;
    role: "admin" | null;
  };
  csrf_token: string | undefined;
}

export interface AdminUserApiRow {
  id: string;
  email: string;
  full_name: string;
  role: "client" | "provider" | "admin";
  deactivated_at: string | null;
  created_at: string;
  cached_avg_rating: number | null;
  cached_completed_jobs: number | null;
  // Already present on the admin_user_overview view (migration 0005) — the list
  // endpoint selects `*`, so these come back for free with no extra request.
  phone: string | null;
  city: string | null;
  category_name: string | null;
  /** Added by migration 0014. Null unless the account is under a timed suspension. */
  suspended_until: string | null;
  suspension_reason: string | null;
}

export interface ListUsersApiResponse {
  users: AdminUserApiRow[];
  total: number;
}

export type JobStatusApi =
  | "open"
  | "recommending"
  | "assigned"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

export interface AdminBookingApiRow {
  id: string;
  status: JobStatusApi;
  posted_at: string;
  /** Client-set budget in PHP (migration 0007). Null on pre-pricing jobs. */
  budget: number | string | null;
  service_categories: { name: string } | null;
  client: { id: string; full_name: string } | null;
  provider: { id: string; full_name: string } | null;
}

export interface ListBookingsApiResponse {
  bookings: AdminBookingApiRow[];
  total: number;
}

export interface AnalyticsSummaryApiResponse {
  totals: {
    users: number;
    clients: number;
    providers: number;
    suspended: number;
    bookings: number;
    avg_rating: number | null;
    total_revenue: number;
    monthly_revenue: number;
    /** Submissions awaiting admin review (migration 0008). */
    pending_verifications: number;
  };
  bookings_by_status: Record<string, number>;
  bookings_by_category: Record<string, number>;
  booking_trend: { date: string; count: number }[];
  revenue_trend: { month: string; amount: number }[];
  top_providers: {
    profile_id: string;
    cached_avg_rating: number | null;
    cached_ratings_count: number | null;
    cached_completed_jobs: number | null;
    profiles: { full_name: string } | null;
    service_categories: { name: string } | null;
  }[];
}

// ─── Verifications (migration 0008) ───────────────────────────────────────────
// Backend enums are lowercase, matching job_status/user_role; the adapters
// uppercase them for display.

export type VerificationStatusApi = "pending" | "approved" | "rejected";

export interface AdminVerificationApiRow {
  id: string;
  provider_id: string;
  full_name: string | null;
  email: string | null;
  status: VerificationStatusApi;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  /** Short-lived signed URLs — the documents bucket is private. */
  documents: string[];
}

export interface ListVerificationsApiResponse {
  verifications: AdminVerificationApiRow[];
  total: number;
}

// ─── Escrow transactions (migration 0009) ─────────────────────────────────────

export type EscrowStatusApi =
  | "held"
  | "released"
  | "disputed"
  | "refunded"
  | "cancelled";

export interface AdminTransactionApiRow {
  id: string;
  job_id: string;
  /** Postgres numeric arrives as a string over PostgREST. */
  amount: number | string;
  status: EscrowStatusApi;
  held_at: string;
  jobs: { title: string; service_categories: { name: string } | null } | null;
  client: { id: string; full_name: string } | null;
  provider: { id: string; full_name: string } | null;
}

export interface ListTransactionsApiResponse {
  transactions: AdminTransactionApiRow[];
  total: number;
}

// ─── Disputes (migration 0009) ─────────────────────────────────────────────────

export type DisputeStatusApi = "open" | "resolved" | "cancelled";
export type DisputeResolutionApi = "released_to_provider" | "refunded_to_client";

export interface AdminDisputeApiRow {
  id: string;
  job_id: string;
  reason: string;
  details: string | null;
  status: DisputeStatusApi;
  resolution: DisputeResolutionApi | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  jobs: { title: string; service_categories: { name: string } | null } | null;
  /** Postgres numeric arrives as a string over PostgREST. */
  escrow_transactions: { amount: number | string; status: EscrowStatusApi } | null;
  /** The client who raised it — only clients can (backend `@Roles('client')`). */
  raised_by_profile: { id: string; full_name: string } | null;
}

export interface ListDisputesApiResponse {
  disputes: AdminDisputeApiRow[];
  total: number;
}

export interface AdminActivityApiRow {
  id: number;
  old_status: JobStatusApi | null;
  new_status: JobStatusApi;
  changed_at: string;
  jobs: { title: string } | null;
  changed_by: { full_name: string } | null;
}

/**
 * GET /admin/activity's response shape as of backend migration 0014
 * (BACKEND_SCHEMA.md §23.4) — was a bare AdminActivityApiRow[] before
 * pagination/date-filtering existed.
 */
export interface ListActivityApiResponse {
  items: AdminActivityApiRow[];
  total: number;
}

// ─── Admin console follow-ups (migration 0014) ────────────────────────────────

/** GET /admin/bookings/:id — the list row's fields plus whatever `select('*')`
 *  on `jobs` carries (description, address, scheduled_at, photo_urls), plus
 *  the linked escrow transaction. */
export interface AdminBookingDetailApiResponse extends AdminBookingApiRow {
  description: string | null;
  address: string | null;
  scheduled_at: string | null;
  photo_urls: string[] | null;
  escrow: { amount: number | string; status: EscrowStatusApi } | null;
}

export interface AdminActionApiRow {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { id: string; full_name: string } | null;
}

export interface ListAuditApiResponse {
  actions: AdminActionApiRow[];
  total: number;
}

/** GET/PATCH /admin/maintenance (migration 0017). */
export interface MaintenanceApiResponse {
  maintenance_mode: boolean;
  maintenance_message: string | null;
  updated_at: string;
}

/** GET /admin/wallet-transactions (migration 0017) — the wallet ledger, distinct
 *  from escrow (AdminTransactionApiRow above): a user's running balance rather
 *  than money held for one job. Includes Stripe Checkout top-ups (PR #35). */
export type WalletTxnKindApi =
  | "topup"
  | "withdrawal"
  | "escrow_hold"
  | "payout"
  | "refund"
  | "adjustment";

export interface AdminWalletTxnApiRow {
  id: string;
  direction: "credit" | "debit";
  status: "pending" | "completed" | "failed";
  kind: WalletTxnKindApi;
  /** Postgres numeric arrives as a string over PostgREST. */
  amount: number | string;
  title: string;
  created_at: string;
  profile: { id: string; full_name: string } | null;
}

export interface ListWalletTxnApiResponse {
  transactions: AdminWalletTxnApiRow[];
  total: number;
}

export interface AdminMessageApiRow {
  id: string;
  sender_id: string;
  sender_name: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface AdminConversationApiResponse {
  messages: AdminMessageApiRow[];
}
