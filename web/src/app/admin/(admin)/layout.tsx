"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { Sidebar, SIDEBAR_WIDTH } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LOGIN_PATH, pathToPage } from "@/lib/routes";

/**
 * Chrome + auth gate for every admin page. Routes live under `/admin/*`; the
 * `(admin)` route group shares this layout without adding a path segment.
 *
 * `app-shell` stays on the root: pages not yet rebuilt still rely on its
 * legacy light-theme overrides.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, sessionRestored, logout, sidebarCollapsed, setSidebarCollapsed, loadError, retryLoad, refreshData } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const activePage = pathToPage(pathname);
  const reduce = useReducedMotion();

  useLiveRefresh(refreshData, { enabled: isLoggedIn });

  // Gated on sessionRestored: isLoggedIn is false on the server and on the
  // client's first render, so redirecting without this check would bounce a
  // signed-in admin to /login on every hard refresh.
  useEffect(() => {
    if (sessionRestored && !isLoggedIn) router.replace(LOGIN_PATH);
  }, [sessionRestored, isLoggedIn, router]);

  // The mobile drawer must close from the keyboard too.
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
      <div className="ui-root grid h-screen place-items-center bg-background text-[13px] text-muted-foreground">
        <div className="flex items-center gap-2.5">
          <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
          Loading the Admin Console…
        </div>
      </div>
    );
  }

  const offset = sidebarCollapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="app-shell ui-root flex h-screen overflow-hidden bg-background text-foreground" style={{ ["--shell-offset" as string]: `${offset}px` }}>
        {drawerOpen && (
          <div className="ui-overlay fixed inset-0 z-30 bg-overlay lg:hidden" data-state="open" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
        )}

        <Sidebar
          activePage={activePage}
          onNavigate={() => setDrawerOpen(false)}
          onLogout={logout}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          drawerOpen={drawerOpen}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden transition-[padding] duration-200 ease-out lg:pl-[var(--shell-offset)]">
          <Header onOpenDrawer={() => setDrawerOpen(true)} />

          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-auto">
            <div className="mx-auto w-full max-w-[1540px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:pb-12 lg:pt-7">
              {/* Above every page: a failed load leaves all of them showing
                  empty tables and zeroed stats, so the warning belongs where
                  it's visible whichever page the admin is on. */}
              {loadError && (
                <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] border border-danger/25 bg-danger-soft px-4 py-3 text-[13px] text-danger">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{loadError} The figures below may be incomplete or empty.</span>
                  <Button size="sm" variant="outline" onClick={retryLoad} className="border-danger/30 text-danger hover:bg-danger/10">
                    <RotateCw /> Retry
                  </Button>
                </div>
              )}
              <motion.div
                key={pathname}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                {children}
              </motion.div>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
