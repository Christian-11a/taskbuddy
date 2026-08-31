"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { LOGIN_PATH, pathToPage } from "@/lib/routes";

/**
 * Chrome + auth gate for every admin page. A route group `(admin)` rather than
 * a path segment, so the URLs stay `/users` and not `/admin/users` — the whole
 * app is the admin console, so an /admin prefix would be noise on every route.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, sessionRestored, logout, sidebarCollapsed, setSidebarCollapsed, loadError, retryLoad } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const activePage = pathToPage(pathname);

  // Gated on sessionRestored: isLoggedIn is false on the server and on the
  // client's first render, so redirecting without this check would bounce a
  // signed-in admin to /login on every hard refresh.
  useEffect(() => {
    if (sessionRestored && !isLoggedIn) router.replace(LOGIN_PATH);
  }, [sessionRestored, isLoggedIn, router]);

  // The mobile drawer could only be dismissed by tapping the overlay or
  // following a link — neither of which a keyboard user can reach, since the
  // overlay isn't focusable.
  useEffect(() => {
    if (!drawerOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [drawerOpen]);

  if (!sessionRestored || !isLoggedIn) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: "var(--bg-main)", color: "var(--text-muted)", fontSize: "var(--fs-md)" }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden" style={{ background: "var(--bg-main)" }}>
      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: "var(--overlay)" }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <Sidebar
        activePage={activePage}
        onNavigate={() => setDrawerOpen(false)}
        onLogout={logout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        drawerOpen={drawerOpen}
      />

      <div className={`content-area${sidebarCollapsed ? " sidebar-collapsed" : ""} flex flex-col flex-1 overflow-hidden`}>
        <Header onOpenDrawer={() => setDrawerOpen(true)} />

        <main
          className="flex-1 min-w-0 overflow-y-auto overflow-x-auto"
          style={{ background: "var(--bg-main)" }}
        >
          <div className="w-full max-w-[1540px] mx-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:pt-[26px] lg:pb-10">
          {/* Sits above every page rather than inside one: a failed load
              leaves *all* of them showing empty tables and zeroed stats, so
              the warning belongs where it's visible regardless of which
              route the admin happens to be on. */}
          {loadError && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl mb-4 flex-wrap"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", padding: "10px 14px", fontSize: "var(--fs-sm)", color: "var(--danger-text)" }}
            >
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>{loadError} The figures below may be incomplete or empty.</span>
              <button
                onClick={retryLoad}
                className="font-semibold transition-opacity hover:opacity-80 ml-auto"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--r-md)", padding: "4px 12px", fontSize: "var(--fs-xs)", color: "var(--danger-text)", cursor: "pointer", fontFamily: "inherit" }}
              >
                Retry
              </button>
            </div>
          )}
          {children}
          </div>
        </main>
      </div>
    </div>
  );
}
