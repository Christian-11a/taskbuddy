"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import * as services from "@/lib/services";
import type { QueueCounts } from "@/lib/attention";
import { resolveInitialTheme } from "@/lib/theme";
import {
  toDisputeRow,
  toUserRow,
  toVerificationRow,
  type DisputeRow,
  type BookingRow,
  type TransactionRow,
  type UserRow,
  type VerificationRow,
} from "@/lib/adapters";
import type {
  ActivityEvent,
  AdminUser,
  CategoryShare,
  DashboardStats,
  Dispute,
  DisputeResolution,
  MonthlyPoint,
  TopProvider,
  UserStatus,
  Verification,
} from "@/lib/domain";

// ─── Preferences (persisted to localStorage) ──────────────────────────────────

export interface ConsoleSettings {
  activityBadge: boolean;
  /** A small toast when new work arrives while the console is open (this device only). */
  arrivalAlerts: boolean;
  /** Masks names, emails and phone numbers in CSV exports (this device only). */
  anonymizeExports: boolean;
  platformName: string;
}

const DEFAULT_SETTINGS: ConsoleSettings = {
  activityBadge: true,
  arrivalAlerts: true,
  anonymizeExports: true,
  platformName: "TaskBuddy",
};

const PREFS_KEY = "tb-admin-prefs";
/** The automatic refresh waits this long after any load finished (the tick and a tab return can fire together). */
const LIVE_QUIET_MS = 5_000;
/** An automatic refresh is not held back by a silent refresh still running after this long: a request that never answers must not stop the live feed. */
const LIVE_STUCK_MS = 30_000;

interface StoredPrefs {
  darkMode: boolean;
  sidebarCollapsed: boolean;
  settings: ConsoleSettings;
}

/** Reads persisted prefs once per page load (SSR-safe: null on the server,
 *  which is fine — none of these values render before login, a client-only
 *  state, so server and client HTML stay identical). */
let storedPrefsCache: Partial<StoredPrefs> | null | undefined;
function loadStoredPrefs(): Partial<StoredPrefs> | null {
  if (typeof window === "undefined") return null;
  if (storedPrefsCache !== undefined) return storedPrefsCache;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    storedPrefsCache = raw ? (JSON.parse(raw) as Partial<StoredPrefs>) : null;
  } catch {
    storedPrefsCache = null; // corrupted prefs — fall back to defaults
  }
  return storedPrefsCache;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface AdminProfile {
  id: string;
  name: string;
  email: string;
}

interface AppState {
  // session
  isLoggedIn: boolean;
  /**
   * False until the stored session has been checked after mount. Routes gate
   * on this before redirecting: without it, every protected page would bounce
   * to /login for one render on a hard refresh, because `isLoggedIn` starts
   * false on the server and stays false until the effect below runs.
   */
  sessionRestored: boolean;
  /**
   * True when the server ended a signed-in session (a 401/403 on the console's
   * own reads), as opposed to an explicit sign-out. The login page explains it.
   * Cleared by the next sign-in or sign-out. Optional so that hand-built
   * fixtures (the dev preview) need not set it.
   */
  sessionEnded?: boolean;
  adminProfile: AdminProfile;
  login: (email: string, password: string) => Promise<services.LoginResult>;
  logout: () => void;
  updateDisplayName: (name: string) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<boolean>;

