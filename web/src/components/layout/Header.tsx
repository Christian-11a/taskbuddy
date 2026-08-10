"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Bell, Menu, ShieldCheck, AlertTriangle, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { pageToPath } from "@/lib/routes";

interface HeaderProps {
  title: string;
  onOpenDrawer: () => void;
}

export function Header({ title, onOpenDrawer }: HeaderProps) {
  const { verifications, disputes } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const pendingVerifs = verifications.filter((v) => v.status === "pending");
  const openDisputes = disputes.filter((d) => d.isOpen);
  const notifCount = pendingVerifs.length + openDisputes.length;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header
      className="flex items-center justify-between flex-shrink-0"
      style={{ background: "var(--bg-header)", borderBottom: "1px solid var(--border)", padding: "13px 20px", height: 69, position: "relative", zIndex: 10 }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenDrawer}
          aria-label="Open navigation menu"
          className="lg:hidden flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, background: "var(--input-bg)", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
        >
          <Menu size={16} />
        </button>
        <div>
          <div className="font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 19.6px)" }}>{title}</div>
          <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 4 }}>TaskBuddy Admin Console</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden md:block" style={{ fontSize: 11.4, color: "var(--text-muted)" }}>{today}</span>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            aria-label={notifCount > 0 ? `Notifications (${notifCount} unread)` : "Notifications"}
            aria-expanded={notifOpen}
            className="flex items-center justify-center"
            style={{ width: 29, height: 29, background: "var(--input-bg)", borderRadius: 11, border: "none", cursor: "pointer", color: "var(--text-muted)" }}
          >
            <Bell size={15} />
          </button>
          {notifCount > 0 && (
            <span
              className="absolute flex items-center justify-center font-bold pointer-events-none"
              style={{ top: -2, right: -2, background: "var(--red)", color: "#fff", fontSize: 7.3, borderRadius: 999, minWidth: 13, height: 13, padding: "0 2px" }}
            >
              {notifCount}
            </span>
          )}

          {/* Dropdown panel */}
          {notifOpen && (
            <div
              className="absolute right-0 rounded-xl overflow-hidden"
              style={{ top: 36, width: 320, background: "var(--panel-bg)", border: "1px solid var(--panel-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 50 }}
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
                    <div className="px-4 py-2 uppercase" style={{ fontSize: 8, color: "#4b5563", fontWeight: 600, letterSpacing: "0.8px" }}>Pending Verifications</div>
                    {pendingVerifs.map((v) => (
                      <Link
                        key={v.email}
                        href={pageToPath("verifications")}
                        onClick={() => setNotifOpen(false)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
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
                    <div className="px-4 py-2 uppercase" style={{ fontSize: 8, color: "#4b5563", fontWeight: 600, letterSpacing: "0.8px" }}>Open Disputes</div>
                    {openDisputes.map((d) => (
                      <Link
                        key={d.id}
                        href={pageToPath("disputes")}
                        onClick={() => setNotifOpen(false)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
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
