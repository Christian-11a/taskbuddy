"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, CreditCard, LogOut, Moon, RefreshCw, Sun, User } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ADMIN_NAV, NAV_GROUPS } from "@/lib/nav";
import { pageToPath } from "@/lib/routes";
import type { Page } from "@/lib/domain";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";

interface RecordResult {
  key: string;
  label: string;
  sub: string;
  page: Page;
  icon: typeof User;
}

/** Same rules as the old header search: loaded records only, ≥2 characters, 6 results. */
const MAX_RECORDS = 6;

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ⌘K / Ctrl+K: jump to any section, find a loaded user/booking/transaction/
 * dispute, or run a console action — replaces the old header search box.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { users, bookings, transactions, disputes, darkMode, setDarkMode, refreshData, logout } = useApp();
  const [query, setQuery] = useState("");

  const records = useMemo<RecordResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: RecordResult[] = [];
    const has = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(q));
    for (const u of users) {
      if (out.length >= MAX_RECORDS) break;
      if (has(u.name, u.email)) out.push({ key: `user-${u.id}`, label: u.name, sub: u.email, page: "users", icon: User });
    }
    for (const b of bookings) {
      if (out.length >= MAX_RECORDS) break;
      if (has(b.id, b.customer, b.provider, b.service)) out.push({ key: `booking-${b.id}`, label: `${b.service} · ${b.customer}`, sub: b.id, page: "bookings", icon: CalendarDays });
    }
    for (const t of transactions) {
      if (out.length >= MAX_RECORDS) break;
      if (has(t.id, t.customer, t.provider, t.service)) out.push({ key: `tx-${t.id}`, label: `${t.service} · ${t.customer}`, sub: t.id, page: "transactions", icon: CreditCard });
    }
    for (const d of disputes) {
      if (out.length >= MAX_RECORDS) break;
      if (has(d.jobTitle, d.clientName, d.providerName)) out.push({ key: `dispute-${d.id}`, label: d.jobTitle, sub: `${d.clientName} vs ${d.providerName}`, page: "disputes", icon: AlertTriangle });
    }
    return out;
  }, [query, users, bookings, transactions, disputes]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    setQuery("");
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(""); }}>
      <DialogContent hideClose className="top-[18%] max-w-[600px] translate-y-0 overflow-hidden p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Search or jump to</DialogTitle>
        <Command loop>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search pages, people, disputes, or type a command…" />
          <CommandList>
            <CommandEmpty>No matches for &ldquo;{query}&rdquo;.</CommandEmpty>

            {records.length > 0 && (
              <CommandGroup heading="Records">
                {records.map((r) => (
                  <CommandItem key={r.key} value={`${r.label} ${r.sub}`} onSelect={() => run(() => router.push(pageToPath(r.page)))}>
                    <r.icon />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.label}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{r.sub}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {NAV_GROUPS.map((group) => (
              <CommandGroup key={group.id} heading={group.label ?? "Overview"}>
                {ADMIN_NAV.filter((n) => n.group === group.id).map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.label}
                    keywords={[item.description, ...(item.keywords ?? [])]}
                    onSelect={() => run(() => router.push(pageToPath(item.id)))}
                  >
                    <item.icon />
                    <span className="flex-1">{item.label}</span>
                    <span className="hidden truncate text-[11.5px] text-subtle sm:block">{item.description}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            <CommandGroup heading="Actions">
              <CommandItem
                value={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                keywords={["theme", "appearance"]}
                onSelect={() => run(() => setDarkMode(!darkMode))}
              >
                {darkMode ? <Sun /> : <Moon />}
                {darkMode ? "Switch to light mode" : "Switch to dark mode"}
              </CommandItem>
              <CommandItem value="Refresh data now" keywords={["reload", "live", "sync"]} onSelect={() => run(() => void refreshData())}>
                <RefreshCw />
                Refresh data now
              </CommandItem>
              <CommandItem value="Log out" keywords={["sign out", "logout"]} onSelect={() => run(logout)}>
                <LogOut />
                Log out
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11.5px] text-subtle">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
            <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
