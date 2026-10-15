"use client";

import { useEffect, useRef, useState } from "react";
import * as services from "@/lib/services";
import { useLiveTick } from "@/hooks/useLiveTick";
import type { AdminBookingDetail } from "@/lib/domain";

/** A completed job's detail is trusted this long before a live tick fetches it again. */
export const BOOKING_DETAIL_MAX_AGE_MS = 60_000;

export type BookingDetailResult = AdminBookingDetail | "error";

interface CacheEntry {
  detail: BookingDetailResult;
  fetchedAt: number;
}

/** A failed request, a job not completed yet, or a detail older than the max age is fetched again. */
function needsRefetch(entry: CacheEntry, now: number): boolean {
  if (entry.detail === "error") return true;
  if (!entry.detail.completedAt) return true;
  return now - entry.fetchedAt > BOOKING_DETAIL_MAX_AGE_MS;
}

/**
 * GET /admin/bookings/:id for the given job, cached per job id with the time it
 * was fetched. It is requested when a job is selected and again on each live
 * tick while that job stays selected, but only when the cached result is an
 * error, is not completed yet, or is older than the max age. At most one request
 * per job is in flight at a time. Returns undefined while loading.
 */
export function useBookingDetailCache(jobId: string | null | undefined): BookingDetailResult | undefined {
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});
  const cacheRef = useRef(cache);
  const inFlight = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  useLiveTick(() => setTick((n) => n + 1));

  useEffect(() => {
    if (!jobId || inFlight.current.has(jobId)) return;
    const entry = cacheRef.current[jobId];
    if (entry && !needsRefetch(entry, Date.now())) return;
    inFlight.current.add(jobId);
    const store = (next: CacheEntry) => {
      cacheRef.current = { ...cacheRef.current, [jobId]: next };
      setCache(cacheRef.current);
    };
    services
      .getBookingDetail(jobId)
      .then((detail) => store({ detail, fetchedAt: Date.now() }))
      .catch(() => store({ detail: "error", fetchedAt: Date.now() }))
      .finally(() => {
        inFlight.current.delete(jobId);
      });
  }, [jobId, tick]);

  return jobId ? cache[jobId]?.detail : undefined;
}
