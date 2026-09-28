"use client";

import { useEffect, useRef } from "react";

interface LiveRefreshOptions {
  /** How often to refresh while the tab is visible. Default 30 s. */
  intervalMs?: number;
  /** Turn the whole thing off (e.g. while signed out). Default true. */
  enabled?: boolean;
}

/**
 * Drives the console's "live" feel without any backend push: re-runs
 * `refresh` on an interval while the tab is visible, skips ticks while it is
 * hidden (no point polling a background tab), and refreshes once as soon as
 * the admin comes back to it.
 */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  { intervalMs = 30_000, enabled = true }: LiveRefreshOptions = {},
): void {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const run = () => void latest.current();
    const isVisible = () => document.visibilityState === "visible";

    const timer = window.setInterval(() => {
      if (isVisible()) run();
    }, intervalMs);

    let wasHidden = !isVisible();
    const onVisibility = () => {
      if (isVisible()) {
        if (wasHidden) run();
        wasHidden = false;
      } else {
        wasHidden = true;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
