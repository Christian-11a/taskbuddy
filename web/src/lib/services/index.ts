// ─── Services: the data seam ──────────────────────────────────────────────────
// Pages/context call these and never know where data comes from.
// Every page now calls the real backend (see lib/api/client.ts). Verifications
// and Transactions were the last mock holdouts; migrations 0008 and 0009 gave
// them real tables, so the in-memory mock DB is gone.

import { ApiError, client } from "@/lib/api/client";
import { clearStoredSession, getStoredSession, setStoredSession } from "@/lib/api/session";
import {
  mapActivity,
  mapBookingsByCategory,
  mapBookingsSeries,
  mapCompletionRate,
  mapRevenueSeries,
  mapTopProviders,
} from "./mapAnalytics";
import type {
  AdminBookingApiRow,
  AdminDisputeApiRow,
  AdminTransactionApiRow,
  AdminUserApiRow,
  AdminVerificationApiRow,
  AnalyticsSummaryApiResponse,
  DisputeResolutionApi,
  EscrowStatusApi,
  ListActivityApiResponse,
  ListBookingsApiResponse,
  ListDisputesApiResponse,
  ListTransactionsApiResponse,
  ListUsersApiResponse,
  ListVerificationsApiResponse,
  LoginApiResponse,
} from "@/lib/api/types";
import type {
  ActivityEvent,
  AdminBooking,
  AdminUser,
  CategoryShare,
  DashboardStats,
  Dispute,
  DisputeResolution,
  DisputeStatus,
  MonthlyPoint,
  TopProvider,
  Transaction,
  TransactionStatus,
  UserStatus,
  Verification,
  VerificationStatus,
} from "@/lib/domain";

export { ApiError };

// Users/Bookings tables render fully client-side with no pagination UI —
// request a generous page size instead of building pagination this pass.
const LIST_PAGE_SIZE = 200;

function mapUserRow(row: AdminUserApiRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    name: row.full_name,
    status: row.deactivated_at ? "SUSPENDED" : "ACTIVE",
    jobsCompleted: row.cached_completed_jobs ?? 0,
    rating: row.cached_avg_rating,
    phone: row.phone ?? null,
    city: row.city ?? null,
    categoryName: row.category_name ?? null,
  };
}

function mapBookingRow(row: AdminBookingApiRow): AdminBooking {
  return {
    id: row.id,
    customerName: row.client?.full_name ?? "Unknown client",
    providerName: row.provider?.full_name ?? "Unassigned",
    service: row.service_categories?.name ?? "Uncategorized",
    status: row.status,
    scheduledDate: row.posted_at,
    // Jobs posted before pricing existed (migration 0007) have no budget.
    amount: Number(row.budget ?? 0),
  };
}

function mapVerificationRow(row: AdminVerificationApiRow): Verification {
  return {
    id: row.id,
    providerId: row.provider_id,
    name: row.full_name ?? "Unknown provider",
    email: row.email ?? "",
    submittedAt: row.submitted_at,
    status: row.status.toUpperCase() as VerificationStatus,
    documents: row.documents,
  };
}

/** Escrow states → the labels the Transactions page renders. */
const TRANSACTION_STATUS: Record<EscrowStatusApi, TransactionStatus> = {
  held: "IN_ESCROW",
  released: "COMPLETED",
  disputed: "DISPUTED",
  refunded: "REFUNDED",
  // No dedicated UI state; a cancelled hold reads as refunded to the client.
  cancelled: "REFUNDED",
};

function mapTransactionRow(row: AdminTransactionApiRow): Transaction {
  return {
    id: row.id,
    jobId: row.job_id,
    customerName: row.client?.full_name ?? "Unknown client",
    providerName: row.provider?.full_name ?? "Unassigned",
    service: row.jobs?.service_categories?.name ?? row.jobs?.title ?? "Uncategorized",
    amount: Number(row.amount),
    status: TRANSACTION_STATUS[row.status],
    date: row.held_at,
  };
}

const DISPUTE_STATUS: Record<string, DisputeStatus> = {
  open: "OPEN",
  resolved: "RESOLVED",
  cancelled: "CANCELLED",
};

const DISPUTE_RESOLUTION: Record<DisputeResolutionApi, DisputeResolution> = {
  released_to_provider: "RELEASED_TO_PROVIDER",
  refunded_to_client: "REFUNDED_TO_CLIENT",
};