  // data (display rows — adapters applied)
  /** True while a core list (disputes, verifications, activity or settings) of the console load has not answered yet. A page that shows one list reads that list's own flag. */
  loading: boolean;
  /** Non-null when a console read failed for a reason other than an expired session (which redirects to /login instead). A later load that reads every core part clears it. */
  loadError: string | null;
  /** Per-part readiness of the console load. Each clears the moment its own request answers, so a page waits only on the parts it shows. */
  disputesLoading: boolean;
  verificationsLoading: boolean;
  activityLoading: boolean;
  /** Maintenance mode and the saved dark-mode preference. */
  settingsLoading: boolean;
  /** Dashboard analytics: stats, series, top providers and categories. */
  analyticsLoading: boolean;
  /** The payout and service-request counts. */
  countsLoading: boolean;
  /** Re-runs the initial data load — wired to the error banner's Retry. */
  retryLoad: () => void;
  /** Quietly re-fetches console data (no loading state). Always runs: explicit callers (Refresh now, the Live retry, after a write) use it. */
  refreshData: () => Promise<void>;
  /** The automatic live refresh (the tick and the return-to-tab refresh). Skips while a silent refresh is still
   *  running and for a few seconds after a load finished, so the two triggers never stack up. */
  refreshLive: () => Promise<void>;
  /** Re-reads only the payout and service-request counts (two small requests).
   *  Never rejects: a failed read keeps the last good value. Call it after an
   *  admin action that changes a queue, fire-and-forget. */
  refreshCounts: () => Promise<void>;
  /** Reloads the Users list; rejects on failure so retries cannot imply success. */
  refreshUsers: () => Promise<void>;
  /**
   * Makes sure the Users list is loaded and no older than `maxAgeMs`. Returns at
   * once: a fresh list is left alone, while a missing or older one is re-read in
   * the background. Pages show their loading state from `usersLoading`.
   */
  ensureUsers: (options?: { maxAgeMs?: number }) => void;
  /** True while the Users list is being read. It loads alongside the console, not after it. */
  usersLoading: boolean;
  /** When console data last loaded successfully (epoch ms), for "updated Ns ago". */
  lastUpdated: number | null;
  /** True while a silent refresh is in flight. */
  refreshing: boolean;
  /** True when the last silent refresh failed (the rows on screen are the last good ones).
   *  Cleared by the next successful load. Shown by the Live indicator. */
  refreshFailed: boolean;
  /** True when the analytics endpoint failed while the rest of the console loaded. */
  analyticsUnavailable: boolean;
  /** True while analytics are rebuilt in the browser because
   *  /admin/analytics/summary is failing (see lib/services/browserAnalytics). */
  analyticsInBrowser: boolean;
  verifications: VerificationRow[];
  users: UserRow[];
  /** Search pages load these from their own paginated backend queries. */
  transactions: TransactionRow[];
  disputes: DisputeRow[];
  bookings: BookingRow[];
  dashboardStats: DashboardStats | null;
  revenueSeries: MonthlyPoint[];
  bookingsSeries: MonthlyPoint[];
  bookingsByCategory: CategoryShare[];
  recentActivity: ActivityEvent[];
  topProviders: TopProvider[];
  /** Pending items per work queue (the bell, sidebar badges and tab title use these).
   *  A queue whose count failed to load keeps its last good value, or is null. */
  queueCounts: QueueCounts;

  // mutations
  approveVerification: (id: string) => Promise<void>;
  rejectVerification: (id: string, reason?: string) => Promise<void>;
  setUserStatus: (id: string, status: "Active" | "Suspended", suspend?: services.SuspendOptions) => Promise<{ refreshFailed?: boolean }>;
  bulkSetUserStatus: (ids: string[], status: "Active" | "Suspended", suspend?: services.SuspendOptions) => Promise<services.BulkCounts & { refreshFailed?: boolean }>;
  sendPasswordReset: (id: string) => Promise<boolean>;
  cancelBooking: (id: string) => Promise<void>;
  resolveDispute: (id: string, resolution: DisputeResolution, note?: string) => Promise<void>;

  // preferences
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (val: boolean) => void;
  settings: ConsoleSettings;
  updateSettings: (patch: Partial<ConsoleSettings>) => void;

  // platform-wide (migration 0015) — real, shared across every admin, unlike
  // the localStorage-only settings above.
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  setMaintenanceMode: (enabled: boolean, message?: string) => Promise<boolean>;
}

const AppContext = createContext<AppState | null>(null);

/**
 * Dev-only: lets /dev/admin-preview render the real shell and pages against
 * sample data without a backend or a session. Not used by the app itself.
 */
export const AppContextForPreview = AppContext;
export type { AppState };

const STATUS_TO_DOMAIN: Record<"Active" | "Suspended", UserStatus> = {
  Active: "ACTIVE",
  Suspended: "SUSPENDED",
};

/**
 * Reads the two count-only queues. Each side succeeds or fails on its own, and
 * a failed side comes back `undefined` so the caller keeps what it had. Never
 * rejects.
 */
async function readCountOnlyQueues(): Promise<{ withdrawals?: number; "skill-requests"?: number }> {
  const [withdrawals, requests] = await Promise.allSettled([
    services.getPendingWithdrawalCount(),
    services.getPendingServiceRequestCount(),
  ]);
  return {
    withdrawals: withdrawals.status === "fulfilled" && typeof withdrawals.value === "number" ? withdrawals.value : undefined,
    "skill-requests": requests.status === "fulfilled" && typeof requests.value === "number" ? requests.value : undefined,
  };
}

/**
 * The live tick reads only the pending verifications. A decided row never goes
 * back to pending on the server, so the decided rows already held stay exact.
 * A row that was pending here but has left the queue was decided elsewhere, and
 * only the full list carries its new status, so that case reads the full list.
 * So does a console that never read the full list (`cached` is null).
 */
