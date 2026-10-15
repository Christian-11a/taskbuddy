import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueCounts } from "@/lib/attention";

const mockState = vi.hoisted(() => ({
  queueCounts: { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 } as QueueCounts,
  lastUpdated: null as number | null,
  isLoggedIn: true,
  settings: { arrivalAlerts: true },
  showToast: vi.fn(),
}));

vi.mock("@/context/AppContext", () => ({
  useApp: () => mockState,
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockState.showToast }),
}));

import { useArrivalAlerts, QUEUE_ALERT_TEXT } from "./useArrivalAlerts";

const counts = (over: Partial<QueueCounts> = {}): QueueCounts => ({
  verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockState.queueCounts = counts();
  mockState.lastUpdated = null;
  mockState.isLoggedIn = true;
  mockState.settings = { arrivalAlerts: true };
});

describe("useArrivalAlerts", () => {
  it("does not toast for what was already waiting at the first reading", () => {
    mockState.queueCounts = counts({ verifications: 2, disputes: 1 });
    mockState.lastUpdated = 1;
    renderHook(() => useArrivalAlerts());
    expect(mockState.showToast).not.toHaveBeenCalled();
  });

  it("does nothing until the first load has finished", () => {
    mockState.queueCounts = counts({ verifications: 2 });
    const { rerender } = renderHook(() => useArrivalAlerts());
    mockState.queueCounts = counts({ verifications: 5 });
    rerender();
    expect(mockState.showToast).not.toHaveBeenCalled();
  });

  it("toasts once when a queue count rises, naming that queue", () => {
    mockState.lastUpdated = 1;
    mockState.queueCounts = counts({ disputes: 1 });
    const { rerender } = renderHook(() => useArrivalAlerts());

    mockState.queueCounts = counts({ disputes: 2 });
    mockState.lastUpdated = 2;
    rerender();

    expect(mockState.showToast).toHaveBeenCalledTimes(1);
    expect(mockState.showToast).toHaveBeenCalledWith(QUEUE_ALERT_TEXT.disputes);
  });

  it("toasts each queue that rose in the same reading", () => {
    mockState.lastUpdated = 1;
    const { rerender } = renderHook(() => useArrivalAlerts());

    mockState.queueCounts = counts({ withdrawals: 1, "skill-requests": 2 });
    mockState.lastUpdated = 2;
    rerender();

    expect(mockState.showToast).toHaveBeenCalledWith(QUEUE_ALERT_TEXT.withdrawals);
    expect(mockState.showToast).toHaveBeenCalledWith(QUEUE_ALERT_TEXT["skill-requests"]);
    expect(mockState.showToast).toHaveBeenCalledTimes(2);
  });

  it("does not toast when a count falls, stays put, or becomes unknown", () => {
    mockState.lastUpdated = 1;
    mockState.queueCounts = counts({ verifications: 3, withdrawals: 2 });
    const { rerender } = renderHook(() => useArrivalAlerts());

    mockState.queueCounts = counts({ verifications: 1, withdrawals: null });
    mockState.lastUpdated = 2;
    rerender();

    mockState.queueCounts = counts({ verifications: 1, withdrawals: 4 });
    mockState.lastUpdated = 3;
    rerender();

    // The 4 follows a null reading, so it is not compared against 2 and is not new work.
    expect(mockState.showToast).not.toHaveBeenCalled();
  });

  it("does nothing when the setting is off, and does not replay that work when it is turned on", () => {
    mockState.lastUpdated = 1;
    mockState.settings = { arrivalAlerts: false };
    mockState.queueCounts = counts({ disputes: 1 });
    const { rerender } = renderHook(() => useArrivalAlerts());

    mockState.queueCounts = counts({ disputes: 3 });
    mockState.lastUpdated = 2;
    rerender();
    expect(mockState.showToast).not.toHaveBeenCalled();

    mockState.settings = { arrivalAlerts: true };
    mockState.lastUpdated = 3;
    rerender();
    expect(mockState.showToast).not.toHaveBeenCalled();

    mockState.queueCounts = counts({ disputes: 4 });
    mockState.lastUpdated = 4;
    rerender();
    expect(mockState.showToast).toHaveBeenCalledTimes(1);
    expect(mockState.showToast).toHaveBeenCalledWith(QUEUE_ALERT_TEXT.disputes);
  });

  it("does not alert on the previous session's counts after signing back in", () => {
    // Session 1: the baseline is set from the first load.
    mockState.lastUpdated = 1;
    mockState.queueCounts = counts({ disputes: 1 });
    const { rerender } = renderHook(() => useArrivalAlerts());

    // Sign out. The context keeps the old counts and lastUpdated.
    mockState.isLoggedIn = false;
    rerender();

    // Sign back in while the new load is still pending: old counts, old lastUpdated.
    mockState.isLoggedIn = true;
    rerender();
    expect(mockState.showToast).not.toHaveBeenCalled();

    // The slow load completes with higher counts and a new lastUpdated. That is the
    // new session's silent baseline, so existing work must not toast.
    mockState.queueCounts = counts({ disputes: 3, verifications: 2 });
    mockState.lastUpdated = 2;
    rerender();
    expect(mockState.showToast).not.toHaveBeenCalled();

    // A genuine rise after that baseline toasts once.
    mockState.queueCounts = counts({ disputes: 4, verifications: 2 });
    mockState.lastUpdated = 3;
    rerender();
    expect(mockState.showToast).toHaveBeenCalledTimes(1);
    expect(mockState.showToast).toHaveBeenCalledWith(QUEUE_ALERT_TEXT.disputes);
  });
});
