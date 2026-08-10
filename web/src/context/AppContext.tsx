"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import * as services from "@/lib/services";
import {
  toBookingRow,
  toDisputeRow,
  toTransactionRow,
  toUserRow,
  toVerificationRow,
  type BookingRow,
  type DisputeRow,
  type TransactionRow,
  type UserRow,
  type VerificationRow,
} from "@/lib/adapters";
import type {
  ActivityEvent,
  AdminBooking,
  AdminUser,
  CategoryShare,
  DashboardStats,
  Dispute,
  DisputeResolution,
  MonthlyPoint,
  TopProvider,
  Transaction,
  UserStatus,
  Verification,
} from "@/lib/domain";

// ─── Preferences (persisted to localStorage) ──────────────────────────────────

export interface ConsoleSettings {
  emailAlerts: boolean;
  disputeNotify: boolean;
  dailySummary: boolean;
  newUserNotify: boolean;
  activityBadge: boolean;
  autoPurge: boolean;
  anonymizeExports: boolean;
  auditLog: boolean;
  platformName: string;
  supportEmail: string;
}

const DEFAULT_SETTINGS: ConsoleSettings = {
  emailAlerts: true,
  disputeNotify: true,
  dailySummary: false,
  newUserNotify: false,
  activityBadge: true,
  autoPurge: false,
  anonymizeExports: true,
  auditLog: true,
  platformName: "TaskBuddy",
  supportEmail: "support@taskbuddy.io",
};

const PREFS_KEY = "tb-admin-prefs";

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
  adminProfile: AdminProfile;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateDisplayName: (name: string) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<boolean>;

  // data (display rows — adapters applied)
  loading: boolean;
  /** Non-null when the initial data load failed for a reason other than an
   *  expired session (which redirects to /login instead). */
  loadError: string | null;
  /** Re-runs the initial data load — wired to the error banner's Retry. */
  retryLoad: () => void;
  verifications: VerificationRow[];
  users: UserRow[];
  transactions: TransactionRow[];
  disputes: DisputeRow[];
  bookings: BookingRow[];
  dashboardStats: DashboardStats | null;
  revenueSeries: MonthlyPoint[];
  bookingsSeries: MonthlyPoint[];
  bookingsByCategory: CategoryShare[];
  recentActivity: ActivityEvent[];
  topProviders: TopProvider[];

  // mutations
  approveVerification: (id: string) => Promise<void>;
  rejectVerification: (id: string, reason?: string) => Promise<void>;
  /** Resolve with per-id counts so the caller can report partial failures. */
  bulkApproveVerifications: (ids: string[]) => Promise<services.BulkCounts>;
  bulkRejectVerifications: (ids: string[], reason?: string) => Promise<services.BulkCounts>;
  setUserStatus: (id: string, status: "Active" | "Suspended", suspend?: services.SuspendOptions) => Promise<void>;
  bulkSetUserStatus: (ids: string[], status: "Active" | "Suspended", suspend?: services.SuspendOptions) => Promise<services.BulkCounts>;
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

