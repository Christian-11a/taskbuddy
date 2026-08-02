// ─── Wire types ───────────────────────────────────────────────────────────────
// Exact JSON shapes the backend's /admin/* and /auth/* endpoints return.
// Only the fields the web app actually reads are declared — extra backend
// fields present at runtime are simply ignored. Mapped into
// web/src/lib/domain.ts shapes by the services layer; nothing outside
// lib/services should import from here.

export interface LoginApiResponse {
  user: { id: string; email: string };
  session: { access_token: string; refresh_token: string; expires_at: number };
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
}

export interface ListUsersApiResponse {
  users: AdminUserApiRow[];
  total: number;
}

export type JobStatusApi =
  | "open"
  | "recommending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

export interface AdminBookingApiRow {
  id: string;
  status: JobStatusApi;
  posted_at: string;
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

export interface AdminActivityApiRow {
  id: number;
  old_status: JobStatusApi | null;
  new_status: JobStatusApi;
  changed_at: string;
  jobs: { title: string } | null;
  changed_by: { full_name: string } | null;
}
