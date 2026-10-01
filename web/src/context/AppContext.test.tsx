import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "./AppContext";
import * as services from "@/lib/services";
import type { AdminUser } from "@/lib/domain";
import { useEffect } from "react";

vi.mock("@/lib/services", async (importOriginal) => {
  const actual = await importOriginal<typeof services>();
  return {
    ...actual,
    restoreSession: vi.fn(), getUsers: vi.fn(), getVerifications: vi.fn(),
    getDisputes: vi.fn(), getRecentActivity: vi.fn(), getDarkModePreference: vi.fn(),
    getMaintenanceStatus: vi.fn(), getDashboardStats: vi.fn(),
    getRevenueSeries: vi.fn(), getBookingsSeries: vi.fn(),
    getBookingsByCategory: vi.fn(), getTopProviders: vi.fn(),
    setUserStatus: vi.fn(), bulkSetUserStatus: vi.fn(),
  };
});

const account: AdminUser = {
  id: "test-provider", name: "Test Provider", email: "test@example.com",
  role: "provider", status: "ACTIVE", createdAt: "2026-09-01",
  jobsCompleted: 0, rating: null, phone: null, city: null, categoryName: null,
  suspendedUntil: null, suspensionReason: null,
};
let context: ReturnType<typeof useApp>;
function Probe() {
  const state = useApp();
  useEffect(() => { context = state; }, [state]);
  return null;
}
async function mount() {
  render(<AppProvider><Probe /></AppProvider>);
  await waitFor(() => expect(context.users).toHaveLength(1));
}

describe("AppContext — moderation refresh results", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(services.restoreSession).mockResolvedValue({ id: "admin", name: "Admin", email: "admin@example.com" });
    vi.mocked(services.getUsers).mockImplementation(async (status) => status === "deleted" ? [] : [account]);
    vi.mocked(services.getVerifications).mockResolvedValue([]);
    vi.mocked(services.getDisputes).mockResolvedValue([]);
    vi.mocked(services.getRecentActivity).mockResolvedValue([]);
    vi.mocked(services.getDarkModePreference).mockResolvedValue(null);
    vi.mocked(services.getMaintenanceStatus).mockResolvedValue({ enabled: false, message: null, updatedAt: null });
    vi.mocked(services.getRevenueSeries).mockResolvedValue([]);
    vi.mocked(services.getBookingsSeries).mockResolvedValue([]);
    vi.mocked(services.getBookingsByCategory).mockResolvedValue([]);
    vi.mocked(services.getTopProviders).mockResolvedValue([]);
  });

  it("keeps existing rows and returns the warning after a confirmed single action", async () => {
    await mount();
    vi.mocked(services.setUserStatus).mockResolvedValue({ rows: null, refreshFailed: true });
    await act(async () => {
      expect(await context.setUserStatus(account.id, "Suspended", { reason: "Test" })).toEqual({ refreshFailed: true });
    });
    expect(context.users[0].id).toBe(account.id);
  });

  it("preserves bulk counts and failed account IDs even when the reload failed", async () => {
    await mount();
    const counts = { succeeded: 1, failed: 1, errors: [{ id: "failed", status: 400, message: "Already active" }], refreshFailed: true };
    vi.mocked(services.bulkSetUserStatus).mockResolvedValue({ rows: null, ...counts });
    await act(async () => { expect(await context.bulkSetUserStatus([account.id, "failed"], "Active")).toEqual(counts); });
    expect(context.users).toHaveLength(1);
  });

  it("applies freshly fetched statuses when a single action and refresh both succeed", async () => {
    await mount();
    vi.mocked(services.setUserStatus).mockResolvedValue({ rows: [{ ...account, status: "SUSPENDED" }] });
    await act(async () => {
      expect(await context.setUserStatus(account.id, "Suspended", { reason: "Test" })).toEqual({ refreshFailed: undefined });
    });
    expect(context.users[0].status).toBe("Suspended");
  });

  it("does not turn an unsuccessful mutation into a success result", async () => {
    await mount();
    vi.mocked(services.setUserStatus).mockRejectedValue(new Error("Cannot suspend admin"));
    await act(async () => {
      await expect(context.setUserStatus(account.id, "Suspended", { reason: "Test" })).rejects.toThrow("Cannot suspend admin");
    });
    expect(context.users[0].status).toBe("Active");
  });

  it("rejects an unsuccessful explicit reload without discarding the old rows", async () => {
    await mount();
    vi.mocked(services.getUsers).mockRejectedValue(new Error("Offline"));
    await act(async () => { await expect(context.refreshUsers()).rejects.toThrow("Offline"); });
    expect(context.users).toHaveLength(1);
  });

  it("loads authoritative statuses and preserves deleted accounts on retry", async () => {
    await mount();
    vi.mocked(services.getUsers).mockImplementation(async (status) => status === "deleted"
      ? [{ ...account, id: "deleted", status: "DELETED" }]
      : [{ ...account, status: "SUSPENDED" }]);
    await act(async () => { await context.refreshUsers(); });
    expect(context.users.map((row) => row.status)).toEqual(["Suspended", "Deleted"]);
  });
});
