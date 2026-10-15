import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueCounts } from "@/lib/attention";

const mockState = vi.hoisted(() => ({
  queueCounts: { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 } as QueueCounts,
  isLoggedIn: true,
  pathname: "/admin/dashboard",
}));

vi.mock("@/context/AppContext", () => ({
  useApp: () => mockState,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockState.pathname,
}));

import { useDocumentTitleCount } from "./useDocumentTitleCount";

const BASE = "TaskBuddy Admin";

beforeEach(() => {
  document.title = BASE;
  mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 };
  mockState.isLoggedIn = true;
  mockState.pathname = "/admin/dashboard";
});

afterEach(() => {
  document.title = BASE;
});

describe("useDocumentTitleCount", () => {
  it("prefixes the title with the total of every queue", () => {
    mockState.queueCounts = { verifications: 1, disputes: 1, withdrawals: 2, "skill-requests": 3 };
    renderHook(() => useDocumentTitleCount());
    expect(document.title).toBe("(7) TaskBuddy Admin");
  });

  it("updates the count as it changes and drops the prefix at zero", () => {
    mockState.queueCounts = { verifications: 2, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    const { rerender } = renderHook(() => useDocumentTitleCount());
    expect(document.title).toBe("(2) TaskBuddy Admin");

    mockState.queueCounts = { verifications: 5, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    rerender();
    expect(document.title).toBe("(5) TaskBuddy Admin");

    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    rerender();
    expect(document.title).toBe(BASE);
  });

  it("restores the plain title on unmount", () => {
    mockState.queueCounts = { verifications: 4, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    const { unmount } = renderHook(() => useDocumentTitleCount());
    expect(document.title).toBe("(4) TaskBuddy Admin");
    unmount();
    expect(document.title).toBe(BASE);
  });

  it("shows no count after sign-out", () => {
    mockState.queueCounts = { verifications: 4, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    const { rerender } = renderHook(() => useDocumentTitleCount());
    mockState.isLoggedIn = false;
    rerender();
    expect(document.title).toBe(BASE);
  });

  it("re-applies the count after a route change resets the title", () => {
    mockState.queueCounts = { verifications: 1, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    const { rerender } = renderHook(() => useDocumentTitleCount());
    // Next sets the page title on navigation; the hook must put the count back.
    document.title = "Users · TaskBuddy Admin";
    mockState.pathname = "/admin/users";
    rerender();
    expect(document.title).toBe("(1) Users · TaskBuddy Admin");
  });

  it("does not double the prefix when the title already carries one", () => {
    mockState.queueCounts = { verifications: 1, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    const { rerender } = renderHook(() => useDocumentTitleCount());
    rerender();
    rerender();
    expect(document.title).toBe("(1) TaskBuddy Admin");
  });

  it("re-applies the count when the title is changed after the hook ran", async () => {
    mockState.queueCounts = { verifications: 3, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    renderHook(() => useDocumentTitleCount());
    expect(document.title).toBe("(3) TaskBuddy Admin");
    // Simulate Next setting the page title after the effect has already run.
    document.title = "Bookings · TaskBuddy Admin";
    await waitFor(() => expect(document.title).toBe("(3) Bookings · TaskBuddy Admin"));
  });

  it("keeps a title change plain when the total is zero", async () => {
    renderHook(() => useDocumentTitleCount());
    document.title = "Bookings · TaskBuddy Admin";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.title).toBe("Bookings · TaskBuddy Admin");
  });

  it("does not loop on its own title writes", async () => {
    mockState.queueCounts = { verifications: 2, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    renderHook(() => useDocumentTitleCount());
    const writes = vi.fn();
    const title = document.querySelector("title");
    const observer = new MutationObserver(writes);
    observer.observe(title ?? document.head, { childList: true, characterData: true, subtree: true });
    document.title = "Bookings · TaskBuddy Admin";
    await waitFor(() => expect(document.title).toBe("(2) Bookings · TaskBuddy Admin"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    observer.disconnect();
    // One write from the test, one from the hook; a loop would keep this growing.
    expect(writes.mock.calls.length).toBeLessThanOrEqual(4);
    expect(document.title).toBe("(2) Bookings · TaskBuddy Admin");
  });

  it("restores the plain title and stops reacting after unmount", async () => {
    mockState.queueCounts = { verifications: 4, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    const { unmount } = renderHook(() => useDocumentTitleCount());
    unmount();
    expect(document.title).toBe(BASE);
    document.title = "Bookings · TaskBuddy Admin";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.title).toBe("Bookings · TaskBuddy Admin");
  });
});
