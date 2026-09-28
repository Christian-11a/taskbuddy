"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Re-renders every `ms` so relative times ("12s ago") keep ticking. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function ago(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

/**
 * "Live · updated 12s ago". The data behind it refreshes in the background
 * (useLiveRefresh); clicking forces a refresh now. Turns red while the last
 * load failed, so a stale console never passes for a live one.
 */
export function LiveIndicator() {
  const { lastUpdated, refreshing, refreshData, loadError } = useApp();
  const now = useNow(5000);
  const seconds = lastUpdated ? Math.max(0, Math.round((now - lastUpdated) / 1000)) : null;
  const offline = Boolean(loadError);
  const label = offline ? "Offline" : "Live";
  const detail = offline ? "Couldn't reach the server" : seconds === null ? "Connecting…" : `Updated ${ago(seconds)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void refreshData()}
          aria-label={`${label}. ${detail}. Refresh now`}
          className="group flex h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative flex size-2">
            {!offline && (
              <span
                className={cn(
                  "absolute inline-flex size-full rounded-full bg-ok opacity-60",
                  refreshing ? "motion-safe:animate-ping" : "motion-safe:animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite] opacity-30",
                )}
              />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", offline ? "bg-danger" : "bg-ok")} />
          </span>
          <span className="text-foreground">{label}</span>
          <span className="hidden tabular text-subtle xl:inline">· {detail}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{detail} · click to refresh</TooltipContent>
    </Tooltip>
  );
}