/**
 * The disputes endpoint doesn't join the provider's name (only the client who
 * raised it, via `raised_by_profile`) — so we cross-reference the already-loaded
 * Transactions list by job id to fill in the provider and a client fallback.
 */
function mapDisputeRow(
  row: AdminDisputeApiRow,
  txnByJob: Map<string, Transaction>,
): Dispute {
  const linked = txnByJob.get(row.job_id);
  return {
    id: row.id,
    jobId: row.job_id,
    jobTitle: row.jobs?.title ?? linked?.service ?? "Unknown job",
    service: row.jobs?.service_categories?.name ?? linked?.service ?? "Uncategorized",
    clientName: row.raised_by_profile?.full_name ?? linked?.customerName ?? "Unknown client",
    providerName: linked?.providerName ?? "Unknown provider",
    amount: Number(row.escrow_transactions?.amount ?? linked?.amount ?? 0),
    reason: row.reason,
    details: row.details,
    status: DISPUTE_STATUS[row.status] ?? "OPEN",
    resolution: row.resolution ? DISPUTE_RESOLUTION[row.resolution] : null,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<boolean> {
  try {
    const res = await client.post<LoginApiResponse>("/auth/login", { email, password });
    setStoredSession({
      accessToken: res.session.access_token,
      refreshToken: res.session.refresh_token,
      adminProfile: {
        name: res.user.full_name ?? res.user.email,
        email: res.user.email,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Reads a previously stored session (survives page reloads). */
export function restoreSession(): { name: string; email: string } | null {
  return getStoredSession()?.adminProfile ?? null;
}

export async function logout(): Promise<void> {
  try {
    await client.post("/auth/logout");
  } catch {
    // best-effort — the local session below is cleared regardless
  } finally {
    clearStoredSession();
  }
}

/**
 * Persists the admin's display name. Email is deliberately not settable: it
 * lives on `auth.users`, not `profiles`, and no endpoint exposes changing it —
 * the Settings field is read-only for that reason.
 */
export async function updateDisplayName(name: string): Promise<boolean> {
  try {
    await client.patch("/profiles/me", { full_name: name });
    const session = getStoredSession();
    if (session) setStoredSession({ ...session, adminProfile: { ...session.adminProfile, name } });
    return true;
  } catch {
    return false;
  }
}

export async function changePassword(current: string, next: string): Promise<boolean> {
  try {
    await client.post("/auth/change-password", {
      current_password: current,
      new_password: next,
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<AdminUser[]> {
  const res = await client.get<ListUsersApiResponse>(`/admin/users?limit=${LIST_PAGE_SIZE}`);
  return res.users.map(mapUserRow);
}

export async function getVerifications(): Promise<Verification[]> {
  const res = await client.get<ListVerificationsApiResponse>(
    `/admin/verifications?limit=${LIST_PAGE_SIZE}`,
  );
  return res.verifications.map(mapVerificationRow);
}

export async function getTransactions(): Promise<Transaction[]> {
  const res = await client.get<ListTransactionsApiResponse>(
    `/admin/transactions?limit=${LIST_PAGE_SIZE}`,
  );
  return res.transactions.map(mapTransactionRow);
}

/** Cross-references Transactions (for provider name + amount fallback) — see mapDisputeRow. */
export async function getDisputes(): Promise<Dispute[]> {
  const [res, txns] = await Promise.all([
    client.get<ListDisputesApiResponse>(`/admin/disputes?limit=${LIST_PAGE_SIZE}`),
    getTransactions(),
  ]);
  const txnByJob = new Map(txns.map((t) => [t.jobId, t] as const));
  return res.disputes.map((row) => mapDisputeRow(row, txnByJob));
}

export async function getBookings(): Promise<AdminBooking[]> {
  const res = await client.get<ListBookingsApiResponse>(`/admin/bookings?limit=${LIST_PAGE_SIZE}`);
  return res.bookings.map(mapBookingRow);
}

/**
 * The dashboard derives five separate values from this one endpoint, so a page
 * load fired five identical requests — punishing on a free-tier Render instance
 * that cold-starts for 30–60s. Callers that overlap now share a single request.
 *
 * Deliberately in-flight only, with no TTL: once the batch settles the next load
 * fetches fresh data, so nothing here can serve a stale dashboard.
 */
let summaryInFlight: Promise<AnalyticsSummaryApiResponse> | null = null;

async function getAnalyticsSummary(): Promise<AnalyticsSummaryApiResponse> {
  summaryInFlight ??= client
    .get<AnalyticsSummaryApiResponse>("/admin/analytics/summary")
    .finally(() => {
      summaryInFlight = null;
    });
  return summaryInFlight;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const summary = await getAnalyticsSummary();
  return {
    totalUsers: summary.totals.users,
    activeProviders: summary.totals.providers,
    totalBookings: summary.totals.bookings,
    pendingVerifications: summary.totals.pending_verifications,
    totalRevenue: summary.totals.total_revenue,
    monthlyRevenue: summary.totals.monthly_revenue,
    completionRate: mapCompletionRate(summary),
    // Null until at least one provider has been rated.
    avgRating: summary.totals.avg_rating ?? 0,
  };
}

export async function getRevenueSeries(): Promise<MonthlyPoint[]> {
  return mapRevenueSeries(await getAnalyticsSummary());
}

export async function getBookingsSeries(): Promise<MonthlyPoint[]> {
  return mapBookingsSeries(await getAnalyticsSummary());
}

export async function getBookingsByCategory(): Promise<CategoryShare[]> {
  return mapBookingsByCategory(await getAnalyticsSummary());
}

export async function getRecentActivity(): Promise<ActivityEvent[]> {
  // Backend migration 0014 (BACKEND_SCHEMA.md §23.4) changed this from a bare
  // array to { items, total } to support pagination/date filtering. Neither
  // the Dashboard feed nor the Activity Log page paginate yet — both just
  // want the list — so this still returns a flat array to its callers.
  const { items } = await client.get<ListActivityApiResponse>("/admin/activity");
  return mapActivity(items);
}

export async function getTopProviders(): Promise<TopProvider[]> {
  return mapTopProviders(await getAnalyticsSummary());
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function approveVerification(id: string): Promise<Verification[]> {
  await client.post(`/admin/verifications/${id}/approve`);
  return getVerifications();
}

export async function rejectVerification(id: string): Promise<Verification[]> {
  await client.post(`/admin/verifications/${id}/reject`);
  return getVerifications();
}

/** See bulkSetUserStatus — same per-id-with-swallowed-failure pattern. */
export async function bulkApproveVerifications(ids: string[]): Promise<Verification[]> {
  await Promise.all(ids.map((id) => client.post(`/admin/verifications/${id}/approve`).catch(() => null)));
  return getVerifications();
}

export async function bulkRejectVerifications(ids: string[]): Promise<Verification[]> {
  await Promise.all(ids.map((id) => client.post(`/admin/verifications/${id}/reject`).catch(() => null)));
  return getVerifications();
}

export async function setUserStatus(id: string, status: UserStatus): Promise<AdminUser[]> {
  await client.post(
    status === "SUSPENDED" ? `/admin/users/${id}/suspend` : `/admin/users/${id}/reinstate`,
  );
  return getUsers();
}

/**
 * No bulk endpoint exists — fires the existing single-user endpoint per id in
 * parallel. A per-id failure (e.g. the backend refuses to suspend an admin) is
 * swallowed rather than aborting the rest: the final refetch reflects exactly
 * what actually changed, so the UI stays honest even when some ids fail.
 */
export async function bulkSetUserStatus(ids: string[], status: UserStatus): Promise<AdminUser[]> {
  await Promise.all(
    ids.map((id) =>
      client
        .post(status === "SUSPENDED" ? `/admin/users/${id}/suspend` : `/admin/users/${id}/reinstate`)
        .catch(() => null),
    ),
  );
  return getUsers();
}

export async function cancelBooking(id: string): Promise<AdminBooking[]> {
  await client.post(`/admin/bookings/${id}/cancel`);
  return getBookings();
}

export async function resolveDispute(
  id: string,
  resolution: DisputeResolution,
  note?: string,
): Promise<Dispute[]> {
  await client.post(`/admin/disputes/${id}/resolve`, {
    resolution: resolution === "RELEASED_TO_PROVIDER" ? "released_to_provider" : "refunded_to_client",
    note,
  });
  return getDisputes();
}
