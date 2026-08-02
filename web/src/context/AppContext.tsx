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
  toTransactionRow,
  toUserRow,
  toVerificationRow,
  type BookingRow,
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
  updateAdminProfile: (profile: AdminProfile) => void;
  changePassword: (current: string, next: string) => Promise<boolean>;

  // data (display rows — adapters applied)
  loading: boolean;
  verifications: VerificationRow[];
  users: UserRow[];
  transactions: TransactionRow[];
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
  setUserStatus: (id: string, status: "Active" | "Suspended") => Promise<void>;
  cancelBooking: (id: string) => Promise<void>;

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
        const [users, verifs, txns, bookings, stats, revenue, bookVol, categories, activity, providers] =
          await Promise.all([
            services.getUsers(),
            services.getVerifications(),
            services.getTransactions(),
            services.getBookings(),
            services.getDashboardStats(),
            services.getRevenueSeries(),
            services.getBookingsSeries(),
            services.getBookingsByCategory(),
            services.getRecentActivity(),
            services.getTopProviders(),
          ]);
        if (cancelled) return;
        setDomainUsers(users);
        setDomainVerifications(verifs);
        setDomainTransactions(txns);
        setDomainBookings(bookings);
        setDashboardStats(stats);
        setRevenueSeries(revenue);
        setBookingsSeries(bookVol);
        setBookingsByCategory(categories);
        setRecentActivity(activity);
        setTopProviders(providers);
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

  const updateAdminProfile = useCallback((profile: AdminProfile) => setAdminProfile(profile), []);

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

  const setUserStatus = useCallback(
    async (id: string, status: "Active" | "Suspended") => {
      setDomainUsers(await services.setUserStatus(id, STATUS_TO_DOMAIN[status]));
    },
    [],
  );

  const cancelBooking = useCallback(async (id: string) => {
    setDomainBookings(await services.cancelBooking(id));
  }, []);

  // ── preferences setters ──
  const setDarkMode = useCallback((val: boolean) => setDarkModeState(val), []);
  const setSidebarCollapsed = useCallback((val: boolean) => setSidebarCollapsedState(val), []);
  const updateSettings = useCallback(
    (patch: Partial<ConsoleSettings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );

  // ── display rows (adapters applied once per data change) ──
  const users = useMemo(() => domainUsers.map(toUserRow), [domainUsers]);
  const verifications = useMemo(() => domainVerifications.map(toVerificationRow), [domainVerifications]);
  const transactions = useMemo(() => domainTransactions.map(toTransactionRow), [domainTransactions]);
  const bookings = useMemo(() => domainBookings.map(toBookingRow), [domainBookings]);

  return (
    <AppContext.Provider
      value={{
        isLoggedIn, activePage, adminProfile,
        login, logout, navigate, updateAdminProfile, changePassword,
        loading,
        verifications, users, transactions, bookings,
        dashboardStats, revenueSeries, bookingsSeries, bookingsByCategory,
        recentActivity, topProviders,
        approveVerification, rejectVerification, setUserStatus, cancelBooking,
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
