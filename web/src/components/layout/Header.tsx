"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Menu, Search, Settings } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { initials } from "@/lib/adapters";
import { NAV_GROUPS, pageMeta } from "@/lib/nav";
import { pageToPath, pathToPage } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CommandPalette } from "./CommandPalette";
import { LiveIndicator } from "./LiveIndicator";
import { NotificationsMenu } from "./NotificationsMenu";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  onOpenDrawer: () => void;
}

/** The shell only renders client-side (behind the session check), so the
 *  platform can be read directly for the ⌘K vs Ctrl K hint. */
function useIsMac(): boolean {
  const [mac] = useState(
    () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
  );
  return mac;
}

export function Header({ onOpenDrawer }: HeaderProps) {
  const { adminProfile, logout } = useApp();
  const pathname = usePathname();
  const page = pathToPage(pathname);
  const meta = page ? pageMeta(page) : null;
  const groupLabel = meta ? NAV_GROUPS.find((g) => g.id === meta.group)?.label : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const isMac = useIsMac();

  // ⌘K / Ctrl+K from anywhere in the console.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Not over a confirmation dialog or drawer — the palette would stack
        // on top of a half-finished decision.
        if (document.querySelector('[aria-modal="true"]:not([aria-hidden="true"])')) return;
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onOpenDrawer} aria-label="Open navigation menu">
        <Menu />
      </Button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <span className="hidden text-subtle sm:inline">Admin</span>
        {groupLabel && (
          <>
            <ChevronRight className="hidden size-3.5 text-subtle sm:inline" aria-hidden="true" />
            <span className="hidden text-subtle md:inline">{groupLabel}</span>
          </>
        )}
        {meta && (
          <>
            <ChevronRight className="hidden size-3.5 text-subtle sm:inline" aria-hidden="true" />
            <span aria-current="page" className="truncate font-semibold text-foreground">{meta.label}</span>
          </>
        )}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="hidden h-8 w-64 items-center gap-2 rounded-[8px] border border-border bg-surface-2 px-3 text-[12.5px] text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex lg:w-72"
      >
        <Search className="size-3.5" aria-hidden="true" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to">
        <Search />
      </Button>

      <LiveIndicator />
      <NotificationsMenu />
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account: ${adminProfile.name}`}
            className="grid size-8 place-items-center rounded-full bg-primary-soft text-[11.5px] font-semibold text-primary ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {initials(adminProfile.name)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <div className="px-2.5 py-2">
            <div className="truncate text-[13px] font-semibold">{adminProfile.name}</div>
            <div className="truncate text-[12px] text-muted-foreground">{adminProfile.email}</div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={pageToPath("settings")}>
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem tone="danger" onSelect={() => setConfirmingLogout(true)}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ConfirmDialog
        open={confirmingLogout}
        title="Sign out?"
        message={`You'll need to sign back in as ${adminProfile.email} to continue.`}
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={() => {
          setConfirmingLogout(false);
          logout();
        }}
        onCancel={() => setConfirmingLogout(false)}
      />
    </header>
  );
}
