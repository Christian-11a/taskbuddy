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
  Page,
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
  maintenanceMode: boolean;
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
  maintenanceMode: false,
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
  // session / navigation
  isLoggedIn: boolean;
  activePage: Page;
  adminProfile: AdminProfile;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  navigate: (page: Page) => void;
  updateDisplayName: (name: string) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<boolean>;

  // data (display rows — adapters applied)
  loading: boolean;
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
  rejectVerification: (id: string) => Promise<void>;
  bulkApproveVerifications: (ids: string[]) => Promise<void>;
  bulkRejectVerifications: (ids: string[]) => Promise<void>;
  setUserStatus: (id: string, status: "Active" | "Suspended", suspend?: services.SuspendOptions) => Promise<void>;
  bulkSetUserStatus: (ids: string[], status: "Active" | "Suspended", suspend?: services.SuspendOptions) => Promise<void>;
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
}

const AppContext = createContext<AppState | null>(null);

const STATUS_TO_DOMAIN: Record<"Active" | "Suspended", UserStatus> = {
  Active: "ACTIVE",
  Suspended: "SUSPENDED",
};

export function AppProvider({ children }: { children: ReactNode }) {
  // session / navigation — unlike loadStoredPrefs() below (which only ever
  // affects className/style, not which branch renders), isLoggedIn gates
  // <LoginPage /> vs the dashboard in AppShell. Resolving it from
  // localStorage during the initial render would make the server (always
  // logged-out) and the client's first render (logged-in, if a session
  // exists) produce different trees — a hydration mismatch. So both start
  // logged-out, and a real session is restored after mount instead (see
  // the effect below).
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [adminProfile, setAdminProfile] = useState<AdminProfile>({
    name: "Super Admin",
    email: "admin@taskbuddy.io",
  });

  useEffect(() => {
    const session = services.restoreSession();
    if (session) {
      setAdminProfile(session);
      setIsLoggedIn(true);
    }
  }, []);

  // domain data
  const [loading, setLoading] = useState(true);
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
  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [users, verifs, txns, disputes, bookings, stats, revenue, bookVol, categories, activity, providers, serverDarkMode] =
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
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // An expired/invalid token surfaces here as a 401/403 — force back
        // to the login screen instead of showing an empty dashboard.
        if (err instanceof services.ApiError && (err.status === 401 || err.status === 403)) {
          setIsLoggedIn(false);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    const ok = await services.login(email, password);
    if (ok) {
      const profile = services.restoreSession();
      if (profile) setAdminProfile(profile);
      setIsLoggedIn(true);
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    void services.logout();
    setIsLoggedIn(false);
    setActivePage("dashboard");
  }, []);

  const navigate = useCallback((page: Page) => setActivePage(page), []);

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
    async (id: string) => {
      setDomainVerifications(await services.rejectVerification(id));
      await refreshStats();
    },
    [refreshStats],
  );

  const bulkApproveVerifications = useCallback(
    async (ids: string[]) => {
      setDomainVerifications(await services.bulkApproveVerifications(ids));
      await refreshStats();
    },
    [refreshStats],
  );

  const bulkRejectVerifications = useCallback(
    async (ids: string[]) => {
      setDomainVerifications(await services.bulkRejectVerifications(ids));
      await refreshStats();
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
      setDomainUsers(await services.bulkSetUserStatus(ids, STATUS_TO_DOMAIN[status], suspend));
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

  // ── display rows (adapters applied once per data change) ──
  const users = useMemo(() => domainUsers.map(toUserRow), [domainUsers]);
  const verifications = useMemo(() => domainVerifications.map(toVerificationRow), [domainVerifications]);
  const transactions = useMemo(() => domainTransactions.map(toTransactionRow), [domainTransactions]);
  const disputes = useMemo(() => domainDisputes.map(toDisputeRow), [domainDisputes]);
  const bookings = useMemo(() => domainBookings.map(toBookingRow), [domainBookings]);

  return (
    <AppContext.Provider
      value={{
        isLoggedIn, activePage, adminProfile,
        login, logout, navigate, updateDisplayName, changePassword,
        loading,
        verifications, users, transactions, disputes, bookings,
        dashboardStats, revenueSeries, bookingsSeries, bookingsByCategory,
        recentActivity, topProviders,
        approveVerification, rejectVerification,
        bulkApproveVerifications, bulkRejectVerifications,
        setUserStatus, bulkSetUserStatus, sendPasswordReset, cancelBooking, resolveDispute,
        darkMode, setDarkMode,
        sidebarCollapsed, setSidebarCollapsed,
        settings, updateSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
