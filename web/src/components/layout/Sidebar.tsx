"use client";

import {
  ShieldCheck, Users, CreditCard, CalendarDays, AlertTriangle, History,
  BarChart3, Settings, LogOut, LayoutDashboard, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { Page } from "@/lib/domain";
import { useApp } from "@/context/AppContext";
import { initials } from "@/lib/adapters";
import clsx from "clsx";

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  drawerOpen: boolean;
}

export function Sidebar({ activePage, onNavigate, onLogout, collapsed, onToggleCollapse, drawerOpen }: SidebarProps) {
  const { verifications, disputes, adminProfile, settings } = useApp();
  const pendingCount = settings.activityBadge
    ? verifications.filter((v) => v.status === "pending").length
    : 0;
  const openDisputeCount = settings.activityBadge
    ? disputes.filter((d) => d.isOpen).length
    : 0;

  const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
    { id: "verifications", label: "Verifications", icon: <ShieldCheck size={15} />, badge: pendingCount || undefined },
    { id: "users", label: "User Management", icon: <Users size={15} /> },
    { id: "transactions", label: "Transactions", icon: <CreditCard size={15} /> },
    { id: "disputes", label: "Disputes", icon: <AlertTriangle size={15} />, badge: openDisputeCount || undefined },
    { id: "bookings", label: "Bookings", icon: <CalendarDays size={15} /> },
    { id: "activity-log", label: "Activity Log", icon: <History size={15} /> },
    { id: "reports", label: "Reports", icon: <BarChart3 size={15} /> },
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
      <div className="flex items-center gap-2.5 px-3 py-4 relative" style={{ height: 66, borderBottom: "1px solid var(--border)", minWidth: 0 }}>
        <div className="flex items-center justify-center flex-shrink-0 font-extrabold text-sm" style={{ width: 33, height: 33, borderRadius: 20, background: "linear-gradient(180deg, #7762f3 0%, #393b8b 72%)", color: "#fff" }}>T</div>
        {!collapsed && (
          <div className="sidebar-label overflow-hidden">
            <div className="text-white font-bold whitespace-nowrap" style={{ fontSize: 13 }}>TaskBuddy</div>
            <div style={{ fontSize: 9.8, color: "var(--indigo)" }}>Admin Console</div>
          </div>
        )}
        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex absolute items-center justify-center rounded-full transition-colors hover:bg-white/10"
          style={{ right: -10, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, background: "var(--bg-main)", border: "1px solid var(--border)", color: "var(--text-muted)", zIndex: 10, cursor: "pointer" }}
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3.5">
        {!collapsed && (
          <div className="uppercase font-semibold px-2.5 mb-2" style={{ fontSize: 8, color: "#4b5563", letterSpacing: "0.8px" }}>Navigation</div>
        )}
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl mb-0.5 text-left relative transition-all duration-150 text-sm font-medium cursor-pointer",
              collapsed && "justify-center",
              activePage === item.id ? "text-indigo-300" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
            )}
            style={activePage === item.id ? { background: "var(--indigo-dark)" } : {}}
          >
            {activePage === item.id && !collapsed && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r" style={{ width: 2, height: 20, background: "var(--indigo)" }} />
            )}
            <span style={{ opacity: 0.8, flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && <span className="sidebar-label" style={{ fontSize: 13 }}>{item.label}</span>}
            {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
            {collapsed && item.badge && (
              <span className="absolute rounded-full" style={{ top: 4, right: 4, width: 6, height: 6, background: "var(--red)" }} />
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: collapsed ? "14px 8px" : "14px 13px" }}>
        <button
          onClick={() => onNavigate("settings")}
          title={collapsed ? "Settings" : undefined}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl mb-2 text-left transition-all duration-150",
            collapsed && "justify-center",
            activePage === "settings" ? "text-indigo-300" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
          )}
          style={activePage === "settings" ? { background: "var(--indigo-dark)" } : {}}
        >
          <Settings size={15} style={{ opacity: 0.8, flexShrink: 0 }} />
          {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>Settings</span>}
        </button>

        <div
          className={clsx("flex items-center rounded-xl", collapsed ? "justify-center px-1 py-2" : "gap-2.5")}
          style={collapsed ? {} : { background: "var(--card-bg)", padding: "10px 13px" }}
        >
          <div className="flex items-center justify-center flex-shrink-0 font-bold" style={{ width: 29, height: 29, borderRadius: 11, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", fontSize: 11, color: "#fff" }}>{initials(adminProfile.name)}</div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold truncate" style={{ fontSize: 11 }}>{adminProfile.name}</div>
                <div style={{ fontSize: 9.8, color: "var(--text-muted)" }}>{adminProfile.email}</div>
              </div>
              <button onClick={onLogout} className="text-gray-500 hover:text-red-400 transition-colors p-1" title="Sign out" style={{ background: "none", border: "none", cursor: "pointer" }}>
                <LogOut size={11} />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
