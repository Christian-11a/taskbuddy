"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ShieldCheck, Users, CreditCard, CalendarDays, AlertTriangle, History,
  BarChart3, Settings, LogOut, LayoutDashboard, ChevronLeft, ChevronRight, ScrollText,
  WalletCards, SlidersHorizontal,
} from "lucide-react";
import type { Page } from "@/lib/domain";
import { useApp } from "@/context/AppContext";
import { initials } from "@/lib/adapters";
import { pageToPath } from "@/lib/routes";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import clsx from "clsx";

interface SidebarProps {
  /** Null on any route that isn't an admin page — nothing is highlighted then. */
  activePage: Page | null;
  /** Fired after a nav item is followed, so the mobile drawer can close. */
  onNavigate: () => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  drawerOpen: boolean;
}

export function Sidebar({ activePage, onNavigate, onLogout, collapsed, onToggleCollapse, drawerOpen }: SidebarProps) {
  const { verifications, disputes, adminProfile, settings } = useApp();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const pendingCount = settings.activityBadge
    ? verifications.filter((v) => v.status === "pending").length
    : 0;
  const openDisputeCount = settings.activityBadge
    ? disputes.filter((d) => d.isOpen).length
    : 0;

  type NavItem = { id: Page; label: string; icon: React.ReactNode; badge?: number };
  const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
    { label: "Overview", items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
    ] },
    { label: "Operations", items: [
      { id: "verifications", label: "Verifications", icon: <ShieldCheck size={15} />, badge: pendingCount || undefined },
      { id: "bookings", label: "Bookings", icon: <CalendarDays size={15} /> },
      { id: "disputes", label: "Disputes", icon: <AlertTriangle size={15} />, badge: openDisputeCount || undefined },
      { id: "transactions", label: "Transactions", icon: <CreditCard size={15} /> },
      { id: "withdrawals", label: "Withdrawals", icon: <WalletCards size={15} /> },
    ] },
    { label: "People", items: [
      { id: "users", label: "Users", icon: <Users size={15} /> },
    ] },
    { label: "Monitoring", items: [
      { id: "activity-log", label: "Activity", icon: <History size={15} /> },
      { id: "audit-log", label: "Audit Log", icon: <ScrollText size={15} /> },
      { id: "reports", label: "Reports", icon: <BarChart3 size={15} /> },
    ] },
    { label: "Administration", items: [
      { id: "platform", label: "Platform", icon: <SlidersHorizontal size={15} /> },
    ] },
  ];

  return (
    <aside
      className={clsx(
        "sidebar fixed left-0 top-0 z-30 flex flex-col h-screen",
        drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
      style={{
        width: collapsed ? "var(--sidebar-collapsed-w)" : "var(--sidebar-w)",
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 relative" style={{ height: 72, padding: "17px 14px", borderBottom: "1px solid var(--border)", minWidth: 0 }}>
        {/* alt only carries the brand name when collapsed, since that's the
            only case where the adjacent "TaskBuddy" text label is hidden —
            otherwise a screen reader would announce the brand twice. */}
        <Image src="/taskbuddy-logo.png" alt={collapsed ? "TaskBuddy" : ""} width={36} height={36} className="flex-shrink-0" style={{ borderRadius: 12, objectFit: "cover" }} />
        {!collapsed && (
          <div className="sidebar-label overflow-hidden">
            <div className="text-white font-bold whitespace-nowrap" style={{ fontSize: 14, letterSpacing: "-0.01em" }}>TaskBuddy</div>
            <div style={{ fontSize: 10, color: "var(--indigo)" }}>Admin Console</div>
          </div>
        )}
        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ right: -10, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, background: "var(--bg-main)", border: "1px solid var(--border)", color: "var(--text-muted)", zIndex: 10, cursor: "pointer" }}
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
        </button>
      </div>

      {/* Nav — real links, so ctrl/middle-click opens a page in a new tab and
          Next.js can prefetch the route on hover. */}
      <nav className="flex-1 overflow-y-auto" style={{ padding: "16px 10px" }} aria-label="Main navigation">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label}>
            {!collapsed && (
              <div className="uppercase font-semibold px-2.5" style={{ fontSize: 9, color: "#516071", letterSpacing: "0.1em", margin: si === 0 ? "2px 0 7px" : "15px 0 7px" }}>{section.label}</div>
            )}
            {section.items.map((item) => (
              <Link
                key={item.id}
                href={pageToPath(item.id)}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-current={activePage === item.id ? "page" : undefined}
                className={clsx(
                  "sidebar-nav-link w-full flex items-center rounded-xl mb-0.5 text-left relative transition-all duration-150 font-medium cursor-pointer",
                  collapsed && "justify-center",
                  activePage !== item.id && "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                )}
                style={{ padding: "9px 11px", fontSize: 12.5, gap: 11, ...(activePage === item.id ? { background: "var(--indigo-dark)", color: "var(--indigo-light)" } : {}) }}
              >
                {activePage === item.id && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r" style={{ width: 3, height: 18, background: "var(--indigo)" }} />
                )}
                <span style={{ opacity: 0.8, flexShrink: 0, width: 17, display: "inline-flex", justifyContent: "center" }}>{item.icon}</span>
                {!collapsed && <span className="sidebar-label" style={{ fontSize: 12.5 }}>{item.label}</span>}
                {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
                {collapsed && item.badge && (
                  <span className="absolute rounded-full" style={{ top: 4, right: 4, width: 6, height: 6, background: "var(--red)" }} />
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: collapsed ? "12px 8px" : "12px 13px 16px" }}>
        <Link
          href={pageToPath("settings")}
          onClick={onNavigate}
          title={collapsed ? "Settings" : undefined}
          aria-current={activePage === "settings" ? "page" : undefined}
          className={clsx(
            "sidebar-nav-link w-full flex items-center gap-2.5 rounded-xl mb-2 text-left transition-all duration-150",
            collapsed && "justify-center",
            activePage !== "settings" && "text-gray-500 hover:bg-white/5 hover:text-gray-300"
          )}
          style={{ padding: "9px 11px", ...(activePage === "settings" ? { background: "var(--indigo-dark)", color: "var(--indigo-light)" } : {}) }}
        >
          <Settings size={15} style={{ opacity: 0.8, flexShrink: 0 }} />
          {!collapsed && <span style={{ fontSize: 12.5, fontWeight: 500 }}>Settings</span>}
        </Link>

        <div
          className={clsx("flex items-center rounded-xl", collapsed ? "justify-center px-1 py-2" : "gap-2.5")}
          style={collapsed ? {} : { background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "10px 11px", borderRadius: 11 }}
        >
          <div className="flex items-center justify-center flex-shrink-0 font-bold" style={{ width: 29, height: 29, borderRadius: 9, background: "linear-gradient(145deg, #17bfd2, #087d91)", fontSize: 11, color: "#fff" }}>{initials(adminProfile.name)}</div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold truncate" style={{ fontSize: 11 }}>{adminProfile.name}</div>
                <div style={{ fontSize: 9.8, color: "var(--text-muted)" }}>{adminProfile.email}</div>
              </div>
              <button onClick={() => setConfirmingLogout(true)} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Sign out" aria-label="Sign out" style={{ background: "none", border: "none", cursor: "pointer" }}>
                <LogOut size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingLogout}
        title="Sign out?"
        message={`You'll need to sign back in as ${adminProfile.email} to continue.`}
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          setConfirmingLogout(false);
          onLogout();
        }}
        onCancel={() => setConfirmingLogout(false)}
      />
    </aside>
  );
}
