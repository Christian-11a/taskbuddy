import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useBookingDetailCache, BOOKING_DETAIL_MAX_AGE_MS } from "./useBookingDetailCache";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import type { AdminBookingDetail } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({ useApp: vi.fn() }));
vi.mock("@/lib/services", () => ({
  getBookingDetail: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedGetBookingDetail = vi.mocked(services.getBookingDetail);

function booking(completedAt: string | null): AdminBookingDetail {
  return { description: null, address: null, scheduledAt: null, photoUrls: [], escrowStatus: null, escrowAmount: null, completedAt, status: "completed" };
}

/** Simulates the console's live refresh landing with a new lastUpdated stamp. */
function liveTick(lastUpdated: number) {
  mockedUseApp.mockReturnValue({ lastUpdated } as unknown as ReturnType<typeof useApp>);
}

beforeEach(() => {
  vi.clearAllMocks();
  liveTick(1);
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useBookingDetailCache", () => {
  it("does not refetch a completed detail that is still fresh on a live tick", async () => {
    mockedGetBookingDetail.mockResolvedValue(booking("2026-10-14T12:00:00Z"));
    const { result, rerender } = renderHook(({ jobId }) => useBookingDetailCache(jobId), { initialProps: { jobId: "j1" as string | null } });
    await waitFor(() => expect(result.current).toEqual(booking("2026-10-14T12:00:00Z")));
    liveTick(2);
    rerender({ jobId: "j1" });
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(1);
  });

  it("retries a failed request on the next live tick and recovers", async () => {
    mockedGetBookingDetail
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(booking("2026-10-14T12:00:00Z"));
    const { result, rerender } = renderHook(({ jobId }) => useBookingDetailCache(jobId), { initialProps: { jobId: "j1" as string | null } });
    await waitFor(() => expect(result.current).toBe("error"));

    liveTick(2);
    rerender({ jobId: "j1" });
    await waitFor(() => expect(result.current).toEqual(booking("2026-10-14T12:00:00Z")));
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("refetches a job that was not completed yet once a live tick finds it completed", async () => {
    mockedGetBookingDetail
      .mockResolvedValueOnce(booking(null))
      .mockResolvedValueOnce(booking("2026-10-15T11:00:00Z"));
    const { result, rerender } = renderHook(({ jobId }) => useBookingDetailCache(jobId), { initialProps: { jobId: "j1" as string | null } });
    await waitFor(() => expect(result.current).toEqual(booking(null)));

    liveTick(2);
    rerender({ jobId: "j1" });
    await waitFor(() => expect(result.current).toEqual(booking("2026-10-15T11:00:00Z")));
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("refetches a completed detail older than the max age on a live tick", async () => {
    mockedGetBookingDetail.mockResolvedValue(booking("2026-10-14T12:00:00Z"));
    const { result, rerender } = renderHook(({ jobId }) => useBookingDetailCache(jobId), { initialProps: { jobId: "j1" as string | null } });
    await waitFor(() => expect(result.current).toEqual(booking("2026-10-14T12:00:00Z")));

    vi.setSystemTime(new Date(Date.now() + BOOKING_DETAIL_MAX_AGE_MS + 1_000));
    liveTick(2);
    rerender({ jobId: "j1" });
    await waitFor(() => expect(mockedGetBookingDetail).toHaveBeenCalledTimes(2));
  });

  it("keeps at most one request in flight per job", async () => {
    mockedGetBookingDetail.mockReturnValue(new Promise<AdminBookingDetail>(() => {}));
    const { rerender } = renderHook(({ jobId }) => useBookingDetailCache(jobId), { initialProps: { jobId: "j1" as string | null } });
    liveTick(2);
    rerender({ jobId: "j1" });
    liveTick(3);
    rerender({ jobId: "j1" });
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(1);
  });

  it("returns undefined and fetches nothing without a job", () => {
    const { result } = renderHook(() => useBookingDetailCache(null));
    expect(result.current).toBeUndefined();
    expect(mockedGetBookingDetail).not.toHaveBeenCalled();
  });
});
