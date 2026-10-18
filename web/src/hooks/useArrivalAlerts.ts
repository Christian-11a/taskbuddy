"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/components/ui/Toast";
import { newWork, type QueueCounts, type QueueId } from "@/lib/attention";

export const QUEUE_ALERT_TEXT: Record<QueueId, string> = {
  verifications: "New provider verification to review",
  disputes: "New complaint or dispute to review",
  withdrawals: "A provider payout failed and needs a retry",
  "skill-requests": "New service request to review",
};

/**
 * A small toast when a queue's count rises while the console is open. The first
 * reading after login is only a baseline, so nothing already waiting toasts.
 */
export function useArrivalAlerts() {
  const { queueCounts, lastUpdated, settings, isLoggedIn } = useApp();
  const { showToast } = useToast();
  const previous = useRef<QueueCounts | null>(null);
  /** The lastUpdated in force when the admin signed out. The context keeps the
   *  old counts after logout, so until lastUpdated changes they are not a baseline. */
  const signedOutAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      previous.current = null;
      signedOutAt.current = lastUpdated;
      return;
    }
    if (lastUpdated === null || lastUpdated === signedOutAt.current) return; // no load of this session yet
    const fresh = settings.arrivalAlerts ? newWork(previous.current, queueCounts) : [];
    previous.current = queueCounts; // always advance, so turning alerts on later doesn't replay old work
    for (const id of fresh) showToast(QUEUE_ALERT_TEXT[id]);
  }, [isLoggedIn, queueCounts, lastUpdated, settings.arrivalAlerts, showToast]);
}
