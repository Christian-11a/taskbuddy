import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsPage } from "./ReportsPage";
import { useApp } from "@/context/AppContext";
import { downloadCsv } from "@/lib/export/csv";
import { getCategories, getReportBookings, getReportEscrows, getUsers } from "@/lib/services";
import type { ReportBooking, ReportEscrow } from "@/lib/reports/types";

vi.mock("@/context/AppContext", () => ({ useApp: vi.fn() }));
vi.mock("@/lib/export/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/csv")>()),
  downloadCsv: vi.fn(),
}));
vi.mock("@/lib/services", () => ({
  getReportBookings: vi.fn(),
  getReportEscrows: vi.fn(),
  getCategories: vi.fn(),
  getUsers: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const mockedUseApp = vi.mocked(useApp);

function booking(over: Partial<ReportBooking>): ReportBooking {
  return {
    id: "j1",
    postedAt: "2026-10-05T00:00:00Z",
    status: "completed",
    disputeState: null,
    categoryId: 4,
    categoryName: "Plumbing",
    clientName: "Ana Cruz",
    providerId: "p1",
    providerName: "Mark Santos",
    budget: 0,
    ...over,
  };
}

function escrow(over: Partial<ReportEscrow>): ReportEscrow {
  return {
    id: "e1",
    jobId: "j1",
    amount: 1000,
    commission: 150,
    status: "released",
    heldAt: "2026-10-05T00:00:00Z",
    releasedAt: "2026-10-06T00:00:00Z",
    refundedAt: null,
    categoryName: "Plumbing",
    clientName: "Ana Cruz",
    providerId: "p1",
    providerName: "Mark Santos",
    ...over,
  };
}

const bookings: ReportBooking[] = [
  booking({}),
  booking({ id: "j2", status: "cancelled", clientName: "Bea Ramos", postedAt: "2026-10-08T00:00:00Z" }),
  booking({
    id: "j3",
    categoryId: 5,
    categoryName: "Electrical",
    clientName: "Cara Lim",
    providerId: "p2",
    providerName: "Lee Tan",
    postedAt: "2026-10-09T00:00:00Z",
  }),
];

const escrows: ReportEscrow[] = [
  escrow({}),
  escrow({
    id: "e2",
    jobId: "j2",
    amount: 200,
    commission: 0,
    status: "refunded",
    releasedAt: null,
    refundedAt: "2026-10-10T00:00:00Z",
    clientName: "Bea Ramos",
  }),
  escrow({
    id: "e3",
    jobId: "j3",
    amount: 500,
    commission: 50,
    categoryName: "Electrical",
    clientName: "Cara Lim",
    providerId: "p2",
    providerName: "Lee Tan",
    releasedAt: "2026-10-12T00:00:00Z",
  }),
];

function totalsText(): string {
  const region = document.querySelector(".report-print");
  if (!region) throw new Error("print view missing");
  return region.querySelector('table[aria-label="Totals"]')?.textContent ?? "";
}

function printText(): string {
  return document.querySelector(".report-print")?.textContent ?? "";
}

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/admin/reports?tab=platform&preset=custom&from=2026-10-01&to=2026-10-31&status=all&category=all");
    mockedUseApp.mockReturnValue({
      settings: { anonymizeExports: false },
      adminProfile: { id: "a1", name: "Ana Cruz", email: "ana@test.com" },
    } as unknown as ReturnType<typeof useApp>);
    vi.mocked(getReportBookings).mockResolvedValue(bookings);
    vi.mocked(getReportEscrows).mockResolvedValue(escrows);
    vi.mocked(getCategories).mockResolvedValue([
      { id: 4, name: "Plumbing", isActive: true },
      { id: 5, name: "Electrical", isActive: true },
    ]);
    vi.mocked(getUsers).mockResolvedValue([
      { id: "p1", name: "Mark Santos", role: "provider" },
      { id: "p2", name: "Lee Tan", role: "provider" },
      { id: "c1", name: "Ana Cruz", role: "client" },
    ] as unknown as Awaited<ReturnType<typeof getUsers>>);
    vi.stubGlobal("print", vi.fn());
  });

  it("changes totals when a filter changes, and keeps the choice in the URL", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await waitFor(() => expect(totalsText()).toMatch(/Bookings3/));
    expect(totalsText()).toMatch(/Gross released payments₱1,500/);

    await user.click(screen.getByRole("button", { name: "Cancelled" }));
    await waitFor(() => expect(totalsText()).toMatch(/Bookings1/));
    expect(totalsText()).toMatch(/Cancelled1/);
    expect(totalsText()).toMatch(/Refunds₱200/);
    expect(window.location.search).toContain("status=cancelled");
    expect(getReportBookings).toHaveBeenCalledWith({ status: "cancelled", categoryId: undefined });

    await user.selectOptions(screen.getByRole("combobox", { name: "Service category" }), "4");
    await waitFor(() => expect(window.location.search).toContain("category=4"));
    expect(getReportBookings).toHaveBeenCalledWith({ status: "cancelled", categoryId: 4 });
  });

  it("shows only the chosen provider's jobs", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await waitFor(() => expect(totalsText()).toMatch(/Bookings3/));
    await user.click(screen.getByRole("button", { name: "Provider" }));
    await user.click(screen.getByRole("button", { name: "Mark Santos" }));

    const jobs = document.querySelector(".report-screen table");
    expect(jobs?.textContent).toContain("Ana Cruz");
    expect(jobs?.textContent).toContain("Bea Ramos");
    expect(jobs?.textContent).not.toContain("Cara Lim");
    expect(document.querySelector(".report-screen")?.textContent).toContain("Average rating");
    expect(document.querySelector(".report-screen")?.textContent).toContain("Not available");
    expect(printText()).toContain("Provider report: Mark Santos");
  });

  it("names the CSV and its columns for the report on screen", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await waitFor(() => expect(totalsText()).toMatch(/Bookings3/));

    await user.click(screen.getByRole("button", { name: /export csv/i }));
    await user.click(await screen.findByRole("button", { name: "Export" }));
    expect(downloadCsv).toHaveBeenCalledWith(
      "taskbuddy-platform-2026-10-01_2026-10-31.csv",
      expect.stringContaining("BY CATEGORY\r\nCategory,Bookings,Gross released payments,TaskBuddy commission,Provider payouts,Refunds"),
    );

    await user.click(screen.getByRole("button", { name: "Provider" }));
    await user.click(screen.getByRole("button", { name: "Mark Santos" }));
    await user.click(screen.getByRole("button", { name: /export csv/i }));
    await user.click(await screen.findByRole("button", { name: "Export" }));
    const providerCsv = vi.mocked(downloadCsv).mock.calls.at(-1)!;
    expect(providerCsv[0]).toBe("taskbuddy-provider-mark-santos-2026-10-01_2026-10-31.csv");
    expect(providerCsv[1]).toContain("JOBS\r\nDate,Client,Service,Amount,Fee,Status\r\n");
    expect(providerCsv[1]).toContain("Ana Cruz,Plumbing,1000,150,Completed");
    expect(providerCsv[1]).not.toContain("Cara Lim");
    expect(providerCsv[1]).toContain("Average rating,Not available");
  });

  it("prints a report with the logo name, period, filters, and totals", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);
    await waitFor(() => expect(totalsText()).toMatch(/Bookings3/));
    await user.click(screen.getByRole("button", { name: /download pdf/i }));
    expect(window.print).toHaveBeenCalled();

    const print = document.querySelector(".report-print");
    if (!print) throw new Error("print view missing");
    expect(print.querySelector("img")?.getAttribute("src")).toBe("/promo/taskbuddy-logo-96.png");
    expect(print?.textContent).toContain("TaskBuddy");
    expect(print.textContent).toContain("Platform report");
    expect(print.textContent).toContain("Period: Oct 1, 2026 – Oct 31, 2026");
    expect(print.textContent).toContain("Status: All");
    expect(print.textContent).toContain("Category: All categories");
    expect(print.textContent).toContain("by Ana Cruz");
    // Browsers do not fill a page counter in the body, so it printed "Page 0".
    expect(print.textContent).not.toMatch(/Page\s*\d*$/m);
    expect(print.querySelector(".print-page")).toBeNull();
    expect(totalsText()).toMatch(/Gross released payments₱1,500/);
  });
});