async function readVerificationsForTick(cached: Verification[] | null): Promise<Verification[]> {
  if (cached === null) return services.getVerifications();
  const pending = [...new Map((await services.getPendingVerifications()).map((v) => [v.id, v] as const)).values()];
  const pendingIds = new Set(pending.map((v) => v.id));
  if (cached.some((v) => v.status === "PENDING" && !pendingIds.has(v.id))) return services.getVerifications();
  const decided = cached.filter((v) => v.status !== "PENDING" && !pendingIds.has(v.id));
  return [...pending, ...decided].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

/**
 * Follow-up reads after a write that already succeeded. A failure here is
 * logged and otherwise ignored: the write did happen, so the admin must not be
 * told it failed.
 */
async function settleFollowUpReads(what: string, reads: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(reads);
  for (const result of results) {
    if (result.status === "rejected") console.warn(`Refreshing after ${what} failed; the change itself was saved.`, result.reason);
  }
}

/** The parts of a console load. Each is applied the moment its own request answers (see loadConsoleData). */
type LoadPart = "verifications" | "disputes" | "activity" | "settings" | "analytics" | "counts";
/** How one part of a load ended. Every part resolves to one of these and never rejects. */
type PartOutcome = "ok" | "failed" | "superseded" | "session-ended";

/** A 401/403 on one of the console's own reads: the server ended the session. */
function isSessionEnd(err: unknown): boolean {
  return err instanceof services.ApiError && (err.status === 401 || err.status === 403);
}

/** The banner text for a console read that failed for a reason other than an ended session. */
function loadFailureMessage(err: unknown): string {
  return err instanceof services.ApiError
    ? `Could not load console data (${err.status}).`
    : "Could not reach the backend.";
}

export function AppProvider({ children }: { children: ReactNode }) {
  // session — unlike loadStoredPrefs() below (which only ever affects
  // className/style, not which branch renders), isLoggedIn gates whether a
  // protected route renders at all. Resolving it from localStorage during the
  // initial render would make the server (always logged-out) and the client's
  // first render (logged-in, if a session exists) produce different trees — a
  // hydration mismatch. So both start logged-out, and a real session is
  // restored after mount instead (see the effect below). `sessionRestored`
  // tells routes when that check has finished, so they don't redirect on the
  // strength of a not-yet-restored session.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminProfile>({
    id: "",
    name: "Super Admin",
    email: "admin@taskbuddy.io",
  });

  useEffect(() => {
    void services.restoreSession().then((session) => {
      if (session) {
        setAdminProfile(session);
        setIsLoggedIn(true);
      }
      setSessionRestored(true);
    });
  }, []);

  // domain data
  // One readiness flag per part of the console load. Each clears as its own request answers (see settlePart).
  const [disputesLoading, setDisputesLoading] = useState(true);
  const [verificationsLoading, setVerificationsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  /** The banner's error: the core read's failure first, else the Users read's. Set from the two refs below by publishLoadError. */
  const [loadError, setLoadErrorState] = useState<string | null>(null);
  /** A core read's failure (see loadConsoleData). Kept apart from the Users read's, so a core success never clears that one. */
  const coreLoadErrorRef = useRef<string | null>(null);
  /** A Users read's failure, while no list has loaded (see fetchUsers). */
  const usersLoadErrorRef = useRef<string | null>(null);
  const publishLoadError = useCallback(() => {
    setLoadErrorState(coreLoadErrorRef.current ?? usersLoadErrorRef.current);
  }, []);
  const [analyticsUnavailable, setAnalyticsUnavailable] = useState(false);
  const [analyticsInBrowser, setAnalyticsInBrowser] = useState(false);
  /** Bumped by retryLoad() to re-run the initial-load effect. */
  const [reloadNonce, setReloadNonce] = useState(0);
  const [domainUsers, setDomainUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [domainVerifications, setDomainVerifications] = useState<Verification[]>([]);
  /** The full verifications list as last applied; null until a full read has succeeded. The live tick merges against it. */
  const verificationsRef = useRef<Verification[] | null>(null);
  const applyVerifications = useCallback((rows: Verification[]) => {
    verificationsRef.current = rows;
    setDomainVerifications(rows);
  }, []);
  const [domainDisputes, setDomainDisputes] = useState<Dispute[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<MonthlyPoint[]>([]);
  const [bookingsSeries, setBookingsSeries] = useState<MonthlyPoint[]>([]);
  const [bookingsByCategory, setBookingsByCategory] = useState<CategoryShare[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [topProviders, setTopProviders] = useState<TopProvider[]>([]);
  /** Withdrawal and service-request counts; the other two queues derive from the lists above. */
  const [extraCounts, setExtraCounts] = useState<Pick<QueueCounts, "withdrawals" | "skill-requests">>({
    withdrawals: null,
    "skill-requests": null,
  });
  const [maintenanceMode, setMaintenanceModeState] = useState(false);
  const [maintenanceMessage, setMaintenanceMessageState] = useState<string | null>(null);

  /** Marks one part of the console load as answered. */
  const settlePart = useCallback((part: LoadPart) => {
    switch (part) {
      case "verifications": setVerificationsLoading(false); return;
      case "disputes": setDisputesLoading(false); return;
      case "activity": setActivityLoading(false); return;
      case "settings": setSettingsLoading(false); return;
      case "analytics": setAnalyticsLoading(false); return;
      case "counts": setCountsLoading(false); return;
    }
  }, []);
  /** Sets every part's flag: true when a console load starts, false when the session ends. */
  const setAllPartsLoading = useCallback((isLoading: boolean) => {
    setVerificationsLoading(isLoading);
    setDisputesLoading(isLoading);
    setActivityLoading(isLoading);
    setSettingsLoading(isLoading);
    setAnalyticsLoading(isLoading);
    setCountsLoading(isLoading);
  }, []);

  // preferences — lazily hydrated from localStorage on the client
  // First run is light, whatever the OS prefers. A saved preference still wins,
  // and the account's server preference is applied after the admin session/data
  // restore.
  const [darkMode, setDarkModeState] = useState(() => resolveInitialTheme(loadStoredPrefs()?.darkMode));
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    () => loadStoredPrefs()?.sidebarCollapsed ?? false,
  );
  const [settings, setSettings] = useState<ConsoleSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadStoredPrefs()?.settings,
  }));

  // ── console data: initial load, Retry, and silent live refresh ──
  /**
   * The loader behind all three (see loadConsoleData). Only the newest load may
   * write state (`loadSeq`), so an older read that answers late is dropped.
   */
  const loadSeq = useRef(0);
  // Counts successful maintenance toggles, so a load can tell its maintenance read predates one.
  const maintenanceWrites = useRef(0);
  // True while a full (non-silent) load is running. A silent refresh never
  // starts then: it would supersede the full load, which alone clears
  // `loading` (a Render cold start easily outlasts the 30s refresh interval).
  const fullLoadInFlight = useRef(false);
  /** The newest silent refresh that has started and not yet finished, with its start time (see refreshLive). */
  const liveRefreshPending = useRef<{ seq: number; startedAt: number } | null>(null);
  /** When the last console load of any kind finished (epoch ms; 0 before the first). See refreshLive. */
  const lastLoadEndedAt = useRef(0);
  /** Called when a mutation writes fresh rows: any refresh already in flight
   *  fetched before the change landed, so its snapshot must not win. */
  const dropInFlightRefresh = useCallback(() => {
    if (!fullLoadInFlight.current) loadSeq.current += 1;
  }, []);
  // The Users list is read apart from the console load (see fetchUsers below).
  // usersSeq drops a read that a newer read or a write to the list has overtaken.
  const usersSeq = useRef(0);
  const usersFetching = useRef(false);
  /** When the Users list last loaded (epoch ms); null until it has. */
  const usersLoadedAt = useRef<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  /** A Users read that started before a write to the list must not land after it. */
  const dropInFlightUsers = useCallback(() => {
    usersSeq.current += 1;
    usersFetching.current = false;
    setUsersLoading(false);
  }, []);

  const markUsersFresh = useCallback(() => {
    usersLoadedAt.current = Date.now();
    // A list with fresh rows has no load error left to show.
    usersLoadErrorRef.current = null;
    publishLoadError();
  }, [publishLoadError]);

  /**
   * Reads the Users list: active and suspended accounts, plus the deleted ones
   * when the deployed API supports that filter. It is the largest read the
   * console makes, so it stays off the 30 s live tick: it starts with each full
   * console load (alongside the other reads), and again whenever a page asks for
   * it (see ensureUsers).
   */
  const fetchUsers = useCallback(async (): Promise<void> => {
    const seq = ++usersSeq.current;
    usersFetching.current = true;
    setUsersLoading(true);
    try {
      const [rows, deletedRows] = await Promise.all([
        services.getUsers(),
        // Deleted accounts are an opt-in enhancement. If the deployed API
        // predates the status filter, keep the rest of the console usable.
        // null (not []) marks a failed read, so the deleted rows already shown survive it.
        services.getUsers("deleted").catch(() => null),
      ]);
      if (seq !== usersSeq.current) return;
      setDomainUsers((prev) => [...rows, ...(deletedRows ?? prev.filter((user) => user.status === "DELETED"))]);
      markUsersFresh();
    } catch (err) {
      if (seq !== usersSeq.current) return;
      if (isSessionEnd(err)) {
        setIsLoggedIn(false);
        setSessionEnded(true);
      } else if (usersLoadedAt.current === null) {
        // Nothing is on screen to keep, so say so, as a failed console load does.
        usersLoadErrorRef.current = loadFailureMessage(err);
        publishLoadError();
      } else {
        // A failed re-read keeps the last good list, and the Live indicator says so.
        setRefreshFailed(true);
      }
    } finally {
      if (seq === usersSeq.current) {
        usersFetching.current = false;
        setUsersLoading(false);
      }
    }
  }, [markUsersFresh, publishLoadError]);

  /** Replaces the active and suspended rows after a write, keeping the deleted accounts already loaded. */
  const applyUserRows = useCallback((rows: AdminUser[]) => {
    setDomainUsers((prev) => [...rows, ...prev.filter((user) => user.status === "DELETED")]);
    markUsersFresh();
  }, [markUsersFresh]);

  /**
   * Loads the console. Every read goes out together, and each part is applied as
   * its own request answers, so a page shows what has arrived without waiting for
   * the slowest read. Each part is guarded by `stale()`. `silent` is the
   * background refresh behind the "Live" indicator: it never raises the per-part
   * flags (no skeleton flash), keeps the last good data when a read fails (a blip
   * must not blank the console or raise the error banner), never overrides the
   * theme the admin may have just toggled, and never reads the Users list.
   */
  const loadConsoleData = useCallback(async (silent: boolean) => {
    if (silent && fullLoadInFlight.current) return;
    if (!silent) fullLoadInFlight.current = true;
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    const maintenanceWritesAtStart = maintenanceWrites.current;
    if (silent) {
      liveRefreshPending.current = { seq, startedAt: Date.now() };
      setRefreshing(true);
    } else {
      setAllPartsLoading(true);
      coreLoadErrorRef.current = null;
      usersLoadErrorRef.current = null;
      publishLoadError();
      setAnalyticsUnavailable(false);
      // The Users list reads alongside the console, not after it. A read that is already running is shared, not repeated.
      if (!usersFetching.current) void fetchUsers();
    }

    /**
     * One part of the load: applies its result the moment its request answers,
     * unless a newer load has started. On a real load a failure is reported
     * through `onFailure` straight away, so its banner does not wait for the
     * other parts. Never rejects.
     */
    const settle = async <T,>(
      part: LoadPart,
      read: Promise<T>,
      apply: (value: T) => void,
      onFailure: (err: unknown) => void,
    ): Promise<PartOutcome> => {
      try {
        const value = await read;
        if (stale()) return "superseded";
        apply(value);
        settlePart(part);
        return "ok";
      } catch (err) {
        if (stale()) return "superseded";
        settlePart(part);
        if (isSessionEnd(err)) {
          setIsLoggedIn(false);
          setSessionEnded(true);
          return "session-ended";
        }
        if (!silent) onFailure(err);
        return "failed";
      }
    };

    // Every request starts here, before any is awaited. The live tick reads only the pending verifications and merges
    // them with what it holds (see readVerificationsForTick). It skips the saved dark-mode preference too, which is
    // applied on the real load only.
    const verificationsRead = silent ? readVerificationsForTick(verificationsRef.current) : services.getVerifications();
    const disputesRead = services.getDisputes();
    const activityRead = services.getRecentActivity();
    const settingsRead = Promise.all([
      services.getMaintenanceStatus(),
      silent ? Promise.resolve(null) : services.getDarkModePreference(),
    ]);
    // These values all depend on /admin/analytics/summary, which the five reads share (see getAnalyticsSummary).
    const analyticsRead = Promise.all([
      services.getDashboardStats(),
      services.getRevenueSeries(),
      services.getBookingsSeries(),
      services.getBookingsByCategory(),
      services.getTopProviders(),
    ]);
    // Started alongside the others so the two extra counts add no round trip. Never rejects (see readCountOnlyQueues).
    const countsRead = readCountOnlyQueues();
    const coreFailure = (err: unknown) => {
      coreLoadErrorRef.current = loadFailureMessage(err);
      publishLoadError();
    };

    const outcomes = Promise.all([
      settle("verifications", verificationsRead, applyVerifications, coreFailure),
      settle("disputes", disputesRead, setDomainDisputes, coreFailure),
      settle("activity", activityRead, setRecentActivity, coreFailure),
      settle("settings", settingsRead, ([maintenance, serverDarkMode]) => {
        // The account's saved preference wins over whatever this device had cached, so dark mode follows the admin
        // across devices. Applied on the real load only, so a background refresh cannot undo a fresh toggle.
        if (!silent && serverDarkMode !== null) setDarkModeState(serverDarkMode);
        // A toggle that landed after this load started wins over its read, which may predate the write.
        if (maintenanceWrites.current === maintenanceWritesAtStart) {
          setMaintenanceModeState(maintenance.enabled);
          setMaintenanceMessageState(maintenance.message);
        }
      }, coreFailure),
      settle("analytics", analyticsRead, ([stats, revenue, bookVol, categories, providers]) => {
        setDashboardStats(stats);
        setRevenueSeries(revenue);
        setBookingsSeries(bookVol);
        setBookingsByCategory(categories);
        setTopProviders(providers);
        setAnalyticsUnavailable(false);
        setAnalyticsInBrowser(services.lastAnalyticsSource() === "browser");
      }, () => {
        // Do not leave stale or empty arrays looking like real zero-valued analytics. The affected pages render an
        // explicit retry state.
        setDashboardStats(null);
        setRevenueSeries([]);
        setBookingsSeries([]);
        setBookingsByCategory([]);
        setTopProviders([]);
        setAnalyticsUnavailable(true);
      }),
      settle("counts", countsRead, (reads) => {
        setExtraCounts((prev) => ({
          withdrawals: reads.withdrawals ?? prev.withdrawals,
          "skill-requests": reads["skill-requests"] ?? prev["skill-requests"],
        }));
      }, () => {}),
    ]);

    try {
      const [verificationsDone, disputesDone, activityDone, settingsDone, analyticsDone, countsDone] = await outcomes;
      const results = [verificationsDone, disputesDone, activityDone, settingsDone, analyticsDone, countsDone];
      // A newer load owns the state now, and an ended session has nothing left to stamp or clear.
      if (stale() || results.includes("session-ended")) return;
      // The four core parts are what the lists on screen are built from. The load is a success only when all of them answered.
      const coreOk = [verificationsDone, disputesDone, activityDone, settingsDone].every((outcome) => outcome === "ok");
      if (coreOk) {
        coreLoadErrorRef.current = null;
        publishLoadError();
        setLastUpdated(Date.now());
        // The Users list never loaded (its first read failed). The live tick retries it.
        if (silent && usersLoadedAt.current === null && !usersFetching.current) void fetchUsers();
      }
      // A silent refresh that lost a read kept the last good figures, so the Live indicator says so.
      setRefreshFailed(silent && results.includes("failed"));
    } finally {
      lastLoadEndedAt.current = Date.now();
      if (silent) {
        // Only the newest silent refresh owns the indicator: an older one that finishes later must not clear it.
        if (liveRefreshPending.current?.seq === seq) {
          liveRefreshPending.current = null;
          setRefreshing(false);
        }
      } else if (!stale()) fullLoadInFlight.current = false;
    }
  }, [fetchUsers, applyVerifications, settlePart, setAllPartsLoading, publishLoadError]);

  /* eslint-disable react-hooks/set-state-in-effect --
     Fetching on mount is the other documented exception: the backend is an
     external system, and a loading flag has to be flipped somewhere. Every
     setState that carries fetched data already happens in an async
     continuation, guarded by `loadSeq`. */
  useEffect(() => {
    if (!isLoggedIn) {
      setAllPartsLoading(false);
      dropInFlightUsers();
      usersLoadedAt.current = null; // the next sign-in reads its own list
      return;
    }
    void loadConsoleData(false);
    return () => {
      loadSeq.current += 1; // drop the in-flight load's results
      usersSeq.current += 1; // and any Users read it started
      usersFetching.current = false;
    };
  }, [isLoggedIn, reloadNonce, loadConsoleData, dropInFlightUsers, setAllPartsLoading]);

  /** Starts a Users read unless one is already running or the cached list is younger than `maxAgeMs`. */
  const ensureUsers = useCallback(
    (options: { maxAgeMs?: number } = {}) => {
      if (!isLoggedIn || usersFetching.current) return;
      const loadedAt = usersLoadedAt.current;
      if (loadedAt !== null && Date.now() - loadedAt < (options.maxAgeMs ?? 0)) return;
      void fetchUsers();
    },
    [isLoggedIn, fetchUsers],
  );
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Explicit background refresh: the Live indicator's click, the palette command, and reads after a write. Never skipped. */
  const refreshData = useCallback(
    () => (isLoggedIn ? loadConsoleData(true) : Promise.resolve()),
    [isLoggedIn, loadConsoleData],
  );

  /** Automatic refresh for the live tick and the return-to-tab trigger (see useLiveRefresh). */
  const refreshLive = useCallback(() => {
    if (!isLoggedIn) return Promise.resolve();
    const now = Date.now();
    const pending = liveRefreshPending.current;
    if (pending && now - pending.startedAt < LIVE_STUCK_MS) return Promise.resolve();
    if (now - lastLoadEndedAt.current < LIVE_QUIET_MS) return Promise.resolve();
    return loadConsoleData(true);
  }, [isLoggedIn, loadConsoleData]);

  /** Newest count read wins; an older read that finishes later is dropped. */
  const countsSeq = useRef(0);
  /**
   * Cheap follow-up to an admin action: re-reads only the payout and
   * service-request counts. It reads `loadSeq` but never bumps it, so it cannot
   * cancel an in-flight console load. A read that started before any later load
   * or mutation (which bumps `loadSeq`) is dropped, since that snapshot is fresher.
   */
  const refreshCounts = useCallback(async () => {
    if (!isLoggedIn) return;
    const loadAtStart = loadSeq.current;
    const mine = ++countsSeq.current;
    const reads = await readCountOnlyQueues();
    if (loadAtStart !== loadSeq.current || mine !== countsSeq.current) return;
    setExtraCounts((prev) => ({
      withdrawals: reads.withdrawals ?? prev.withdrawals,
      "skill-requests": reads["skill-requests"] ?? prev["skill-requests"],
    }));
  }, [isLoggedIn]);

  // ── preferences: persist on change ──
  useEffect(() => {
    const prefs: StoredPrefs = { darkMode, sidebarCollapsed, settings };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [darkMode, sidebarCollapsed, settings]);

  // apply theme attribute whenever darkMode changes (and on first hydrate)
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // ── session ──
  const login = useCallback(async (email: string, password: string) => {
    const result = await services.loginDetailed(email, password);
    if (result.ok) {
      setAdminProfile(result.profile);
      setSessionEnded(false);
      setIsLoggedIn(true);
    }
    return result;
  }, []);

  /** The admin layout's auth gate sends the browser to /login once this flips. */
  const logout = useCallback(() => {
    void services.logout();
    setSessionEnded(false);
    setIsLoggedIn(false);
  }, []);

  /** Persists the display name to the backend, then mirrors it locally.
   *  Email isn't settable — it lives on auth.users with no endpoint to change it. */
  const updateDisplayName = useCallback(async (name: string) => {
    const ok = await services.updateDisplayName(name);
    if (ok) setAdminProfile((prev) => ({ ...prev, name }));
    return ok;
  }, []);

  const changePassword = useCallback(
    (current: string, next: string) => services.changePassword(current, next),
    [],
  );

  // ── mutations (update domain state from the service's response) ──
  const retryLoad = useCallback(() => setReloadNonce((n) => n + 1), []);

  const refreshStats = useCallback(async () => {
    // A decision just changed the numbers; don't serve the cached stand-in.
    services.invalidateBrowserAnalytics();
    try {
      const [stats, revenue, bookVol, categories, providers] = await Promise.all([
        services.getDashboardStats(),
        services.getRevenueSeries(),
        services.getBookingsSeries(),
        services.getBookingsByCategory(),
        services.getTopProviders(),
      ]);
      setDashboardStats(stats);
      setRevenueSeries(revenue);
      setBookingsSeries(bookVol);
      setBookingsByCategory(categories);
      setTopProviders(providers);
      setAnalyticsUnavailable(false);
    } catch (err) {
      if (err instanceof services.ApiError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      // The mutation may already have succeeded; a failed analytics refresh
      // must not make the UI report that the mutation itself failed.
      setDashboardStats(null);
      setRevenueSeries([]);
      setBookingsSeries([]);
      setBookingsByCategory([]);
      setTopProviders([]);
      setAnalyticsUnavailable(true);
    }
  }, []);

  // Only the write decides success. The list and summary reads that follow it
  // are best-effort: if they fail, the decision still stands.
  const approveVerification = useCallback(
    async (id: string) => {
      await services.postApproveVerification(id);
      dropInFlightRefresh();
      await settleFollowUpReads("verification approval", [
        services.getVerifications().then(applyVerifications),
        refreshStats(),
      ]);
    },
    [refreshStats, dropInFlightRefresh, applyVerifications],
  );

  const rejectVerification = useCallback(
    async (id: string, reason?: string) => {
      await services.postRejectVerification(id, reason);
      dropInFlightRefresh();
      await settleFollowUpReads("verification rejection", [
        services.getVerifications().then(applyVerifications),
        refreshStats(),
      ]);
    },
    [refreshStats, dropInFlightRefresh, applyVerifications],
  );

  const setUserStatus = useCallback(
    async (id: string, status: "Active" | "Suspended", suspend?: services.SuspendOptions) => {
      const { rows, refreshFailed } = await services.setUserStatus(id, STATUS_TO_DOMAIN[status], suspend);
      dropInFlightRefresh();
      dropInFlightUsers();
      if (rows !== null) applyUserRows(rows);
      return { refreshFailed };
    },
    [dropInFlightRefresh, dropInFlightUsers, applyUserRows],
  );

  const bulkSetUserStatus = useCallback(
    async (ids: string[], status: "Active" | "Suspended", suspend?: services.SuspendOptions) => {
      const { rows, ...counts } = await services.bulkSetUserStatus(ids, STATUS_TO_DOMAIN[status], suspend);
      dropInFlightRefresh();
      dropInFlightUsers();
      if (rows !== null) applyUserRows(rows);
      return counts;
    },
    [dropInFlightRefresh, dropInFlightUsers, applyUserRows],
  );

  const refreshUsers = useCallback(async () => {
    // Drop earlier console snapshots before requesting the authoritative list.
    dropInFlightRefresh();
    dropInFlightUsers();
    const [rows, deletedRows] = await Promise.all([
      services.getUsers(),
      services.getUsers("deleted"),
    ]);
    setDomainUsers([...rows, ...deletedRows]);
    markUsersFresh();
  }, [dropInFlightRefresh, dropInFlightUsers, markUsersFresh]);

  const sendPasswordReset = useCallback((id: string) => services.sendPasswordReset(id), []);

  // The bookings list is not held in this context (its pages query directly),
  // so a cancel has no list to re-read here.
  const cancelBooking = useCallback(async (id: string) => {
    await services.postCancelBooking(id);
  }, []);

  const resolveDispute = useCallback(
    async (id: string, resolution: DisputeResolution, note?: string) => {
      await services.postResolveDispute(id, resolution, note);
      dropInFlightRefresh();
      await settleFollowUpReads("dispute decision", [services.getDisputes().then(setDomainDisputes)]);
    },
    [dropInFlightRefresh],
  );

  // ── preferences setters ──
  const setDarkMode = useCallback((val: boolean) => {
    setDarkModeState(val);
    void services.updateDarkModePreference(val);
  }, []);
  const setSidebarCollapsed = useCallback((val: boolean) => setSidebarCollapsedState(val), []);
  const updateSettings = useCallback(
    (patch: Partial<ConsoleSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  /** Returns whether the write actually succeeded, so the Settings toggle can
   *  snap back rather than show a state the backend never applied. */
  const setMaintenanceMode = useCallback(async (enabled: boolean, message?: string) => {
    try {
      const result = await services.setMaintenanceStatus(enabled, message);
      maintenanceWrites.current += 1;
      setMaintenanceModeState(result.enabled);
      setMaintenanceMessageState(result.message);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── display rows (adapters applied once per data change) ──
  const users = useMemo(() => domainUsers.map(toUserRow), [domainUsers]);
  const verifications = useMemo(() => domainVerifications.map(toVerificationRow), [domainVerifications]);
  const disputes = useMemo(() => domainDisputes.map(toDisputeRow), [domainDisputes]);
  const transactions = useMemo<TransactionRow[]>(() => [], []);
  const bookings = useMemo<BookingRow[]>(() => [], []);
  const queueCounts = useMemo<QueueCounts>(
    () => ({
      verifications: verifications.filter((v) => v.status === "pending").length,
      disputes: disputes.filter((d) => d.isOpen).length,
      ...extraCounts,
    }),
    [verifications, disputes, extraCounts],
  );

  /**
   * Memoised so the context value isn't a brand-new object on every render.
   * Inline, it re-rendered *every* `useApp()` consumer — Sidebar, Header,
   * layout and the current page — on any state change at all, including ones
   * they don't read (collapsing the sidebar re-rendered the whole users
   * table). The callbacks are already `useCallback`-stable, so in practice
   * this now only changes when data the consumers actually use changes.
   *
   * A fuller fix is splitting this into auth / UI / data contexts so a
   * sidebar toggle can't touch data consumers at all — noted in the README
   * backlog; this is the cheap 90% of the win without a restructure.
   */
  // The core lists as one group, for consumers that have not split their flag (see `loading` on AppState).
  const coreLoading = disputesLoading || verificationsLoading || activityLoading || settingsLoading;
  // The React Compiler cannot keep this memo while it reads loadError, although the dependency list is complete
  // (exhaustive-deps passes). The manual list stays authoritative, so the memo is correct as written.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const value = useMemo<AppState>(
    () => ({
      isLoggedIn, sessionRestored, sessionEnded, adminProfile,
      login, logout, updateDisplayName, changePassword,
      loading: coreLoading,
      loadError,
      retryLoad, analyticsUnavailable, analyticsInBrowser,
      disputesLoading, verificationsLoading, activityLoading, settingsLoading, analyticsLoading, countsLoading,
      refreshData, refreshLive, refreshCounts, refreshUsers, ensureUsers, usersLoading, lastUpdated, refreshing, refreshFailed,
      verifications, users, transactions, disputes, bookings,
      dashboardStats, revenueSeries, bookingsSeries, bookingsByCategory,
      recentActivity, topProviders, queueCounts,
      approveVerification, rejectVerification,
      setUserStatus, bulkSetUserStatus, sendPasswordReset, cancelBooking, resolveDispute,
      darkMode, setDarkMode,
      sidebarCollapsed, setSidebarCollapsed,
      settings, updateSettings,
      maintenanceMode, maintenanceMessage, setMaintenanceMode,
    }),
    [
      coreLoading, disputesLoading, verificationsLoading, activityLoading, settingsLoading, analyticsLoading, countsLoading, loadError,
      isLoggedIn, sessionRestored, sessionEnded, adminProfile,
      login, logout, updateDisplayName, changePassword,
      retryLoad, analyticsUnavailable, analyticsInBrowser,
      refreshData, refreshLive, refreshCounts, refreshUsers, ensureUsers, usersLoading, lastUpdated, refreshing, refreshFailed,
      verifications, users, transactions, disputes, bookings,
      dashboardStats, revenueSeries, bookingsSeries, bookingsByCategory,
      recentActivity, topProviders, queueCounts,
      approveVerification, rejectVerification,
      setUserStatus, bulkSetUserStatus, sendPasswordReset, cancelBooking, resolveDispute,
      darkMode, setDarkMode,
      sidebarCollapsed, setSidebarCollapsed,
      settings, updateSettings,
      maintenanceMode, maintenanceMessage, setMaintenanceMode,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
