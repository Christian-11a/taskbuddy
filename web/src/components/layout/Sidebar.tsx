"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChevronsLeft, ChevronsRight, LogOut, Settings } from "lucide-react";
import type { Page } from "@/lib/domain";
import { useApp } from "@/context/AppContext";
import { initials } from "@/lib/adapters";
import { ADMIN_NAV, NAV_GROUPS, type NavItem } from "@/lib/nav";
import { pageToPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

export const SIDEBAR_WIDTH = { expanded: 248, collapsed: 68 } as const;

export function Sidebar({ activePage, onNavigate, onLogout, collapsed, onToggleCollapse, drawerOpen }: SidebarProps) {
  const { verifications, disputes, adminProfile, settings } = useApp();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const reduce = useReducedMotion();

  const badges: Partial<Record<Page, number>> = settings.activityBadge
    ? {
        verifications: verifications.filter((v) => v.status === "pending").length,
        disputes: disputes.filter((d) => d.isOpen).length,
      }
    : {};

  // Settings lives in the footer next to the account, as before.
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: ADMIN_NAV.filter((n) => n.group === g.id && n.id !== "settings"),
  })).filter((g) => g.items.length > 0);

  const renderLink = (item: Pick<NavItem, "id" | "label" | "icon">, badge?: number) => {
    const active = activePage === item.id;
    const Icon = item.icon;
    const link = (
      <Link
        href={pageToPath(item.id)}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? (badge ? `${item.label} (${badge})` : item.label) : undefined}
        className={cn(
          "group relative flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          collapsed && "justify-center px-0",
          active ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active"
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }}
            className="absolute inset-0 rounded-[8px] bg-primary-soft ring-1 ring-inset ring-primary/15"
            aria-hidden="true"
          />
        )}
        <Icon className={cn("relative size-4 shrink-0", active ? "text-primary" : "text-subtle group-hover:text-muted-foreground")} aria-hidden="true" />
        {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
        {badge ? (
          collapsed ? (
            <span className="absolute right-2 top-1.5 size-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />
          ) : (
            <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold tabular text-danger">
              {badge}
            </span>
          )
        ) : null}
      </Link>
    );
    if (!collapsed) return <div key={item.id}>{link}</div>;
    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{badge ? `${item.label} · ${badge}` : item.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface transition-[transform,width] duration-200 ease-out lg:translate-x-0",
        drawerOpen ? "translate-x-0 shadow-ui-lg" : "-translate-x-full",
      )}
      style={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded, maxWidth: "86vw" }}
    >
      {/* Brand */}
      <div className={cn("relative flex h-14 shrink-0 items-center gap-2.5 border-b border-border", collapsed ? "justify-center px-2" : "px-4")}>
        <Image src="/taskbuddy-logo.png" alt={collapsed ? "TaskBuddy Admin Console" : ""} width={30} height={30} className="shrink-0 rounded-[8px]" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[14px] font-semibold tracking-tight">TaskBuddy</div>
            <div className="truncate text-[11px] text-subtle">Admin Console</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface text-subtle shadow-ui-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid"
        >
          {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
        </button>
      </div>

      {/* Nav — real links, so ctrl/middle-click opens a new tab and Next can prefetch. */}
      <nav aria-label="Main navigation" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.id}>
            {group.label && !collapsed && (
              <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle">{group.label}</div>
            )}
            {group.label && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />}
            <div className="space-y-0.5">{group.items.map((item) => renderLink(item, badges[item.id]))}</div>
          </div>
        ))}
      </nav>

      {/* Footer: settings + account */}
      <div className="shrink-0 space-y-2 border-t border-border p-3">
        {renderLink({ id: "settings", label: "Settings", icon: Settings })}
        <div className={cn("flex items-center gap-2.5 rounded-[10px]", collapsed ? "justify-center py-1" : "border border-border bg-surface-2 px-2.5 py-2")}>
          <div className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-primary text-[11.5px] font-semibold text-primary-foreground">
            {initials(adminProfile.name)}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[12.5px] font-semibold">{adminProfile.name}</div>
                <div className="truncate text-[11px] text-subtle">{adminProfile.email}</div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingLogout(true)}
                aria-label="Sign out"
                title="Sign out"
                className="grid size-7 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-3.5" />
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
