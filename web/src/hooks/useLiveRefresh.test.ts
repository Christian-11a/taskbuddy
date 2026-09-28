import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveRefresh } from "./useLiveRefresh";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useLiveRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes on an interval while visible", () => {
    const refresh = vi.fn();
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }));
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("pauses while hidden and refreshes once on return", () => {
    const refresh = vi.fn();
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }));
    setVisibility("hidden");
    vi.advanceTimersByTime(5000);
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing when disabled", () => {
    const refresh = vi.fn();
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000, enabled: false }));
    vi.advanceTimersByTime(3000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("always calls the latest callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useLiveRefresh(cb, { intervalMs: 1000 }), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
