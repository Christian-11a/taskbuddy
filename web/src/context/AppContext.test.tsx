import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    setMaintenanceStatus: vi.fn(),
    postApproveVerification: vi.fn(), postRejectVerification: vi.fn(),
    getPendingVerifications: vi.fn(),
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
    vi.mocked(services.getPendingVerifications).mockResolvedValue([]);
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

  describe("maintenance mode", () => {
    it("keeps a toggle that landed while a background refresh was reading the old value", async () => {
      await mountLoaded();
      const staleRead = deferred<{ enabled: boolean; message: string | null; updatedAt: string | null }>();
      vi.mocked(services.getMaintenanceStatus).mockReturnValueOnce(staleRead.promise);
      let refreshing!: Promise<void>;
      await act(async () => { refreshing = context.refreshData(); });

      vi.mocked(services.setMaintenanceStatus).mockResolvedValueOnce({ enabled: true, message: "Back soon", updatedAt: null });
      await act(async () => { await context.setMaintenanceMode(true, "Back soon"); });
      expect(context.maintenanceMode).toBe(true);

      // The refresh's GET was answered before the PATCH landed, so it still says "off".
      await act(async () => { staleRead.resolve({ enabled: false, message: null, updatedAt: null }); await refreshing; });
      expect(context.maintenanceMode).toBe(true);
      expect(context.maintenanceMessage).toBe("Back soon");
    });

    it("keeps a toggle that landed while the first full load was still reading the old value", async () => {
      const firstRead = deferred<{ enabled: boolean; message: string | null; updatedAt: string | null }>();
      vi.mocked(services.getMaintenanceStatus).mockReturnValueOnce(firstRead.promise);
      vi.mocked(services.setMaintenanceStatus).mockResolvedValueOnce({ enabled: true, message: null, updatedAt: null });
      render(<AppProvider><Probe /></AppProvider>);
      // `context` still holds the previous test's provider until this one renders, so wait for its load to start.
      await waitFor(() => expect(services.getMaintenanceStatus).toHaveBeenCalled());
      await act(async () => { await context.setMaintenanceMode(true); });
      await act(async () => { firstRead.resolve({ enabled: false, message: null, updatedAt: null }); });
      await waitFor(() => expect(context.lastUpdated).not.toBeNull());
      expect(context.maintenanceMode).toBe(true);
    });
  });

  describe("session end", () => {
    it("flags the session as ended when the console is refused right after the admin was restored", async () => {
      vi.mocked(services.getUsers).mockRejectedValue(new services.ApiError(401, "Unauthorized"));
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(context.sessionEnded).toBe(true));
      expect(context.isLoggedIn).toBe(false);
    });

    it("flags the session as ended when only the analytics read is refused", async () => {
      vi.mocked(services.getDashboardStats).mockRejectedValue(new services.ApiError(403, "Forbidden"));
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(context.sessionEnded).toBe(true));
      expect(context.isLoggedIn).toBe(false);
    });

    it("does not flag a visit that never had a session", async () => {
      vi.mocked(services.restoreSession).mockResolvedValue(null);
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(context.sessionRestored).toBe(true));
      expect(context.sessionEnded).toBe(false);
    });
  });

  describe("background refresh status", () => {
    it("flags a failed silent refresh, keeps the last rows, and clears the flag on the next success", async () => {
      await mountLoaded();
      expect(context.refreshFailed).toBe(false);

      // The silent refresh reads the pending verifications (it no longer reads users), so a failure there is the signal.
      vi.mocked(services.getPendingVerifications).mockRejectedValueOnce(new Error("down"));
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

    it("keeps previously known deleted accounts across silent refreshes", async () => {
      vi.mocked(services.getUsers).mockImplementation(async (status) => status === "deleted"
        ? [{ ...account, id: "gone", status: "DELETED" }]
        : [account]);
      await mountLoaded();
      expect(context.users.map((row) => row.status)).toEqual(["Active", "Deleted"]);

      await act(async () => { await context.refreshData(); });
      expect(context.refreshFailed).toBe(false);
      expect(context.users.map((row) => row.status)).toEqual(["Active", "Deleted"]);
    });

    it("does not flag a failed full load as a background refresh failure", async () => {
      vi.mocked(services.getUsers).mockRejectedValueOnce(new Error("down"));
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(context.loadError).not.toBeNull());
      expect(context.refreshFailed).toBe(false);
    });
  });

  describe("live tick and verifications", () => {
    it("the tick reads the pending queue, not the whole verifications list", async () => {
      await mountLoaded();
      vi.mocked(services.getVerifications).mockClear();
      vi.mocked(services.getPendingVerifications).mockClear();

      await act(async () => { await context.refreshData(); });

      expect(services.getPendingVerifications).toHaveBeenCalledTimes(1);
      expect(services.getVerifications).not.toHaveBeenCalled();
    });

    it("shows a new pending verification on the tick and keeps the decided ones, without a full read", async () => {
      vi.mocked(services.getVerifications).mockResolvedValue([verification({ id: "v2", status: "APPROVED" })]);
      await mountLoaded();
      vi.mocked(services.getVerifications).mockClear();
      vi.mocked(services.getPendingVerifications).mockResolvedValue([verification({ id: "v3", status: "PENDING" })]);

      await act(async () => { await context.refreshData(); });

      expect(context.verifications.map((row) => row.id).sort()).toEqual(["v2", "v3"]);
      expect(context.queueCounts.verifications).toBe(1);
      expect(services.getVerifications).not.toHaveBeenCalled();
    });

    it("reads the full list on the tick when a pending verification was decided elsewhere", async () => {
      vi.mocked(services.getVerifications).mockResolvedValue([
        verification({ id: "v1", status: "PENDING" }),
        verification({ id: "v2", status: "APPROVED" }),
      ]);
      await mountLoaded();
      expect(context.queueCounts.verifications).toBe(1);

      // Another admin approved v1: the pending queue no longer has it, so its new status comes from the full list.
      vi.mocked(services.getPendingVerifications).mockResolvedValue([]);
      vi.mocked(services.getVerifications).mockResolvedValue([
        verification({ id: "v1", status: "APPROVED" }),
        verification({ id: "v2", status: "APPROVED" }),
      ]);
      await act(async () => { await context.refreshData(); });

      expect(context.verifications.map((row) => row.id).sort()).toEqual(["v1", "v2"]);
      expect(context.queueCounts.verifications).toBe(0);
    });

    it("reads the full list on the tick when the first verifications read never succeeded", async () => {
      vi.mocked(services.getVerifications).mockRejectedValueOnce(new Error("down"));
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(context.loadError).not.toBeNull());
      vi.mocked(services.getVerifications).mockResolvedValue([verification({ id: "v1", status: "APPROVED" })]);

      await act(async () => { await context.refreshData(); });

      await waitFor(() => expect(context.verifications.map((row) => row.id)).toEqual(["v1"]));
      expect(services.getVerifications).toHaveBeenCalled();
    });
  });

  describe("users list loading", () => {
    const FIVE_MINUTES = 5 * 60_000;
    /** Non-deleted users reads so far (the deleted-list read is separate). */
    const userReads = () => vi.mocked(services.getUsers).mock.calls.filter(([status]) => status !== "deleted").length;
    /** Makes the next Date.now() read FIVE_MINUTES + 1s later, so the cached list counts as old. */
    function ageCachedUsers() {
      return vi.spyOn(Date, "now").mockReturnValue(Date.now() + FIVE_MINUTES + 1000);
    }

    it("the silent refresh does not re-read users or dark mode", async () => {
      await mountLoaded();
      vi.mocked(services.getUsers).mockClear();
      vi.mocked(services.getDarkModePreference).mockClear();

      await act(async () => { await context.refreshData(); });

      expect(services.getUsers).not.toHaveBeenCalled();
      expect(services.getDarkModePreference).not.toHaveBeenCalled();
    });

    it("loads the console without waiting for the users list", async () => {
      const users = deferred<AdminUser[]>();
      vi.mocked(services.getUsers).mockImplementation(async (status) => (status === "deleted" ? [] : users.promise));
      render(<AppProvider><Probe /></AppProvider>);

      await waitFor(() => expect(context.lastUpdated).not.toBeNull());
      expect(context.loading).toBe(false);
      expect(context.users).toHaveLength(0);
      expect(context.usersLoading).toBe(true);

      await act(async () => { users.resolve([account]); });
      await waitFor(() => expect(context.users).toHaveLength(1));
      expect(context.usersLoading).toBe(false);
    });

    it("reads the users list once on a cold start, when a page asks for it as the console loads", async () => {
      // Like the Dashboard: a page that asks for the list on mount. It mounts inside the signed-in layout,
      // so it runs in the same commit that starts the console load.
      function AsksForUsers() {
        const { ensureUsers } = useApp();
        useEffect(() => { ensureUsers({ maxAgeMs: FIVE_MINUTES }); }, [ensureUsers]);
        return null;
      }
      function WhenSignedIn() {
        const { isLoggedIn } = useApp();
        return isLoggedIn ? <AsksForUsers /> : null;
      }
      render(<AppProvider><Probe /><WhenSignedIn /></AppProvider>);

      await waitFor(() => expect(context.lastUpdated).not.toBeNull());
      await waitFor(() => expect(context.usersLoading).toBe(false));
      const deletedReads = vi.mocked(services.getUsers).mock.calls.filter(([status]) => status === "deleted").length;
      expect(userReads()).toBe(1);
      expect(deletedReads).toBe(1);
      // The console load itself is not repeated either.
      expect(services.getVerifications).toHaveBeenCalledTimes(1);
      expect(services.getDisputes).toHaveBeenCalledTimes(1);
      expect(services.getMaintenanceStatus).toHaveBeenCalledTimes(1);
    });

    it("leaves a users list younger than the max age alone", async () => {
      await mountLoaded();
      const before = userReads();

      await act(async () => { context.ensureUsers({ maxAgeMs: FIVE_MINUTES }); });

      expect(userReads()).toBe(before);
    });

    it("re-reads an older users list in the background once it is asked for", async () => {
      await mountLoaded();
      const before = userReads();
      const clock = ageCachedUsers();

      await act(async () => { context.ensureUsers({ maxAgeMs: FIVE_MINUTES }); });
      clock.mockRestore();

      await waitFor(() => expect(userReads()).toBe(before + 1));
      await waitFor(() => expect(context.usersLoading).toBe(false));
    });

    it("shares one users read between callers that ask while it is in flight", async () => {
      await mountLoaded();
      const pending = deferred<AdminUser[]>();
      vi.mocked(services.getUsers).mockImplementation(async (status) => (status === "deleted" ? [] : pending.promise));
      const before = userReads();
      const clock = ageCachedUsers();

      await act(async () => {
        context.ensureUsers({ maxAgeMs: FIVE_MINUTES });
        context.ensureUsers({ maxAgeMs: FIVE_MINUTES });
      });
      clock.mockRestore();
      expect(userReads()).toBe(before + 1);

      await act(async () => { pending.resolve([account]); });
      await waitFor(() => expect(context.usersLoading).toBe(false));
    });

    it("keeps a user action's result when a background read that started before it answers later", async () => {
      await mountLoaded();
      const stale = deferred<AdminUser[]>();
      vi.mocked(services.getUsers).mockImplementation(async (status) => (status === "deleted" ? [] : stale.promise));
      const clock = ageCachedUsers();
      await act(async () => { context.ensureUsers({ maxAgeMs: FIVE_MINUTES }); });
      clock.mockRestore();

      vi.mocked(services.setUserStatus).mockResolvedValue({ rows: [{ ...account, status: "SUSPENDED" }] });
      await act(async () => { await context.setUserStatus(account.id, "Suspended", { reason: "Test" }); });
      await act(async () => { stale.resolve([account]); });

      expect(context.users[0].status).toBe("Suspended");
    });

    it("the live tick reads a users list whose first read failed, and clears the banner once it has", async () => {
      vi.mocked(services.getUsers).mockRejectedValueOnce(new Error("down"));
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(context.loadError).not.toBeNull());
      expect(context.users).toHaveLength(0);

      await act(async () => { await context.refreshData(); });

      await waitFor(() => expect(context.users).toHaveLength(1));
      expect(context.loadError).toBeNull();
    });

    it("keeps deleted accounts when a single action replaces the active list", async () => {
      vi.mocked(services.getUsers).mockImplementation(async (status) => (status === "deleted"
        ? [{ ...account, id: "gone", status: "DELETED" }]
        : [account]));
      await mountLoaded();
      await waitFor(() => expect(context.users).toHaveLength(2));
      vi.mocked(services.setUserStatus).mockResolvedValue({ rows: [{ ...account, status: "SUSPENDED" }] });

      await act(async () => { await context.setUserStatus(account.id, "Suspended", { reason: "Test" }); });

      expect(context.users.map((row) => row.status)).toEqual(["Suspended", "Deleted"]);
    });
  });

  describe("live refresh guard", () => {
    // Time is frozen and moved by hand, so the quiet period and the stuck-refresh limit are exact.
    let clock = 0;
    let restoreNow: () => void = () => {};
    beforeEach(() => {
      clock = 1_000_000;
      const spy = vi.spyOn(Date, "now").mockImplementation(() => clock);
      restoreNow = () => spy.mockRestore();
    });
    afterEach(() => restoreNow());

    const disputeReads = () => vi.mocked(services.getDisputes).mock.calls.length;

    it("two automatic triggers inside one second produce one refresh", async () => {
      await mountLoaded();
      clock += 6_000;
      const before = disputeReads();
      await act(async () => {
        await Promise.all([context.refreshLive(), context.refreshLive()]);
      });
      expect(disputeReads() - before).toBe(1);
    });

    it("an automatic trigger during an in-flight silent refresh is skipped", async () => {
      await mountLoaded();
      clock += 6_000;
      const slow = deferred<Dispute[]>();
      vi.mocked(services.getDisputes).mockReturnValueOnce(slow.promise);
      const before = disputeReads();
      let inFlight!: Promise<void>;
      await act(async () => { inFlight = context.refreshLive(); });
      expect(context.refreshing).toBe(true);

      await act(async () => { await context.refreshLive(); });
      expect(disputeReads() - before).toBe(1);

      await act(async () => { slow.resolve([]); await inFlight; });
      expect(context.refreshing).toBe(false);
    });

    it("an explicit refreshData() during an in-flight silent refresh is not lost", async () => {
      await mountLoaded();
      clock += 6_000;
      const stale = deferred<Dispute[]>();
      const fresh = deferred<Dispute[]>();
      vi.mocked(services.getDisputes).mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
      let automatic!: Promise<void>;
      let explicit!: Promise<void>;
      await act(async () => { automatic = context.refreshLive(); });
      // A dispute is resolved while the automatic read is still out, and the page refreshes after the write.
      await act(async () => { explicit = context.refreshData(); });
      await act(async () => { fresh.resolve([dispute({ id: "d-new", status: "RESOLVED" })]); await explicit; });
      // The older read answers last with the pre-write state. It must not overwrite the fresh rows.
      await act(async () => { stale.resolve([dispute({ id: "d-old", status: "OPEN" })]); await automatic; });
      expect(context.disputes.map((row) => row.id)).toEqual(["d-new"]);
    });

    it("keeps the live indicator on until the newest silent refresh finishes", async () => {
      await mountLoaded();
      const older = deferred<Dispute[]>();
      const newer = deferred<Dispute[]>();
      vi.mocked(services.getDisputes).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      let first!: Promise<void>;
      let second!: Promise<void>;
      await act(async () => { first = context.refreshData(); second = context.refreshData(); });
      await act(async () => { older.resolve([]); await first; });
      expect(context.refreshing).toBe(true);
      await act(async () => { newer.resolve([]); await second; });
      expect(context.refreshing).toBe(false);
    });

    it("an explicit refresh still runs inside the quiet period after a refresh", async () => {
      await mountLoaded();
      const before = disputeReads();
      await act(async () => { await context.refreshData(); });
      expect(disputeReads() - before).toBe(1);
    });

    it("skips an automatic trigger within 5 s of the last refresh, and runs again after 5 s", async () => {
      await mountLoaded();
      const before = disputeReads();
      clock += 1_000;
      await act(async () => { await context.refreshLive(); });
      expect(disputeReads() - before).toBe(0);

      clock += 5_000;
      await act(async () => { await context.refreshLive(); });
      expect(disputeReads() - before).toBe(1);
    });

    it("a silent refresh that never answers does not block automatic refreshes forever", async () => {
      await mountLoaded();
      clock += 6_000;
      vi.mocked(services.getDisputes).mockReturnValueOnce(new Promise<Dispute[]>(() => {}));
      await act(async () => { void context.refreshLive(); });
      clock += 31_000;
      const before = disputeReads();
      await act(async () => { await context.refreshLive(); });
      expect(disputeReads() - before).toBe(1);
    });
  });
});

const verification =(over: Partial<Verification>): Verification => ({
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
