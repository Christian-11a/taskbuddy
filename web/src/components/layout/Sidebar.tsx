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

  /**
   * Five group headings for eleven destinations, three of which ("Overview",
   * "People", "Administration") labelled a single item each — a heading that
   * groups one thing isn't grouping, it's decoration. Dashboard now sits
   * unlabelled at the top where it reads as the root, and the remaining
   * headings each cover a real set: work that comes in and gets actioned,
   * the record of what happened, and the settings behind it.
   *
   * Every destination is preserved; only the labels above them changed.
   */
  type NavItem = { id: Page; label: string; icon: React.ReactNode; badge?: number };
  const NAV_SECTIONS: { label: string | null; items: NavItem[] }[] = [
    { label: null, items: [
      { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
    ] },
    { label: "Operations", items: [
      { id: "verifications", label: "Verifications", icon: <ShieldCheck size={15} />, badge: pendingCount || undefined },
      { id: "bookings", label: "Bookings", icon: <CalendarDays size={15} /> },
      { id: "disputes", label: "Disputes", icon: <AlertTriangle size={15} />, badge: openDisputeCount || undefined },
      { id: "transactions", label: "Transactions", icon: <CreditCard size={15} /> },
      { id: "withdrawals", label: "Withdrawals", icon: <WalletCards size={15} /> },
      { id: "users", label: "Users", icon: <Users size={15} /> },
    ] },
    { label: "Records", items: [
      { id: "activity-log", label: "Activity", icon: <History size={15} /> },
      { id: "audit-log", label: "Audit Log", icon: <ScrollText size={15} /> },
      { id: "reports", label: "Reports", icon: <BarChart3 size={15} /> },
    ] },
    { label: "System", items: [
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
      <div className="flex items-center gap-2.5 relative" style={{ height: 72, padding: "0 var(--sp-4)", borderBottom: "1px solid var(--border)", minWidth: 0 }}>
        {/* alt only carries the brand name when collapsed, since that's the
            only case where the adjacent "TaskBuddy" text label is hidden —
            otherwise a screen reader would announce the brand twice. */}
        <Image src="/taskbuddy-logo.png" alt={collapsed ? "TaskBuddy" : ""} width={36} height={36} className="flex-shrink-0" style={{ borderRadius: 12, objectFit: "cover" }} />
        {!collapsed && (
          <div className="sidebar-label overflow-hidden">
            <div className="font-bold whitespace-nowrap" style={{ fontSize: "var(--fs-md)", color: "var(--nav-fg-strong)", letterSpacing: "var(--tr-snug)" }}>TaskBuddy</div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--nav-active-fg)" }}>Admin Console</div>
          </div>
        )}
        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute items-center justify-center rounded-full transition-colors"
          style={{ right: -10, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, background: "var(--bg-main)", border: "1px solid var(--border-md)", color: "var(--nav-fg-muted)", zIndex: 10, cursor: "pointer" }}
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
        </button>
      </div>

      {/* Nav — real links, so ctrl/middle-click opens a page in a new tab and
          Next.js can prefetch the route on hover. */}
      <nav className="flex-1 overflow-y-auto" style={{ padding: "var(--sp-4) var(--sp-3)" }} aria-label="Main navigation">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label ?? "root"} style={{ marginTop: si === 0 ? 0 : "var(--sp-5)" }}>
            {section.label && !collapsed && (
              <div
                className="uppercase font-semibold"
                style={{ fontSize: "var(--fs-2xs)", color: "var(--nav-fg-muted)", letterSpacing: "var(--tr-label)", padding: "0 var(--sp-2)", marginBottom: "var(--sp-2)" }}
              >
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = activePage === item.id;
              return (
                <Link
                  key={item.id}
                  href={pageToPath(item.id)}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "sidebar-nav-link w-full flex items-center text-left relative font-medium cursor-pointer",
                    collapsed && "justify-center",
                    !active && "sidebar-nav-link--idle",
                  )}
                  style={{
                    padding: "9px var(--sp-2)",
                    borderRadius: "var(--r-md)",
                    marginBottom: 2,
                    fontSize: "var(--fs-sm)",
                    gap: "var(--sp-3)",
                    color: active ? "var(--nav-active-fg)" : "var(--nav-fg)",
                    background: active ? "var(--nav-active-bg)" : "transparent",
                  }}
                >
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2" style={{ width: 3, height: 18, borderRadius: "0 2px 2px 0", background: "var(--indigo)" }} />
                  )}
                  <span style={{ flexShrink: 0, width: 17, display: "inline-flex", justifyContent: "center" }}>{item.icon}</span>
                  {!collapsed && <span className="sidebar-label">{item.label}</span>}
                  {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
                  {collapsed && item.badge && (
                    <span className="absolute rounded-full" style={{ top: 4, right: 4, width: 6, height: 6, background: "var(--red)" }} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: collapsed ? "var(--sp-3) var(--sp-2)" : "var(--sp-3) var(--sp-3) var(--sp-4)" }}>
        <Link
          href={pageToPath("settings")}
          onClick={onNavigate}
          title={collapsed ? "Settings" : undefined}
          aria-current={activePage === "settings" ? "page" : undefined}
          className={clsx(
            "sidebar-nav-link w-full flex items-center text-left",
            collapsed && "justify-center",
            activePage !== "settings" && "sidebar-nav-link--idle",
          )}
          style={{
            padding: "9px var(--sp-2)",
            borderRadius: "var(--r-md)",
            marginBottom: "var(--sp-2)",
            gap: "var(--sp-3)",
            fontSize: "var(--fs-sm)",
            fontWeight: 500,
            color: activePage === "settings" ? "var(--nav-active-fg)" : "var(--nav-fg)",
            background: activePage === "settings" ? "var(--nav-active-bg)" : "transparent",
          }}
        >
          <Settings size={15} style={{ flexShrink: 0, width: 17 }} />
          {!collapsed && <span className="sidebar-label">Settings</span>}
        </Link>

        <div
          className={clsx("flex items-center", collapsed ? "justify-center px-1 py-2" : "gap-2.5")}
          style={collapsed ? {} : { background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "var(--sp-2) 11px", borderRadius: "var(--r-md)" }}
        >
          <div className="flex items-center justify-center flex-shrink-0 font-bold" style={{ width: 29, height: 29, borderRadius: "var(--r-sm)", background: "var(--brand-solid)", fontSize: "var(--fs-xs)", color: "var(--brand-on-solid)" }}>{initials(adminProfile.name)}</div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate" style={{ fontSize: "var(--fs-xs)", color: "var(--nav-fg-strong)" }}>{adminProfile.name}</div>
                <div className="truncate" style={{ fontSize: "var(--fs-2xs)", color: "var(--nav-fg-muted)" }}>{adminProfile.email}</div>
              </div>
              <button onClick={() => setConfirmingLogout(true)} className="sidebar-signout transition-colors" title="Sign out" aria-label="Sign out" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--nav-fg-muted)", padding: 4, display: "flex", flexShrink: 0 }}>
                <LogOut size={12} />
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
