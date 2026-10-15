import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueCounts } from "@/lib/attention";
import { INBOX_KEY, MERGE_WINDOW_MS, serializeInbox, type InboxEntry } from "@/lib/inbox";

const mockState = vi.hoisted(() => ({
  queueCounts: { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 } as QueueCounts,
  lastUpdated: null as number | null,
  isLoggedIn: true,
}));

vi.mock("@/context/AppContext", () => ({
  useApp: () => mockState,
}));

import { useAdminInbox } from "./useAdminInbox";

const NOW = Date.UTC(2026, 9, 15, 2, 0, 0);

const counts = (over: Partial<QueueCounts> = {}): QueueCounts => ({
  verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0, ...over,
});

/** One reading of the context: the counts and the time they were loaded. */
function reading(over: Partial<QueueCounts>, loadedAt: number) {
  mockState.queueCounts = counts(over);
  mockState.lastUpdated = loadedAt;
}

const stored = (): InboxEntry[] => JSON.parse(localStorage.getItem(INBOX_KEY) ?? "[]");

beforeEach(() => {
  localStorage.clear();
  mockState.queueCounts = counts();
  mockState.lastUpdated = null;
  mockState.isLoggedIn = true;
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAdminInbox", () => {
  it("starts from the inbox stored in this browser", () => {
    const saved: InboxEntry[] = [
      { id: "a", queue: "disputes", title: "1 new dispute", count: 1, createdAt: NOW - 1000, read: false },
    ];
    localStorage.setItem(INBOX_KEY, serializeInbox(saved));
    const { result } = renderHook(() => useAdminInbox());
    expect(result.current.entries).toEqual(saved);
    expect(result.current.unread).toBe(1);
  });

  it("does not create entries from the first reading after login", () => {
    reading({ verifications: 4, withdrawals: 2 }, 1);
    const { result } = renderHook(() => useAdminInbox());
    expect(result.current.entries).toEqual([]);
    expect(result.current.unread).toBe(0);
  });

  it("creates an unread entry, and stores it, when a queue rises after the first reading", () => {
    reading({ disputes: 1 }, 1);
    const { result, rerender } = renderHook(() => useAdminInbox());

    reading({ disputes: 3 }, 2);
    rerender();

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({ queue: "disputes", title: "2 new disputes", count: 2, read: false });
    expect(result.current.unread).toBe(1);
    expect(stored()).toHaveLength(1);
  });

  it("never creates entries from an unknown (null) count", () => {
    reading({ withdrawals: null }, 1);
    const { result, rerender } = renderHook(() => useAdminInbox());

    reading({ withdrawals: 4 }, 2);
    rerender();
    expect(result.current.entries).toEqual([]);

    reading({ withdrawals: null }, 3);
    rerender();
    reading({ withdrawals: 9 }, 4);
    rerender();
    expect(result.current.entries).toEqual([]);
  });

  it("does not turn the counts left behind by a sign-out into entries on the next login", () => {
    reading({ verifications: 0 }, 1);
    const { result, rerender } = renderHook(() => useAdminInbox());
    reading({ verifications: 2 }, 2);
    rerender();
    expect(result.current.entries).toHaveLength(1);

    mockState.isLoggedIn = false;
    rerender();
    mockState.isLoggedIn = true;
    rerender(); // same lastUpdated as before sign-out: stale counts, not a new reading
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].count).toBe(2);
  });

  it("merges a repeat arrival inside the merge window into the existing entry", () => {
    reading({ verifications: 0 }, 1);
    const { result, rerender } = renderHook(() => useAdminInbox());
    reading({ verifications: 2 }, 2);
    rerender();

    vi.spyOn(Date, "now").mockReturnValue(NOW + MERGE_WINDOW_MS - 1000);
    reading({ verifications: 5 }, 3);
    rerender();

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({ count: 5, title: "5 new provider verifications", read: false });
  });

  it("marks entries read, one at a time or all at once, and keeps that across a reload", () => {
    localStorage.setItem(INBOX_KEY, serializeInbox([
      { id: "a", queue: "disputes", title: "1 new dispute", count: 1, createdAt: NOW, read: false },
      { id: "b", queue: "withdrawals", title: "1 new withdrawal request", count: 1, createdAt: NOW - 1000, read: false },
    ]));
    const { result } = renderHook(() => useAdminInbox());

    act(() => result.current.markRead("a"));
    expect(result.current.unread).toBe(1);
    expect(stored().find((e) => e.id === "a")?.read).toBe(true);

    act(() => result.current.markAllRead());
    expect(result.current.unread).toBe(0);
  });

  it("removes entries one at a time and in batches", () => {
    localStorage.setItem(INBOX_KEY, serializeInbox([
      { id: "a", queue: "disputes", title: "1 new dispute", count: 1, createdAt: NOW, read: true },
      { id: "b", queue: "withdrawals", title: "1 new withdrawal request", count: 1, createdAt: NOW - 1000, read: true },
      { id: "c", queue: "skill-requests", title: "1 new service request", count: 1, createdAt: NOW - 2000, read: false },
    ]));
    const { result } = renderHook(() => useAdminInbox());

    act(() => result.current.remove("a"));
    expect(result.current.entries.map((e) => e.id)).toEqual(["b", "c"]);

    act(() => result.current.removeMany(["b", "c"]));
    expect(result.current.entries).toEqual([]);
    expect(stored()).toEqual([]);
  });

  it("clears everything only once every entry is read", () => {
    localStorage.setItem(INBOX_KEY, serializeInbox([
      { id: "a", queue: "disputes", title: "1 new dispute", count: 1, createdAt: NOW, read: false },
    ]));
    const { result } = renderHook(() => useAdminInbox());

    expect(result.current.canDeleteAll).toBe(false);
    act(() => result.current.removeAll());
    expect(result.current.entries).toHaveLength(1);

    act(() => result.current.markAllRead());
    expect(result.current.canDeleteAll).toBe(true);
    act(() => result.current.removeAll());
    expect(result.current.entries).toEqual([]);
  });

  it("removes a queue's entries once its live count reaches 0", () => {
    localStorage.setItem(INBOX_KEY, serializeInbox([
      { id: "a", queue: "verifications", title: "2 new provider verifications", count: 2, createdAt: NOW, read: false },
      { id: "b", queue: "disputes", title: "1 new dispute", count: 1, createdAt: NOW, read: false },
    ]));
    reading({ verifications: 3, disputes: 1 }, 1);
    const { result, rerender } = renderHook(() => useAdminInbox());

    reading({ verifications: 0, disputes: 1 }, 2);
    rerender();

    expect(result.current.entries.map((e) => e.id)).toEqual(["b"]);
  });

  it("keeps a queue's entries while its count is unknown", () => {
    localStorage.setItem(INBOX_KEY, serializeInbox([
      { id: "a", queue: "withdrawals", title: "1 new withdrawal request", count: 1, createdAt: NOW, read: false },
    ]));
    reading({ withdrawals: 1 }, 1);
    const { result, rerender } = renderHook(() => useAdminInbox());

    reading({ withdrawals: null }, 2);
    rerender();

    expect(result.current.entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("does not clear the stored inbox before the first load finishes", () => {
    localStorage.setItem(INBOX_KEY, serializeInbox([
      { id: "a", queue: "verifications", title: "1 new provider verification", count: 1, createdAt: NOW, read: false },
    ]));
    // Before any load the context's counts are placeholders (all zero), not data.
    const { result } = renderHook(() => useAdminInbox());
    expect(result.current.entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("picks up changes another tab made to the stored inbox", () => {
    const { result } = renderHook(() => useAdminInbox());
    expect(result.current.entries).toEqual([]);

    const other: InboxEntry[] = [
      { id: "x", queue: "disputes", title: "1 new dispute", count: 1, createdAt: NOW, read: false },
    ];
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: INBOX_KEY, newValue: serializeInbox(other) }));
    });
    expect(result.current.entries).toEqual(other);
  });
});
