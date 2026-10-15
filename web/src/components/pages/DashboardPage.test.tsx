import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import type { DashboardStats } from "@/lib/domain";
import type { QueueCounts } from "@/lib/attention";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  getEscrowHeld: vi.fn(),
  getBookingStatusCounts: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedGetEscrowHeld = vi.mocked(services.getEscrowHeld);
const mockedGetBookingStatusCounts = vi.mocked(services.getBookingStatusCounts);

const stats: DashboardStats = {
  totalUsers: 20,
  activeProviders: 8,
  totalBookings: 12,
  pendingVerifications: 0,
  totalRevenue: 0,
  monthlyRevenue: 0,
  completionRate: 0,
  avgRating: 0,
  totalCommission: 0,
  monthlyCommission: 0,
  pendingWithdrawals: 0,
  escrowHeld: 500,
  escrowCount: 2,
  openJobs: 3,
  matchingJobs: 4,
};

const allZeroQueues: QueueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 };

function setDashboardState(
  dashboardStats: DashboardStats | null = stats,
  queueCounts: QueueCounts = allZeroQueues,
) {
  mockedUseApp.mockReturnValue({
    adminProfile: { name: "Morgan Lee" },
    dashboardStats,
    recentActivity: [],
    disputes: [],
    users: [],
    revenueSeries: [],
    bookingsSeries: [],
    loading: false,
    analyticsUnavailable: false,
    analyticsInBrowser: false,
    retryLoad: vi.fn(),
    lastUpdated: 1,
    queueCounts,
  } as unknown as ReturnType<typeof useApp>);
}

describe("DashboardPage queue counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDashboardState();
    mockedGetEscrowHeld.mockResolvedValue({ count: 2, total: 500 });
    mockedGetBookingStatusCounts.mockResolvedValue({ open: 3, recommending: 4 } as Awaited<ReturnType<typeof services.getBookingStatusCounts>>);
  });

  it("reads the payout and verification tiles from the live queue counts, not the summary", async () => {
    setDashboardState(
      { ...stats, pendingWithdrawals: 0, pendingVerifications: 0 },
      { ...allZeroQueues, withdrawals: 3, verifications: 2 },
    );
    render(<DashboardPage />);

    const payoutQueue = screen.getByRole("link", { name: /payout requests/ });
    expect(within(payoutQueue).getByText("3")).toBeInTheDocument();
    const verifyQueue = screen.getByRole("link", { name: /providers to verify/ });
    expect(within(verifyQueue).getByText("2")).toBeInTheDocument();
  });

  it("shows a failed payout count as unavailable, never zero or all clear, even when the summary says 0", async () => {
    // The browser analytics fallback reports 0 when the withdrawal request fails.
    setDashboardState(
      { ...stats, pendingWithdrawals: 0, escrowCount: 0, openJobs: 0, matchingJobs: 0 },
      { ...allZeroQueues, withdrawals: null },
    );
    mockedGetEscrowHeld.mockResolvedValue({ count: 0, total: 0 });
    render(<DashboardPage />);

    const payoutQueue = screen.getByRole("link", { name: /payout requests/ });
    expect(within(payoutQueue).getByText("—")).toBeInTheDocument();
    expect(within(payoutQueue).queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText("Some queue counts are unavailable.")).toBeInTheDocument();
    await screen.findByRole("link", { name: /service requests/ });
    expect(screen.queryByText("All clear: nothing is waiting for review.")).not.toBeInTheDocument();
    expect(screen.getByText("Some queue counts are unavailable.")).toBeInTheDocument();
  });

  it("shows the all-clear sentence only when every queue is known and empty", async () => {
    setDashboardState({ ...stats, escrowCount: 0, openJobs: 0, matchingJobs: 0 }, allZeroQueues);
    mockedGetEscrowHeld.mockResolvedValue({ count: 0, total: 0 });
    render(<DashboardPage />);

    expect(await screen.findByText("All clear: nothing is waiting for review.")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("uses summary totals and the exact pending service-request count without list fallbacks", async () => {
    setDashboardState(stats, { ...allZeroQueues, "skill-requests": 23 });
    render(<DashboardPage />);

    const skillQueue = await screen.findByRole("link", { name: /service requests/ });
    expect(within(skillQueue).getByText("23")).toBeInTheDocument();
    expect(mockedGetEscrowHeld).not.toHaveBeenCalled();
    expect(mockedGetBookingStatusCounts).not.toHaveBeenCalled();
  });

  it("falls back to escrow and booking counts when the summary has no new totals", async () => {
    setDashboardState({
      ...stats,
      escrowHeld: undefined,
      escrowCount: undefined,
      openJobs: undefined,
      matchingJobs: undefined,
    }, { ...allZeroQueues, "skill-requests": 23 });
    render(<DashboardPage />);

    const skillQueue = await screen.findByRole("link", { name: /service requests/ });
    expect(within(skillQueue).getByText("23")).toBeInTheDocument();
    expect(mockedGetEscrowHeld).toHaveBeenCalledTimes(1);
    expect(mockedGetBookingStatusCounts).toHaveBeenCalledTimes(1);
  });

  it("shows a failed queue count as unavailable instead of zero or all clear", async () => {
    setDashboardState(stats, { ...allZeroQueues, "skill-requests": null });
    render(<DashboardPage />);

    const escrowQueue = screen.getByRole("link", { name: /escrow holds/ });
    await waitFor(() => expect(within(escrowQueue).getByText("2")).toBeInTheDocument());
    const skillQueue = await screen.findByRole("link", { name: /service requests/ });
    expect(within(skillQueue).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Some queue counts are unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("All clear: nothing is waiting for review.")).not.toBeInTheDocument();
  });
});
