import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import type { DashboardStats } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  getEscrowHeld: vi.fn(),
  getBookingStatusCounts: vi.fn(),
  getSkillRequestCount: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedGetEscrowHeld = vi.mocked(services.getEscrowHeld);
const mockedGetBookingStatusCounts = vi.mocked(services.getBookingStatusCounts);
const mockedGetSkillRequestCount = vi.mocked(services.getSkillRequestCount);

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

function setDashboardState(dashboardStats: DashboardStats | null = stats) {
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
  } as unknown as ReturnType<typeof useApp>);
}

describe("DashboardPage queue counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDashboardState();
    mockedGetEscrowHeld.mockResolvedValue({ count: 2, total: 500 });
    mockedGetBookingStatusCounts.mockResolvedValue({ open: 3, recommending: 4 } as Awaited<ReturnType<typeof services.getBookingStatusCounts>>);
    mockedGetSkillRequestCount.mockResolvedValue(23);
  });

  it("uses summary totals and the exact pending service-request count without list fallbacks", async () => {
    render(<DashboardPage />);

    const skillQueue = await screen.findByRole("link", { name: /service requests/ });
    expect(within(skillQueue).getByText("23")).toBeInTheDocument();
    expect(mockedGetSkillRequestCount).toHaveBeenCalledWith("pending");
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
    });
    render(<DashboardPage />);

    const skillQueue = await screen.findByRole("link", { name: /service requests/ });
    expect(within(skillQueue).getByText("23")).toBeInTheDocument();
    expect(mockedGetEscrowHeld).toHaveBeenCalledTimes(1);
    expect(mockedGetBookingStatusCounts).toHaveBeenCalledTimes(1);
  });

  it("shows a missing payout count as unavailable instead of zero", async () => {
    setDashboardState({ ...stats, pendingWithdrawals: null });
    render(<DashboardPage />);
    const payoutQueue = screen.getByRole("link", { name: /payout requests/ });
    expect(within(payoutQueue).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Some queue counts are unavailable.")).toBeInTheDocument();
  });

  it("shows a failed queue count as unavailable instead of zero or all clear", async () => {
    mockedGetSkillRequestCount.mockRejectedValueOnce(new Error("queue unavailable"));
    render(<DashboardPage />);

    const escrowQueue = screen.getByRole("link", { name: /escrow holds/ });
    await waitFor(() => expect(within(escrowQueue).getByText("2")).toBeInTheDocument());
    const skillQueue = await screen.findByRole("link", { name: /service requests/ });
    expect(within(skillQueue).getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Some queue counts are unavailable.")).toBeInTheDocument();
    expect(screen.queryByText("All clear: nothing is waiting for review.")).not.toBeInTheDocument();
  });
});
