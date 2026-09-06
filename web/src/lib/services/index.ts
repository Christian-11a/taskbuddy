// ─── Services: the data seam ──────────────────────────────────────────────────
// Pages/context call these and never know where data comes from.
// Every page now calls the real backend (see lib/api/client.ts). Verifications
// and Transactions were the last mock holdouts; migrations 0008 and 0009 gave
// them real tables, so the in-memory mock DB is gone.

import { ApiError, client } from "@/lib/api/client";
import {
  clearAdminSession,
  getAdminSession,
  setAdminSession,
  type AdminProfile,
} from "@/lib/api/session";
import {
  mapActivity,
  mapBookingsByCategory,
  mapBookingsSeries,
  mapCompletionRate,
  mapRevenueSeries,
  mapTopProviders,
} from "./mapAnalytics";
import type {
  AdminActionApiRow,
  AdminSessionApiResponse,
  AdminBookingApiRow,
  AdminBookingDetailApiResponse,
  AdminConversationApiResponse,
  AdminDisputeApiRow,
  AdminMessageApiRow,
  AdminTransactionApiRow,
  AdminUserApiRow,
  AdminVerificationApiRow,
  AdminWalletTxnApiRow,
  AdminWithdrawalApiRow,
  AdminAccountApiRow,
  CategoryApiRow,
  AnalyticsSummaryApiResponse,
  DisputeResolutionApi,
  EscrowStatusApi,
  ListActivityApiResponse,
  ListAuditApiResponse,
  ListBookingsApiResponse,
  ListDisputesApiResponse,
  ListTransactionsApiResponse,
  ListUsersApiResponse,
  ListVerificationsApiResponse,
  ListWalletTxnApiResponse,
  ListWithdrawalsApiResponse,
  CommissionApiResponse,
  BroadcastApiResponse,
  LoginApiResponse,
  MaintenanceApiResponse,
  UserSettingsApiResponse,
} from "@/lib/api/types";
import type {
  ActivityEvent,
  AdminBooking,
  AdminBookingDetail,
  AdminUser,
  AuditAction,
  CategoryShare,
  ConversationMessage,
  DashboardStats,
  Dispute,
  DisputeResolution,
  DisputeStatus,
  MaintenanceStatus,
  MonthlyPoint,
  TopProvider,
  Transaction,
  TransactionStatus,
  UserStatus,
  Verification,
  VerificationStatus,
  WalletTransaction,
  AdminWithdrawal,
  AdminAccount,
  ServiceCategory,
  CommissionSettings,
} from "@/lib/domain";

export { ApiError };
export type { AdminProfile };

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
    status: row.deleted_at ? "DELETED" : row.deactivated_at ? "SUSPENDED" : "ACTIVE",
    jobsCompleted: row.cached_completed_jobs ?? 0,
    rating: row.cached_avg_rating,
    phone: row.phone ?? null,
    city: row.city ?? null,
    categoryName: row.category_name ?? null,
    suspendedUntil: row.suspended_until ?? null,
    suspensionReason: row.suspension_reason ?? null,
    ...(row.deleted_at !== undefined ? { deletedAt: row.deleted_at } : {}),
  };
}

