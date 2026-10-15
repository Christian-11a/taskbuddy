import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "./AppContext";
import * as services from "@/lib/services";
import type { AdminUser, Dispute, Verification } from "@/lib/domain";
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
    getPendingWithdrawalCount: vi.fn(), getPendingServiceRequestCount: vi.fn(),
    postApproveVerification: vi.fn(), postRejectVerification: vi.fn(),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

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
    vi.mocked(services.getPendingWithdrawalCount).mockResolvedValue(0);
    vi.mocked(services.getPendingServiceRequestCount).mockResolvedValue(0);
  });

  describe("queue counts and follow-up reads", () => {
    beforeEach(() => {
      vi.mocked(services.getPendingWithdrawalCount).mockResolvedValue(2);
      vi.mocked(services.getPendingServiceRequestCount).mockResolvedValue(5);
    });

    it("loads the payout and service-request counts with the console", async () => {
      await mount();
      expect(context.queueCounts).toMatchObject({ withdrawals: 2, "skill-requests": 5 });
    });

    it("derives pending verifications and open disputes from the loaded lists", async () => {
      const verification = (id: string, status: Verification["status"]): Verification => ({
        id, providerId: "p1", name: "Test Provider", email: "test@example.com",
        submittedAt: "2026-10-01T00:00:00Z", status, method: "manual", documents: [],
      });
      const dispute = (id: string, status: Dispute["status"]) => ({
        id, jobId: "j1", jobTitle: "Repair", service: "Plumbing", clientName: "Client",
        providerName: "Provider", amount: 500, reason: "Quality", details: null, status,
        resolution: null, resolutionNote: null, paymentSettled: false,
        createdAt: "2026-10-01T00:00:00Z", resolvedAt: null,
      }) as Dispute;
      vi.mocked(services.getVerifications).mockResolvedValue([verification("v1", "PENDING"), verification("v2", "APPROVED")]);
      vi.mocked(services.getDisputes).mockResolvedValue([dispute("d1", "OPEN"), dispute("d2", "RESOLVED")]);
      await mount();
      expect(context.queueCounts).toMatchObject({ verifications: 1, disputes: 1 });
    });

    it("keeps the last good count when a re-read fails, and still updates the other queue", async () => {
      await mount();
      vi.mocked(services.getPendingWithdrawalCount).mockRejectedValueOnce(new Error("Offline"));
      vi.mocked(services.getPendingServiceRequestCount).mockResolvedValueOnce(7);
      await act(async () => { await context.refreshCounts(); });
      expect(context.queueCounts).toMatchObject({ withdrawals: 2, "skill-requests": 7 });
    });

    it("leaves an unknown count unknown when every read keeps failing", async () => {
      vi.mocked(services.getPendingWithdrawalCount).mockRejectedValue(new Error("Offline"));
      await mount();
      expect(context.queueCounts.withdrawals).toBeNull();
      await act(async () => { await context.refreshCounts(); });
      expect(context.queueCounts.withdrawals).toBeNull();
    });

    it("ignores a count read that finishes after a newer full load started", async () => {
      await mount();
      const slow = deferred<number>();
      vi.mocked(services.getPendingWithdrawalCount)
        .mockReturnValueOnce(slow.promise)
        .mockResolvedValueOnce(4);
      let refreshing!: Promise<void>;
      await act(async () => { refreshing = context.refreshCounts(); });
      await act(async () => { context.retryLoad(); });
      await waitFor(() => expect(context.queueCounts.withdrawals).toBe(4));
      await act(async () => { slow.resolve(99); await refreshing; });
      expect(context.queueCounts.withdrawals).toBe(4);
    });

    it("a newer count refresh supersedes an older one that finishes later", async () => {
      await mount();
      const first = deferred<number>();
      const second = deferred<number>();
      vi.mocked(services.getPendingWithdrawalCount)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      let older!: Promise<void>;
      let newer!: Promise<void>;
      await act(async () => {
        older = context.refreshCounts();
        newer = context.refreshCounts();
      });
      await act(async () => { second.resolve(3); await newer; });
      await act(async () => { first.resolve(1); await older; });
      expect(context.queueCounts.withdrawals).toBe(3);
    });

    it("treats a successful approval as success when the follow-up list read fails", async () => {
      await mount();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(services.postApproveVerification).mockResolvedValue(undefined);
      vi.mocked(services.getVerifications).mockRejectedValue(new Error("Offline"));
      await act(async () => {
        await expect(context.approveVerification("v1")).resolves.toBeUndefined();
      });
      expect(services.postApproveVerification).toHaveBeenCalledWith("v1");
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("still reports a failed approval as a failure", async () => {
      await mount();
      vi.mocked(services.postApproveVerification).mockRejectedValue(new Error("Already decided"));
      await act(async () => {
        await expect(context.approveVerification("v1")).rejects.toThrow("Already decided");
      });
    });
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

  it("exposes queue counts: lists from loaded data, the two extra queues from their own requests", async () => {
    vi.mocked(services.getVerifications).mockResolvedValue([
      verification({ id: "v1", status: "PENDING" }),
      verification({ id: "v2", status: "APPROVED" }),
    ]);
    vi.mocked(services.getDisputes).mockResolvedValue([dispute({ id: "d1", status: "OPEN" }), dispute({ id: "d2", status: "RESOLVED" })]);
    vi.mocked(services.getPendingWithdrawalCount).mockResolvedValue(3);
    vi.mocked(services.getPendingServiceRequestCount).mockResolvedValue(2);
    await mountLoaded();
    expect(context.queueCounts).toEqual({ verifications: 1, disputes: 1, withdrawals: 3, "skill-requests": 2 });
  });

  it("keeps a queue's last good count and never reports 0 when its request fails", async () => {
    vi.mocked(services.getPendingWithdrawalCount).mockRejectedValue(new Error("down"));
    await mountLoaded();
    expect(context.queueCounts.withdrawals).toBeNull();
    expect(context.queueCounts["skill-requests"]).toBe(0);

    vi.mocked(services.getPendingWithdrawalCount).mockResolvedValue(3);
    await act(async () => { await context.refreshData(); });
    expect(context.queueCounts.withdrawals).toBe(3);

    vi.mocked(services.getPendingWithdrawalCount).mockRejectedValue(new Error("down again"));
    await act(async () => { await context.refreshData(); });
    expect(context.queueCounts.withdrawals).toBe(3);
  });

  it("a superseded load does not clear the newer load's loading state or stamp lastUpdated", async () => {
    const oldCount = deferred<number>();
    const newCount = deferred<number>();
    vi.mocked(services.getPendingWithdrawalCount)
      .mockReturnValueOnce(oldCount.promise)
      .mockReturnValueOnce(newCount.promise);
    render(<AppProvider><Probe /></AppProvider>);

    // The first load is waiting on its withdrawal count.
    await waitFor(() => expect(services.getPendingWithdrawalCount).toHaveBeenCalledTimes(1));
    // Retry supersedes it; the newer load is also waiting on its own count.
    await act(async () => { context.retryLoad(); });
    await waitFor(() => expect(services.getPendingWithdrawalCount).toHaveBeenCalledTimes(2));
    expect(context.loading).toBe(true);

    // The superseded request answers last. It must not finish the newer load.
    await act(async () => { oldCount.resolve(5); });
    expect(context.loading).toBe(true);
    expect(context.lastUpdated).toBeNull();

    // The newer load completes normally, and only its count is applied.
    await act(async () => { newCount.resolve(1); });
    await waitFor(() => expect(context.loading).toBe(false));
    expect(context.lastUpdated).not.toBeNull();
    expect(context.queueCounts.withdrawals).toBe(1);
  });

  describe("background refresh status", () => {
    it("flags a failed silent refresh, keeps the last rows, and clears the flag on the next success", async () => {
      await mountLoaded();
      expect(context.refreshFailed).toBe(false);

      vi.mocked(services.getUsers).mockRejectedValueOnce(new Error("down"));
      await act(async () => { await context.refreshData(); });
      expect(context.refreshFailed).toBe(true);
      expect(context.loadError).toBeNull();
      expect(context.users).toHaveLength(1);

      await act(async () => { await context.refreshData(); });
      expect(context.refreshFailed).toBe(false);
    });

    it("flags a silent refresh whose analytics read failed", async () => {
      await mountLoaded();
      vi.mocked(services.getTopProviders).mockRejectedValueOnce(new Error("down"));
      await act(async () => { await context.refreshData(); });
      expect(context.refreshFailed).toBe(true);
    });

    it("does not flag a failed full load as a background refresh failure", async () => {
      vi.mocked(services.getUsers).mockRejectedValueOnce(new Error("down"));
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(context.loadError).not.toBeNull());
      expect(context.refreshFailed).toBe(false);
    });
  });
});

const verification = (over: Partial<Verification>): Verification => ({
  id: "v1", providerId: "p1", name: "Liza Mercado", email: "liza@example.com", submittedAt: "2026-10-01",
  status: "PENDING", documents: [], method: "manual", ...over,
});

const dispute = (over: Partial<Dispute>): Dispute => ({
  id: "d1", jobId: "j1", jobTitle: "Fix sink", service: "Plumbing", clientName: "Ana", providerName: "Rico",
  amount: 1450, reason: "Work not completed", details: null, status: "OPEN", resolution: null, resolutionNote: null,
  paymentSettled: false, createdAt: "2026-10-01", resolvedAt: null, cancellationState: null, cancellationDeadline: null,
  ...over,
});

/** Like mount(), but waits for the first full load to finish (lastUpdated is set last). */
async function mountLoaded() {
  render(<AppProvider><Probe /></AppProvider>);
  await waitFor(() => expect(context.lastUpdated).not.toBeNull());
}
