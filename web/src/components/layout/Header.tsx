"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Bell, Menu, ShieldCheck, AlertTriangle, X, Search, Users as UsersIcon, CalendarDays, CreditCard } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { pageToPath } from "@/lib/routes";
import type { Page } from "@/lib/domain";

interface HeaderProps {
  onOpenDrawer: () => void;
}

interface SearchResult {
  key: string;
  label: string;
  sub: string;
  page: Page;
  icon: React.ReactNode;
}

export function Header({ onOpenDrawer }: HeaderProps) {
  const { verifications, disputes, users, bookings, transactions } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const pendingVerifs = verifications.filter((v) => v.status === "pending");
  const openDisputes = disputes.filter((d) => d.isOpen);
  const notifCount = pendingVerifs.length + openDisputes.length;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Searches only the records already loaded for their own admin pages (each
  // capped at LIST_PAGE_SIZE) — not a live backend query. Fine at today's
  // scale; worth revisiting once real user counts start approaching that cap.
  const searchResults: SearchResult[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: SearchResult[] = [];
    for (const u of users) {
      if (results.length >= 6) break;
      if (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) {
        results.push({ key: `user-${u.id}`, label: u.name, sub: u.email, page: "users", icon: <UsersIcon size={13} /> });
      }
    }
    for (const b of bookings) {
      if (results.length >= 6) break;
      if (b.id.toLowerCase().includes(q) || b.customer.toLowerCase().includes(q) || b.provider.toLowerCase().includes(q) || b.service.toLowerCase().includes(q)) {
        results.push({ key: `booking-${b.id}`, label: `${b.service} — ${b.customer}`, sub: b.id, page: "bookings", icon: <CalendarDays size={13} /> });
      }
    }
    for (const t of transactions) {
      if (results.length >= 6) break;
      if (t.id.toLowerCase().includes(q) || t.customer.toLowerCase().includes(q) || t.provider.toLowerCase().includes(q) || t.service.toLowerCase().includes(q)) {
        results.push({ key: `tx-${t.id}`, label: `${t.service} — ${t.customer}`, sub: t.id, page: "transactions", icon: <CreditCard size={13} /> });
      }
    }
    for (const d of disputes) {
      if (results.length >= 6) break;
      if (d.jobTitle.toLowerCase().includes(q) || d.clientName.toLowerCase().includes(q) || d.providerName.toLowerCase().includes(q)) {
        results.push({ key: `dispute-${d.id}`, label: d.jobTitle, sub: `${d.clientName} vs ${d.providerName}`, page: "disputes", icon: <AlertTriangle size={13} /> });
      }
    }
    return results;
  }, [searchQuery, users, bookings, transactions, disputes]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header
      className="flex items-center justify-between flex-shrink-0 px-3 sm:px-4 lg:px-6"
      style={{ background: "var(--bg-header)", borderBottom: "1px solid var(--border)", paddingTop: 13, paddingBottom: 13, height: 72, position: "sticky", top: 0, zIndex: 35 }}
    >
      <div className="flex items-center" style={{ gap: 14, minWidth: 0 }}>
        <button
          onClick={onOpenDrawer}
          aria-label="Open navigation menu"
          className="lg:hidden flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 32, height: 32, background: "var(--input-bg)", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
        >
          <Menu size={16} />
        </button>
        <span className="hidden md:inline font-bold whitespace-nowrap" style={{ fontSize: 13 }}>TaskBuddy Admin</span>
        <span className="hidden md:block flex-shrink-0" style={{ width: 1, height: 22, background: "var(--border-md)" }} />

        <div className="relative min-w-0" style={{ width: "clamp(150px, 36vw, 420px)" }} ref={searchRef}>
        <span className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ left: 12, opacity: 0.45, display: "flex" }}>
          <Search size={13} />
        </span>
        <input
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search users, bookings, transactions…"
          aria-label="Search"
          className="w-full outline-none"
          style={{ height: 38, background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "0 13px 0 36px", fontSize: 12, color: "var(--text-white)" }}
        />
        {searchOpen && searchQuery.trim().length >= 2 && (
          <div
            className="absolute left-0 rounded-xl overflow-hidden"
            style={{ top: 38, width: "100%", minWidth: 280, background: "var(--panel-bg)", border: "1px solid var(--panel-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 50 }}
          >
            {searchResults.length === 0 ? (
              <div className="text-center py-6" style={{ fontSize: 11.4, color: "var(--text-muted)" }}>
                No matches in currently loaded records.
              </div>
            ) : (
              searchResults.map((r) => (
                <Link
                  key={r.key}
                  href={pageToPath(r.page)}
                  onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover-row"
                  style={{ borderBottom: "1px solid var(--border)", textDecoration: "none" }}
                >
                  <div className="flex items-center justify-center flex-shrink-0 rounded-lg" style={{ width: 26, height: 26, background: "var(--indigo-dark)", color: "var(--indigo-light)" }}>
                    {r.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate" style={{ fontSize: 11.4 }}>{r.label}</div>
                    <div className="truncate" style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 1 }}>{r.sub}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <span className="hidden lg:block" style={{ fontSize: 11, color: "var(--text-muted)" }}>{today}</span>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            aria-label={notifCount > 0 ? `Notifications (${notifCount} unread)` : "Notifications"}
            aria-expanded={notifOpen}
            className="flex items-center justify-center"
            style={{ width: 36, height: 36, background: "var(--input-bg)", borderRadius: 10, border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            <Bell size={15} />
          </button>
          {notifCount > 0 && (
            <span
              className="absolute flex items-center justify-center font-bold pointer-events-none"
              style={{ top: -3, right: -3, background: "var(--red)", color: "#fff", fontSize: 8, borderRadius: 999, minWidth: 16, height: 16, padding: "0 2px", border: "2px solid var(--bg-header)" }}
            >
              {notifCount}
            </span>
          )}

          {/* Dropdown panel */}
          {notifOpen && (
            <div
              className="absolute right-0 rounded-xl overflow-hidden"
              style={{ top: 43, width: "min(360px, calc(100vw - 24px))", background: "var(--panel-bg)", border: "1px solid var(--panel-border)", boxShadow: "0 18px 50px rgba(0,0,0,0.48)", zIndex: 50 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="text-white font-semibold" style={{ fontSize: 13 }}>Notifications</div>
                <div className="flex items-center gap-2">
                  {notifCount > 0 && (
                    <span style={{ fontSize: 9.8, background: "rgba(239,68,68,0.15)", color: "var(--danger-text)", borderRadius: 999, padding: "2px 7px", fontWeight: 600 }}>
                      {notifCount} new
                    </span>
                  )}
                  <button onClick={() => setNotifOpen(false)} aria-label="Close notifications" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}>
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Items */}
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {pendingVerifs.length === 0 && openDisputes.length === 0 && (
                  <div className="text-center py-8" style={{ fontSize: 12, color: "var(--text-muted)" }}>All caught up!</div>
                )}

                {pendingVerifs.length > 0 && (
                  <div>
                    <div className="px-4 py-2 uppercase" style={{ fontSize: "var(--fs-2xs)", color: "var(--nav-fg-muted)", fontWeight: 600, letterSpacing: "var(--tr-label)" }}>Pending Verifications</div>
                    {pendingVerifs.map((v) => (
                      <Link
                        key={v.email}
                        href={pageToPath("verifications")}
                        onClick={() => setNotifOpen(false)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover-row"
                        style={{ borderBottom: "1px solid var(--border)", textDecoration: "none" }}
                      >
                        <div className="flex items-center justify-center flex-shrink-0 rounded-lg" style={{ width: 28, height: 28, background: "rgba(245,158,11,0.15)", marginTop: 1 }}>
                          <ShieldCheck size={13} style={{ color: "#f59e0b" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium" style={{ fontSize: 11.4 }}>{v.name} needs verification</div>
                          <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 2 }}>{v.documents.length} document{v.documents.length === 1 ? "" : "s"} · Submitted {v.date}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {openDisputes.length > 0 && (
                  <div>
                    <div className="px-4 py-2 uppercase" style={{ fontSize: "var(--fs-2xs)", color: "var(--nav-fg-muted)", fontWeight: 600, letterSpacing: "var(--tr-label)" }}>Open Disputes</div>
                    {openDisputes.map((d) => (
                      <Link
                        key={d.id}
                        href={pageToPath("disputes")}
                        onClick={() => setNotifOpen(false)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover-row"
                        style={{ borderBottom: "1px solid var(--border)", textDecoration: "none" }}
                      >
                        <div className="flex items-center justify-center flex-shrink-0 rounded-lg" style={{ width: 28, height: 28, background: "rgba(239,68,68,0.15)", marginTop: 1 }}>
                          <AlertTriangle size={13} style={{ color: "var(--danger-text)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium" style={{ fontSize: 11.4 }}>{d.jobTitle} — Dispute raised</div>
                          <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 2 }}>{d.clientName} · {d.amount} · {d.createdAt}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer — points at whichever queue this dropdown is actually
                  showing. It used to always say "View all verifications" even
                  when every notification was a dispute, sending the admin to
                  an empty page. */}
              <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px" }}>
                <Link
                  href={pageToPath(pendingVerifs.length > 0 ? "verifications" : "disputes")}
                  onClick={() => setNotifOpen(false)}
                  className="block w-full text-center font-medium transition-opacity hover:opacity-75"
                  style={{ fontSize: 11.4, color: "var(--indigo-light)", textDecoration: "none" }}
                >
                  {pendingVerifs.length > 0 ? "View all verifications" : "View all disputes"}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