const STATUS_TO_DOMAIN: Record<"Active" | "Suspended", UserStatus> = {
  Active: "ACTIVE",
  Suspended: "SUSPENDED",
};

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
  const [adminProfile, setAdminProfile] = useState<AdminProfile>({
    name: "Super Admin",
    email: "admin@taskbuddy.io",
  });

  /* eslint-disable react-hooks/set-state-in-effect --
     Syncing from an external store is the documented exception to this rule,
     and localStorage is one the server cannot read. The only hydration-safe
     order is: render once without it, then adopt it after mount. Reading it
     during render — what the rule otherwise pushes toward — is the actual bug
     (a server/client tree mismatch), not the fix. */
  useEffect(() => {
    const session = services.restoreSession();
    if (session) {
      setAdminProfile(session);
      setIsLoggedIn(true);
    }
    setSessionRestored(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // domain data
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Bumped by retryLoad() to re-run the initial-load effect. */
  const [reloadNonce, setReloadNonce] = useState(0);
  const [domainUsers, setDomainUsers] = useState<AdminUser[]>([]);
  const [domainVerifications, setDomainVerifications] = useState<Verification[]>([]);
  const [domainTransactions, setDomainTransactions] = useState<Transaction[]>([]);
  const [domainDisputes, setDomainDisputes] = useState<Dispute[]>([]);
  const [domainBookings, setDomainBookings] = useState<AdminBooking[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<MonthlyPoint[]>([]);
  const [bookingsSeries, setBookingsSeries] = useState<MonthlyPoint[]>([]);
  const [bookingsByCategory, setBookingsByCategory] = useState<CategoryShare[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [topProviders, setTopProviders] = useState<TopProvider[]>([]);
  const [maintenanceMode, setMaintenanceModeState] = useState(false);
  const [maintenanceMessage, setMaintenanceMessageState] = useState<string | null>(null);

  // preferences — lazily hydrated from localStorage on the client
  const [darkMode, setDarkModeState] = useState(() => loadStoredPrefs()?.darkMode ?? true);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    () => loadStoredPrefs()?.sidebarCollapsed ?? false,
  );
  const [settings, setSettings] = useState<ConsoleSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadStoredPrefs()?.settings,
  }));

  // ── initial load — only once a session exists ──
  /* eslint-disable react-hooks/set-state-in-effect --
     Fetching on mount is the other documented exception: the backend is an
     external system, and a loading flag has to be flipped somewhere. Every
     setState that carries fetched data already happens in an async
     continuation, guarded by `cancelled`. */
  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [users, verifs, txns, disputes, bookings, stats, revenue, bookVol, categories, activity, providers, serverDarkMode, maintenance] =
          await Promise.all([
            services.getUsers(),
            services.getVerifications(),
            services.getTransactions(),
            services.getDisputes(),
            services.getBookings(),
            services.getDashboardStats(),
            services.getRevenueSeries(),
            services.getBookingsSeries(),
            services.getBookingsByCategory(),
            services.getRecentActivity(),
            services.getTopProviders(),
            services.getDarkModePreference(),
            services.getMaintenanceStatus(),
          ]);
        if (cancelled) return;
        setDomainUsers(users);
        setDomainVerifications(verifs);
        setDomainTransactions(txns);
        setDomainDisputes(disputes);
        setDomainBookings(bookings);
        setDashboardStats(stats);
        setRevenueSeries(revenue);
        setBookingsSeries(bookVol);
        setBookingsByCategory(categories);
        setRecentActivity(activity);
        setTopProviders(providers);
        // The account's saved preference wins over whatever this device had
        // cached, so dark mode now follows the admin across devices.
        if (serverDarkMode !== null) setDarkModeState(serverDarkMode);
        setMaintenanceModeState(maintenance.enabled);
        setMaintenanceMessageState(maintenance.message);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // An expired/invalid token surfaces here as a 401/403 — force back
        // to the login screen instead of showing an empty dashboard.
        if (err instanceof services.ApiError && (err.status === 401 || err.status === 403)) {
          setIsLoggedIn(false);
        } else {
          // Anything else (backend down, Render cold-start timeout, a 500)
          // used to be swallowed here: loading simply stopped and every page
          // rendered empty, indistinguishable from "the platform has no data".
          // Surfaced now so the admin knows to retry rather than trusting a
          // dashboard full of zeroes.
          setLoadError(
            err instanceof services.ApiError
              ? `Could not load console data (${err.status}).`
              : "Could not reach the backend.",
          );
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, reloadNonce]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const ok = await services.login(email, password);
    if (ok) {
      const profile = services.restoreSession();
      if (profile) setAdminProfile(profile);
      setIsLoggedIn(true);
    }
    return ok;
  }, []);

  /** The admin layout's auth gate sends the browser to /login once this flips. */
  const logout = useCallback(() => {
    void services.logout();
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
    setDashboardStats(await services.getDashboardStats());
  }, []);

  const approveVerification = useCallback(
    async (id: string) => {
      setDomainVerifications(await services.approveVerification(id));
      await refreshStats();
    },
    [refreshStats],
  );

  const rejectVerification = useCallback(
    async (id: string, reason?: string) => {
      setDomainVerifications(await services.rejectVerification(id, reason));
      await refreshStats();
    },
    [refreshStats],
  );

  const bulkApproveVerifications = useCallback(
    async (ids: string[]) => {
      const { rows, ...counts } = await services.bulkApproveVerifications(ids);
      setDomainVerifications(rows);
      await refreshStats();
      return counts;
    },
    [refreshStats],
  );

  const bulkRejectVerifications = useCallback(
    async (ids: string[], reason?: string) => {
      const { rows, ...counts } = await services.bulkRejectVerifications(ids, reason);
      setDomainVerifications(rows);
      await refreshStats();
      return counts;
    },
    [refreshStats],
  );

  const setUserStatus = useCallback(
    async (id: string, status: "Active" | "Suspended", suspend?: services.SuspendOptions) => {
      setDomainUsers(await services.setUserStatus(id, STATUS_TO_DOMAIN[status], suspend));
    },
    [],
  );

  const bulkSetUserStatus = useCallback(
    async (ids: string[], status: "Active" | "Suspended", suspend?: services.SuspendOptions) => {
      const { rows, ...counts } = await services.bulkSetUserStatus(ids, STATUS_TO_DOMAIN[status], suspend);
      setDomainUsers(rows);
      return counts;
    },
    [],
  );

  const sendPasswordReset = useCallback((id: string) => services.sendPasswordReset(id), []);

  const cancelBooking = useCallback(async (id: string) => {
    setDomainBookings(await services.cancelBooking(id));
  }, []);

  const resolveDispute = useCallback(
    async (id: string, resolution: DisputeResolution, note?: string) => {
      setDomainDisputes(await services.resolveDispute(id, resolution, note));
    },
    [],
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
  const transactions = useMemo(() => domainTransactions.map(toTransactionRow), [domainTransactions]);
  const disputes = useMemo(() => domainDisputes.map(toDisputeRow), [domainDisputes]);
  const bookings = useMemo(() => domainBookings.map(toBookingRow), [domainBookings]);

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
  const value = useMemo<AppState>(
    () => ({
      isLoggedIn, sessionRestored, adminProfile,
      login, logout, updateDisplayName, changePassword,
      loading, loadError, retryLoad,
      verifications, users, transactions, disputes, bookings,
      dashboardStats, revenueSeries, bookingsSeries, bookingsByCategory,
      recentActivity, topProviders,
      approveVerification, rejectVerification,
      bulkApproveVerifications, bulkRejectVerifications,
      setUserStatus, bulkSetUserStatus, sendPasswordReset, cancelBooking, resolveDispute,
      darkMode, setDarkMode,
      sidebarCollapsed, setSidebarCollapsed,
      settings, updateSettings,
      maintenanceMode, maintenanceMessage, setMaintenanceMode,
    }),
    [
      isLoggedIn, sessionRestored, adminProfile,
      login, logout, updateDisplayName, changePassword,
      loading, loadError, retryLoad,
      verifications, users, transactions, disputes, bookings,
      dashboardStats, revenueSeries, bookingsSeries, bookingsByCategory,
      recentActivity, topProviders,
      approveVerification, rejectVerification,
      bulkApproveVerifications, bulkRejectVerifications,
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
