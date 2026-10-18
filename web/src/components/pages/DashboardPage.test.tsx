import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import type { DashboardStats } from "@/lib/domain";
import type { QueueCounts } from "@/lib/attention";
import { addMonths, currentMonthKey } from "@/lib/services/monthSeries";

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

/** Per-part readiness the Dashboard reads. Everything has answered unless a test says otherwise. */
type PartFlags = Partial<Record<"analyticsLoading" | "disputesLoading" | "verificationsLoading" | "activityLoading" | "countsLoading", boolean>>;

function setDashboardState(
  dashboardStats: DashboardStats | null = stats,
  queueCounts: QueueCounts = allZeroQueues,
  revenueSeries: { month: string; value: number }[] = [],
  parts: PartFlags = {},
  commissionSeries: { month: string; amount: number }[] = [],
) {
  mockedUseApp.mockReturnValue({
    ensureUsers: vi.fn(),
    adminProfile: { name: "Morgan Lee" },
    dashboardStats,
    recentActivity: [],
    disputes: [],
    users: [],
    usersLoading: false,
    revenueSeries,
    commissionSeries,
    bookingsSeries: [],
    analyticsUnavailable: false,
    analyticsInBrowser: false,
    analyticsLoading: false,
    disputesLoading: false,
    verificationsLoading: false,
    activityLoading: false,
    countsLoading: false,
    ...parts,
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

    const payoutQueue = screen.getByRole("link", { name: /failed payouts?/ });
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

    const payoutQueue = screen.getByRole("link", { name: /failed payouts?/ });
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

describe("DashboardPage commission headline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEscrowHeld.mockResolvedValue({ count: 2, total: 500 });
    mockedGetBookingStatusCounts.mockResolvedValue({ open: 3, recommending: 4 } as Awaited<ReturnType<typeof services.getBookingStatusCounts>>);
  });

  /** "YYYY-MM" keys in UTC, as the Dashboard reads them. */
  const utcKey = (offsetMonths: number) => addMonths(currentMonthKey(), offsetMonths);

  it("leads the key metrics with total commission earned, then total users and the other headline figures", async () => {
    setDashboardState({ ...stats, totalCommission: 1234.5, monthlyCommission: 300 }, allZeroQueues);
    render(<DashboardPage />);

    const metrics = screen.getByRole("region", { name: "Key metrics" });
    const labels = within(metrics)
      .getAllByText(/^(Total commission earned|Total users|Registered providers|Bookings this month|Released payments)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(["Total commission earned", "Total users", "Registered providers", "Bookings this month", "Released payments"]);

    expect(await within(metrics).findByText("₱1,234.50")).toBeInTheDocument();
    expect(within(metrics).getByText("₱300")).toBeInTheDocument();
    // Counts up on mount, so the figure is awaited.
    expect(await within(metrics).findByText("20")).toBeInTheDocument();
  });

  it("shows this month's commission against last month as a rise", async () => {
    setDashboardState(
      { ...stats, totalCommission: 500, monthlyCommission: 300 },
      allZeroQueues,
      [],
      {},
      [{ month: utcKey(-1), amount: 200 }, { month: utcKey(0), amount: 300 }],
    );
    render(<DashboardPage />);

    const metrics = screen.getByRole("region", { name: "Key metrics" });
    expect(within(metrics).getByText("50%")).toBeInTheDocument();
    expect(within(metrics).getAllByText("vs last month").length).toBeGreaterThan(0);
    expect(within(metrics).queryByText("No commission last month")).not.toBeInTheDocument();
  });

  it("says there was no commission last month instead of a percentage against zero", () => {
    setDashboardState({ ...stats, totalCommission: 300, monthlyCommission: 300 }, allZeroQueues, [], {}, [{ month: utcKey(0), amount: 300 }]);
    render(<DashboardPage />);

    const metrics = screen.getByRole("region", { name: "Key metrics" });
    expect(within(metrics).getByText("No commission last month")).toBeInTheDocument();
    expect(within(metrics).queryByText("vs last month")).not.toBeInTheDocument();
  });
});

describe("DashboardPage metric labels", () => {
  it("names each headline number for what the backend value measures", () => {
    setDashboardState(stats, allZeroQueues);
    render(<DashboardPage />);

    expect(screen.getByText("Registered providers")).toBeInTheDocument();
    expect(screen.getByText("Released payments")).toBeInTheDocument();
    expect(screen.getByText("Released payments trend")).toBeInTheDocument();
    expect(screen.queryByText("Active providers")).not.toBeInTheDocument();
    expect(screen.queryByText("Gross merchandise value")).not.toBeInTheDocument();
  });
});

describe("DashboardPage chart loading", () => {
  it("shows the tiles and a chart-height placeholder before the chart code arrives", () => {
    setDashboardState(stats, allZeroQueues, [{ month: "Aug", value: 1200 }, { month: "Sep", value: 1800 }]);
    const { container } = render(<DashboardPage />);

    expect(screen.getByText("Registered providers")).toBeInTheDocument();
    // recharts loads on its own chunk; until then the trend keeps its 220px slot.
    expect(container.querySelector('[style*="height: 220px"]')).not.toBeNull();
  });
});

describe("DashboardPage console parts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEscrowHeld.mockResolvedValue({ count: 2, total: 500 });
    mockedGetBookingStatusCounts.mockResolvedValue({ open: 3, recommending: 4 } as Awaited<ReturnType<typeof services.getBookingStatusCounts>>);
  });

  it("shows the queues, and placeholders for the analytics, while the analytics are still loading", () => {
    setDashboardState(null, { ...allZeroQueues, withdrawals: 3 }, [], { analyticsLoading: true });
    render(<DashboardPage />);

    expect(within(screen.getByRole("link", { name: /failed payouts?/ })).getByText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("Loading key metrics")).toBeInTheDocument();
    expect(screen.getByText("Released payments trend")).toBeInTheDocument();
    expect(screen.queryByText("No released payments yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument();
  });

  it("keeps the activity panel from claiming there is no activity while the activity is still loading", () => {
    setDashboardState(stats, allZeroQueues, [], { activityLoading: true });
    render(<DashboardPage />);
    expect(screen.queryByText("No recent activity")).not.toBeInTheDocument();
  });

  it("shows the queues as being checked, not as all clear, while a queue's list is still loading", () => {
    setDashboardState(stats, allZeroQueues, [], { disputesLoading: true });
    render(<DashboardPage />);
    expect(screen.getByText("Checking queues…")).toBeInTheDocument();
    expect(screen.queryByText("All clear: nothing is waiting for review.")).not.toBeInTheDocument();
  });
});
