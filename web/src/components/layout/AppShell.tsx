"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { LoginPage } from "@/components/pages/LoginPage";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { VerificationsPage } from "@/components/pages/VerificationsPage";
import { UsersPage } from "@/components/pages/UsersPage";
import { TransactionsPage } from "@/components/pages/TransactionsPage";
import { DisputesPage } from "@/components/pages/DisputesPage";
import { BookingsPage } from "@/components/pages/BookingsPage";
import { ActivityLogPage } from "@/components/pages/ActivityLogPage";
import { AuditLogPage } from "@/components/pages/AuditLogPage";
import { ReportsPage } from "@/components/pages/ReportsPage";
import { SettingsPage } from "@/components/pages/SettingsPage";
import type { Page } from "@/lib/domain";

const PAGE_TITLES: Record<Page, string> = {
  dashboard: "Overview",
  verifications: "Verifications",
  users: "User Management",
  transactions: "Transactions",
  disputes: "Disputes",
  bookings: "Bookings",
  "activity-log": "Activity Log",
  "audit-log": "Audit Log",
  reports: "Reports & Analytics",
  settings: "Settings",
};

export function AppShell() {
  const { isLoggedIn, activePage, navigate, logout, sidebarCollapsed, setSidebarCollapsed } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Persistence lives in AppContext (hydrated after mount → no SSR mismatch).
  const collapsed = sidebarCollapsed;

  if (!isLoggedIn) return <LoginPage />;

  return (
    <div className="app-shell flex h-screen overflow-hidden" style={{ background: "var(--bg-main)" }}>
      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <Sidebar
        activePage={activePage}
        onNavigate={(p) => { navigate(p); setDrawerOpen(false); }}
        onLogout={logout}
        collapsed={collapsed}
        onToggleCollapse={() => setSidebarCollapsed(!collapsed)}
        drawerOpen={drawerOpen}
      />

      <div className={`content-area${collapsed ? " sidebar-collapsed" : ""} flex flex-col flex-1 overflow-hidden`}>
        <Header
          title={PAGE_TITLES[activePage]}
          onOpenDrawer={() => setDrawerOpen(true)}
        />

        <main
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--bg-main)", padding: "clamp(12px, 2vw, 20px) clamp(16px, 3vw, 40px)" }}
        >
          {activePage === "dashboard" && <DashboardPage onNavigate={navigate} />}
          {activePage === "verifications" && <VerificationsPage />}
          {activePage === "users" && <UsersPage />}
          {activePage === "transactions" && <TransactionsPage />}
          {activePage === "disputes" && <DisputesPage />}
          {activePage === "bookings" && <BookingsPage />}
          {activePage === "activity-log" && <ActivityLogPage />}
          {activePage === "audit-log" && <AuditLogPage />}
          {activePage === "reports" && <ReportsPage />}
          {activePage === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
