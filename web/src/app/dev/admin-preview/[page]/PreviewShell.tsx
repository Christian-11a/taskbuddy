"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppContextForPreview, type AppState } from "@/context/AppContext";
import { ToastProvider } from "@/components/ui/Toast";
import AdminLayout from "@/app/admin/(admin)/layout";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { VerificationsPage } from "@/components/pages/VerificationsPage";
import { BookingsPage } from "@/components/pages/BookingsPage";
import { DisputesPage } from "@/components/pages/DisputesPage";
import { TransactionsPage } from "@/components/pages/TransactionsPage";
import { WithdrawalsPage } from "@/components/pages/WithdrawalsPage";
import { SkillRequestsPage } from "@/components/pages/SkillRequestsPage";
import { UsersPage } from "@/components/pages/UsersPage";
import { ActivityLogPage } from "@/components/pages/ActivityLogPage";
import { AuditLogPage } from "@/components/pages/AuditLogPage";
import { ReportsPage } from "@/components/pages/ReportsPage";
import { PlatformPage } from "@/components/pages/PlatformPage";
import { SettingsPage } from "@/components/pages/SettingsPage";
import { LoginPage } from "@/components/pages/LoginPage";
import { MOCK_APP } from "../mockApp";
import { installMockApi } from "../mockApi";

installMockApi();

const PAGES: Record<string, React.ComponentType> = {
  dashboard: DashboardPage, verifications: VerificationsPage, bookings: BookingsPage, disputes: DisputesPage,
  transactions: TransactionsPage, withdrawals: WithdrawalsPage, "skill-requests": SkillRequestsPage, users: UsersPage,
  "activity-log": ActivityLogPage, "audit-log": AuditLogPage, reports: ReportsPage, platform: PlatformPage, settings: SettingsPage,
};

/** Real shell + page, fed sample data. `?theme=dark` and `?collapsed=1` preview those states. */
export function PreviewShell({ page, dark, collapsed }: { page: string; dark: boolean; collapsed: boolean }) {
  const [darkMode, setDarkMode] = useState(dark);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(collapsed);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  const value = useMemo<AppState>(
    () => ({ ...MOCK_APP, darkMode, setDarkMode, sidebarCollapsed, setSidebarCollapsed }),
    [darkMode, sidebarCollapsed],
  );
  // Mirror the real console, which only renders after the client-side session
  // check — never on the server — so motion/reduced-motion state can't mismatch.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const Page = PAGES[page] ?? DashboardPage;
  if (!mounted) return null;
  // The login screen renders on its own, outside the console shell.
  if (page === "login") {
    return (
      <ToastProvider>
        <AppContextForPreview.Provider value={value}>
          <LoginPage />
        </AppContextForPreview.Provider>
      </ToastProvider>
    );
  }
  return (
    <ToastProvider>
      <AppContextForPreview.Provider value={value}>
        <AdminLayout>
          <Page />
        </AdminLayout>
      </AppContextForPreview.Provider>
    </ToastProvider>
  );
}