function mapBookingRow(row: AdminBookingApiRow): AdminBooking {
  return {
    id: row.id,
    customerName: row.client?.full_name ?? "Unknown homeowner",
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
    customerName: row.client?.full_name ?? "Unknown homeowner",
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
    clientName: row.raised_by_profile?.full_name ?? linked?.customerName ?? "Unknown homeowner",
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

function mapWalletTxnRow(row: AdminWalletTxnApiRow): WalletTransaction {
  return {
    id: row.id,
    profileName: row.profile?.full_name ?? "Unknown user",
    direction: row.direction,
    kind: row.kind,
    status: row.status,
    amount: Number(row.amount),
    title: row.title,
    createdAt: row.created_at,
  };
}

function mapWithdrawalRow(row: AdminWithdrawalApiRow): AdminWithdrawal {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile?.full_name ?? "Unknown user",
    amount: Number(row.amount),
    title: row.title,
    destination: row.withdrawal_destination,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

function mapCategoryRow(row: CategoryApiRow): ServiceCategory {
  return { id: row.id, name: row.name, isActive: row.is_active };
}

function mapAdminRow(row: AdminAccountApiRow): AdminAccount {
  return {
    id: row.id,
    email: row.email ?? "",
    name: row.full_name ?? row.email ?? "Unnamed admin",
    createdAt: row.created_at ?? new Date().toISOString(),
    deactivatedAt: row.deactivated_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

function mapAuditRow(row: AdminActionApiRow): AuditAction {
  return {
    id: row.id,
    actorName: row.actor?.full_name ?? "Unknown admin",
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function mapMessageRow(row: AdminMessageApiRow): ConversationMessage {
  return {
    id: row.id,
    senderName: row.sender_name ?? "Unknown",
    body: row.body,
    createdAt: row.created_at,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function toAdminProfile(
  user: { id: string; email?: string; full_name: string | null; role: string | null },
  email: string,
): AdminProfile | null {
  if (!user.id || user.role !== "admin") return null;
  return { id: user.id, name: user.full_name ?? email, email: user.email ?? email };
}

export async function login(email: string, password: string): Promise<AdminProfile | null> {
  try {
    const res = await client.post<LoginApiResponse>("/auth/admin/login", { email, password });
    const profile = toAdminProfile(res.user, email);
    if (!profile || !res.csrf_token) return null;
    setAdminSession({ csrfToken: res.csrf_token, adminProfile: profile });
    return profile;
  } catch {
    return null;
  }
}

/** Re-establishes in-memory identity from the browser's cookie session. */
export async function restoreSession(): Promise<AdminProfile | null> {
  try {
    const res = await client.get<AdminSessionApiResponse>("/auth/admin/session");
    const profile = toAdminProfile(res.user, getAdminSession()?.adminProfile.email ?? "");
    if (!profile || !res.csrf_token) return null;
    setAdminSession({ csrfToken: res.csrf_token, adminProfile: profile });
    return profile;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await client.post("/auth/admin/logout");
  } catch {
    // best-effort — the in-memory session below is cleared regardless
  } finally {
    clearAdminSession();
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
    const session = getAdminSession();
    if (session) setAdminSession({ ...session, adminProfile: { ...session.adminProfile, name } });
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

/**
 * The admin's own `dark_mode` preference (migration 0011). This is the only
 * field on `/settings` with a real admin-console counterpart — the rest
 * (push/email/sms/location_sharing) belong to the mobile app's Settings
 * screen, so they aren't read or written here.
 */
export async function getDarkModePreference(): Promise<boolean | null> {
  try {
    const res = await client.get<UserSettingsApiResponse>("/settings");
    return res.dark_mode;
  } catch {
    return null;
  }
}

export async function updateDarkModePreference(darkMode: boolean): Promise<boolean> {
  try {
    await client.patch("/settings", { dark_mode: darkMode });
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /admin/maintenance (migration 0017) — the real, shared switch behind
 * Settings' "Maintenance Mode" toggle.
 *
 * Swallows failure and falls back to "off", matching getDarkModePreference
 * above: this is one of several calls in the initial-load Promise.all, and an
 * unguarded throw here (e.g. this route not existing yet on a backend that
 * hasn't been redeployed) would abort that whole batch and strand the
 * dashboard on "Loading dashboard…" forever, not just this one value.
 */
export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  try {
    const res = await client.get<MaintenanceApiResponse>("/admin/maintenance");
    return {
      enabled: res.maintenance_mode,
      message: res.maintenance_message,
      updatedAt: res.updated_at,
    };
  } catch {
    return { enabled: false, message: null, updatedAt: null };
  }
}

export async function setMaintenanceStatus(
  enabled: boolean,
  message?: string,
): Promise<MaintenanceStatus> {
  const res = await client.patch<MaintenanceApiResponse>("/admin/maintenance", {
    maintenance_mode: enabled,
    maintenance_message: message,
  });
  return {
    enabled: res.maintenance_mode,
    message: res.maintenance_message,
    updatedAt: res.updated_at,
  };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getUsers(status?: "deleted"): Promise<AdminUser[]> {
  const suffix = status ? `&status=${status}` : "";
  const res = await client.get<ListUsersApiResponse>(`/admin/users?limit=${LIST_PAGE_SIZE}${suffix}`);
  return res.users.map(mapUserRow);
}

export async function getVerifications(): Promise<Verification[]> {
  const res = await client.get<ListVerificationsApiResponse>(
    `/admin/verifications?limit=${LIST_PAGE_SIZE}`,
  );
  return res.verifications.map(mapVerificationRow);
}

/**
 * Escrow transactions, with overlapping callers sharing one request — same
 * in-flight dedup as getAnalyticsSummary below, and for the same reason.
 *
 * AppContext's initial load calls `getTransactions()` and `getDisputes()` in
 * the same Promise.all, and `getDisputes()` needs this list too (to fill in
 * provider names the disputes endpoint doesn't join). Without dedup that's two
 * identical `/admin/transactions?limit=200` round trips on every login and
 * every hard refresh — confirmed in a network capture before this was added.
 *
 * In-flight only, no TTL: once the batch settles the next call fetches fresh,
 * so a resolved dispute or released escrow never renders from a stale cache.
 */
let transactionsInFlight: Promise<Transaction[]> | null = null;

export async function getTransactions(): Promise<Transaction[]> {
  transactionsInFlight ??= client
    .get<ListTransactionsApiResponse>(`/admin/transactions?limit=${LIST_PAGE_SIZE}`)
    .then((res) => res.transactions.map(mapTransactionRow))
    .finally(() => {
      transactionsInFlight = null;
    });
  return transactionsInFlight;
}

export interface PageQuery {
  search: string;
  page: number;
  pageSize: number;
}

export interface SearchBookingsQuery extends PageQuery {
  status?: string;
}

export interface SearchTransactionsQuery extends PageQuery {
  status?: EscrowStatusApi;
}

function paginatedPath(path: string, query: PageQuery & { status?: string }): string {
  const params = new URLSearchParams();
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.status) params.set("status", query.status);
  params.set("limit", String(query.pageSize));
  params.set("offset", String((query.page - 1) * query.pageSize));
  return `${path}?${params}`;
}

export async function searchTransactions(query: SearchTransactionsQuery): Promise<{ items: Transaction[]; total: number }> {
  const res = await client.get<ListTransactionsApiResponse>(
    paginatedPath("/admin/transactions", query),
  );
  return { items: res.transactions.map(mapTransactionRow), total: res.total };
}

/** GET /admin/wallet-transactions (migration 0017) — the wallet ledger tab on
 *  the Transactions page, separate from escrow above. Fetched on demand when
 *  the tab is opened, not part of the initial page load. */
export async function getWalletTransactions(): Promise<WalletTransaction[]> {
  const res = await client.get<ListWalletTxnApiResponse>(
    `/admin/wallet-transactions?limit=${LIST_PAGE_SIZE}`,
  );
  return res.transactions.map(mapWalletTxnRow);
}

export async function getWithdrawals(status: "pending" | "completed" | "failed" = "pending"): Promise<{ items: AdminWithdrawal[]; total: number }> {
  const res = await client.get<ListWithdrawalsApiResponse>(`/admin/withdrawals?status=${status}&limit=100`);
  return { items: res.withdrawals.map(mapWithdrawalRow), total: res.total };
}

export async function settleWithdrawal(id: string, reference?: string): Promise<AdminWithdrawal> {
  const row = await client.post<AdminWithdrawalApiRow>(`/admin/withdrawals/${id}/settle`, reference?.trim() ? { reference: reference.trim() } : {});
  return mapWithdrawalRow(row);
}

export async function rejectWithdrawal(id: string, reason: string): Promise<AdminWithdrawal> {
  const row = await client.post<AdminWithdrawalApiRow>(`/admin/withdrawals/${id}/reject`, { reason: reason.trim() });
  return mapWithdrawalRow(row);
}

export async function getCategories(): Promise<ServiceCategory[]> {
  const rows = await client.get<CategoryApiRow[]>("/admin/categories");
  return rows.map(mapCategoryRow);
}

export async function createCategory(name: string): Promise<ServiceCategory> {
  return mapCategoryRow(await client.post<CategoryApiRow>("/admin/categories", { name: name.trim() }));
}

export async function updateCategory(id: number, patch: { name?: string; is_active?: boolean }): Promise<ServiceCategory> {
  return mapCategoryRow(await client.patch<CategoryApiRow>(`/admin/categories/${id}`, patch));
}

export async function getAdmins(): Promise<AdminAccount[]> {
  const rows = await client.get<AdminAccountApiRow[]>("/admin/admins");
  return rows.map(mapAdminRow);
}

export async function createAdmin(email: string, fullName: string): Promise<AdminAccount> {
  return mapAdminRow(await client.post<AdminAccountApiRow>("/admin/admins", { email: email.trim(), full_name: fullName.trim() }));
}

export async function revokeAdmin(id: string): Promise<AdminAccount> {
  return mapAdminRow(await client.post<AdminAccountApiRow>(`/admin/admins/${id}/revoke`));
}

export async function getCommission(): Promise<CommissionSettings> {
  const res = await client.get<CommissionApiResponse>("/admin/commission");
  return { rate: Number(res.commission_rate), updatedAt: res.updated_at };
}

export async function updateCommission(rate: number): Promise<CommissionSettings> {
  const res = await client.patch<CommissionApiResponse>("/admin/commission", { commission_rate: rate });
  return { rate: Number(res.commission_rate), updatedAt: res.updated_at };
}

export async function broadcastNotification(
  title: string,
  body: string,
  audience: "all" | "clients" | "providers",
): Promise<BroadcastApiResponse> {
  return client.post<BroadcastApiResponse>("/admin/notifications/broadcast", { title: title.trim(), body: body.trim(), audience });
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

export async function searchBookings(query: SearchBookingsQuery): Promise<{ items: AdminBooking[]; total: number }> {
  const res = await client.get<ListBookingsApiResponse>(
    paginatedPath("/admin/bookings", query),
  );
  return { items: res.bookings.map(mapBookingRow), total: res.total };
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
    totalCommission: summary.totals.total_commission ?? 0,
    monthlyCommission: summary.totals.monthly_commission ?? 0,
    pendingWithdrawals: summary.totals.pending_withdrawals ?? 0,
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

export async function searchActivity(query: PageQuery): Promise<{ items: ActivityEvent[]; total: number }> {
  const res = await client.get<ListActivityApiResponse>(paginatedPath("/admin/activity", query));
  return { items: mapActivity(res.items), total: res.total };
}

export async function getTopProviders(): Promise<TopProvider[]> {
  return mapTopProviders(await getAnalyticsSummary());
}

/** GET /admin/audit (migration 0014) — the real admin moderation trail. */
export async function getAuditLog(): Promise<AuditAction[]> {
  const { actions } = await client.get<ListAuditApiResponse>("/admin/audit?limit=100");
  return actions.map(mapAuditRow);
}

/** GET /admin/jobs/:jobId/conversation (migration 0014) — read-only, admins
 *  can never post into a user conversation. */
export async function getJobConversation(jobId: string): Promise<ConversationMessage[]> {
  const { messages } = await client.get<AdminConversationApiResponse>(
    `/admin/jobs/${jobId}/conversation`,
  );
  return messages.map(mapMessageRow);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function approveVerification(id: string): Promise<Verification[]> {
  await client.post(`/admin/verifications/${id}/approve`);
  return getVerifications();
}

export async function rejectVerification(id: string, reason?: string): Promise<Verification[]> {
  await client.post(`/admin/verifications/${id}/reject`, reason ? { reason } : undefined);
  return getVerifications();
}

/**
 * How many ids a bulk action actually changed. There is no bulk endpoint —
 * these fire the single-item endpoint per id in parallel, and one id failing
 * (the backend refusing to suspend an admin, say) must not abort the rest.
 * The count is returned rather than swallowed so the caller can tell the
 * admin "3 of 5 succeeded" instead of silently implying all 5 did.
 */
export interface BulkCounts {
  succeeded: number;
  failed: number;
}

export interface BulkResult<T> extends BulkCounts {
  rows: T[];
}

/** Runs `op` for every id, tolerating individual failures, and counts them. */
async function runBulk(ids: string[], op: (id: string) => Promise<unknown>) {
  const results = await Promise.all(ids.map((id) => op(id).then(() => true).catch(() => false)));
  const succeeded = results.filter(Boolean).length;
  return { succeeded, failed: results.length - succeeded };
}

export async function bulkApproveVerifications(ids: string[]): Promise<BulkResult<Verification>> {
  const { succeeded, failed } = await runBulk(ids, (id) =>
    client.post(`/admin/verifications/${id}/approve`),
  );
  return { rows: await getVerifications(), succeeded, failed };
}

export async function bulkRejectVerifications(
  ids: string[],
  reason?: string,
): Promise<BulkResult<Verification>> {
  const { succeeded, failed } = await runBulk(ids, (id) =>
    client.post(`/admin/verifications/${id}/reject`, reason ? { reason } : undefined),
  );
  return { rows: await getVerifications(), succeeded, failed };
}

/** Backend migration 0014 made `reason` required on suspend — omitted only
 *  when reinstating, which takes no body. */
export interface SuspendOptions {
  reason: string;
  durationDays?: number;
}

export async function setUserStatus(
  id: string,
  status: UserStatus,
  suspend?: SuspendOptions,
): Promise<AdminUser[]> {
  if (status === "SUSPENDED") {
    await client.post(`/admin/users/${id}/suspend`, {
      reason: suspend?.reason ?? "",
      duration_days: suspend?.durationDays,
    });
  } else {
    await client.post(`/admin/users/${id}/reinstate`);
  }
  return getUsers();
}

/**
 * No bulk endpoint exists — fires the existing single-user endpoint per id in
 * parallel. A per-id failure (e.g. the backend refuses to suspend an admin)
 * doesn't abort the rest: the final refetch reflects exactly what actually
 * changed, and the counts let the caller say how many didn't.
 */
export async function bulkSetUserStatus(
  ids: string[],
  status: UserStatus,
  suspend?: SuspendOptions,
): Promise<BulkResult<AdminUser>> {
  const { succeeded, failed } = await runBulk(ids, (id) =>
    status === "SUSPENDED"
      ? client.post(`/admin/users/${id}/suspend`, {
          reason: suspend?.reason ?? "",
          duration_days: suspend?.durationDays,
        })
      : client.post(`/admin/users/${id}/reinstate`),
  );
  return { rows: await getUsers(), succeeded, failed };
}

export async function sendPasswordReset(id: string): Promise<boolean> {
  try {
    await client.post(`/admin/users/${id}/send-password-reset`);
    return true;
  } catch {
    return false;
  }
}

export async function cancelBooking(id: string): Promise<AdminBooking[]> {
  await client.post(`/admin/bookings/${id}/cancel`);
  return getBookings();
}

/** GET /admin/bookings/:id (migration 0014) — fetched on demand when a row
 *  is expanded, not part of the list load. */
export async function getBookingDetail(id: string): Promise<AdminBookingDetail> {
  const row = await client.get<AdminBookingDetailApiResponse>(`/admin/bookings/${id}`);
  return {
    description: row.description,
    address: row.address,
    scheduledAt: row.scheduled_at,
    photoUrls: row.photo_urls ?? [],
    escrowStatus: row.escrow ? TRANSACTION_STATUS[row.escrow.status] : null,
    escrowAmount: row.escrow ? Number(row.escrow.amount) : null,
  };
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
