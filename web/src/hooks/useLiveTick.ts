"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";

/**
 * Runs `onTick` each time the console's live refresh lands (AppContext's
 * `lastUpdated` changes) — but not on mount, where the page does its own
 * first load. Lets page-local queues stay as fresh as the shared data.
 */
export function useLiveTick(onTick: () => void) {
  const { lastUpdated } = useApp();
  const latest = useRef(onTick);
  const first = useRef(lastUpdated);
  useEffect(() => {
    latest.current = onTick;
  });
  useEffect(() => {
    if (lastUpdated === null || lastUpdated === first.current) return;
    latest.current();
  }, [lastUpdated]);
}
