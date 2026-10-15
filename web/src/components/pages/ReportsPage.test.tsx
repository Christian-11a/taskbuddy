import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsPage } from "./ReportsPage";
import { useApp } from "@/context/AppContext";
import { downloadCsv } from "@/lib/export/csv";
import type { DashboardStats, TopProvider } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/export/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/csv")>()),
  downloadCsv: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

// Recharts' ResponsiveContainer needs ResizeObserver, which jsdom does not ship.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

function makeStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    totalUsers: 40,
    activeProviders: 8,
    totalBookings: 60,
    pendingVerifications: 0,
    totalRevenue: 125000,
    monthlyRevenue: 18000,
    completionRate: 71.4,
    avgRating: 4.0833,
    totalCommission: 0,
    monthlyCommission: 0,
    pendingWithdrawals: 0,
    escrowHeld: 0,
    escrowCount: 0,
    openJobs: 0,
    matchingJobs: 0,
    ...overrides,
  };
}

function setReportState(opts: { stats?: DashboardStats; providers?: TopProvider[] } = {}) {
  mockedUseApp.mockReturnValue({
    dashboardStats: opts.stats ?? makeStats(),
    revenueSeries: [{ month: "Jan", value: 1000 }],
    bookingsSeries: [{ month: "Jan", value: 5 }],
    bookingsByCategory: [{ label: "Plumbing", value: 100 }],
    topProviders: opts.providers ?? [
      { name: "Pat Cruz", jobs: 21, rating: 4.9 },
      { name: "Lee Tan", jobs: 9, rating: 0 },
    ],
    loading: false,
    analyticsUnavailable: false,
    analyticsInBrowser: false,
    retryLoad: vi.fn(),
    settings: { anonymizeExports: false },
  } as unknown as ReturnType<typeof useApp>);
}

describe("ReportsPage — average provider rating", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the average rating rounded to at most two decimals", () => {
    setReportState({ stats: makeStats({ avgRating: 4.0833 }) });
    render(<ReportsPage />);
    expect(screen.getByText("4.08")).toBeInTheDocument();
  });

  it("shows an em dash instead of 0 when no provider is rated yet", () => {
    setReportState({ stats: makeStats({ avgRating: 0 }) });
    render(<ReportsPage />);
    const panel = screen.getByText("Avg provider rating").closest("div")!.parentElement!;
    expect(within(panel).getByText("—")).toBeInTheDocument();
    expect(within(panel).queryByText("0")).not.toBeInTheDocument();
  });
});

describe("ReportsPage — top providers hint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the job count followed by the rating and a star for rated providers", () => {
    setReportState();
    render(<ReportsPage />);
    expect(screen.getByText("21 jobs · 4.9")).toBeInTheDocument();
  });

  it("shows the job count and an unrated marker when the provider has no rating", () => {
    setReportState();
    render(<ReportsPage />);
    expect(screen.getByText("9 jobs · — unrated")).toBeInTheDocument();
  });
});

describe("ReportsPage — CSV export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  async function exportAndGetCsv(): Promise<string> {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await user.click(screen.getByRole("button", { name: /export csv/i }));
    await user.click(await screen.findByRole("button", { name: "Export" }));
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    return vi.mocked(downloadCsv).mock.calls[0][1];
  }

  it("writes the average rating rounded, not as a raw float", async () => {
    setReportState({ stats: makeStats({ avgRating: 4.0833 }) });
    const csv = await exportAndGetCsv();
    expect(csv).toContain("Average provider rating,4.08\r\n");
    expect(csv).not.toContain("4.0833");
  });

  it("writes provider ratings rounded and leaves unrated providers blank", async () => {
    setReportState({
      providers: [
        { name: "Pat Cruz", jobs: 21, rating: 4.8333 },
        { name: "Lee Tan", jobs: 9, rating: 0 },
      ],
    });
    const csv = await exportAndGetCsv();
    expect(csv).toContain("Pat Cruz,21,4.83\r\n");
    expect(csv).toMatch(/\r\nLee Tan,9,(\r\n|$)/);
  });
});
