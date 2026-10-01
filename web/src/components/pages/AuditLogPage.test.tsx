import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditLogPage } from "./AuditLogPage";
import * as services from "@/lib/services";
import type { AuditAction } from "@/lib/domain";

vi.mock("@/lib/services", () => ({ searchAuditLog: vi.fn() }));

const mockedSearchAuditLog = vi.mocked(services.searchAuditLog);

function makeAction(id: string, action: string, actorName = "Morgan Lee"): AuditAction {
  return {
    id,
    actorName,
    action,
    targetType: "profiles",
    targetId: `target-${id}`,
    metadata: { reason: "Policy review" },
    createdAt: "2026-09-18T10:00:00.000Z",
  };
}

describe("AuditLogPage server search and pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchAuditLog.mockResolvedValue({ items: [makeAction("a1", "user.suspend")], total: 41 });
  });

  it("loads server pages, preserves known action filters, and sends filter/search query values", async () => {
    const user = userEvent.setup();
    render(<AuditLogPage />);

    expect(await screen.findByText("user → suspend")).toBeInTheDocument();
    expect(mockedSearchAuditLog).toHaveBeenCalledWith({ search: "", action: undefined, page: 1, pageSize: 20 });

    const actionFilter = screen.getByRole("combobox", { name: "Filter by action" });
    expect(actionFilter.querySelector('option[value="wallet.settle_withdrawal"]')).toBeInTheDocument();
    await user.selectOptions(actionFilter, "wallet.settle_withdrawal");
    await waitFor(() => {
      expect(mockedSearchAuditLog).toHaveBeenLastCalledWith({
        search: "", action: "wallet.settle_withdrawal", page: 1, pageSize: 20,
      });
    });

    await user.type(screen.getByLabelText("Search the audit log"), "Morgan");
    await waitFor(() => {
      expect(mockedSearchAuditLog).toHaveBeenLastCalledWith({
        search: "Morgan", action: "wallet.settle_withdrawal", page: 1, pageSize: 20,
      });
    });

    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => {
      expect(mockedSearchAuditLog).toHaveBeenLastCalledWith({
        search: "Morgan", action: "wallet.settle_withdrawal", page: 2, pageSize: 20,
      });
    });
  });

  it("ignores responses from an older search after a newer request has started", async () => {
    let resolveOld!: (value: { items: AuditAction[]; total: number }) => void;
    let resolveNew!: (value: { items: AuditAction[]; total: number }) => void;
    mockedSearchAuditLog
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));

    const user = userEvent.setup();
    render(<AuditLogPage />);
    await user.type(screen.getByLabelText("Search the audit log"), "new query");

    await waitFor(() => {
      expect(mockedSearchAuditLog).toHaveBeenLastCalledWith({ search: "new query", action: undefined, page: 1, pageSize: 20 });
    });
    resolveNew({ items: [makeAction("new", "user.reinstate", "New result")], total: 1 });
    expect(await screen.findByText("New result")).toBeInTheDocument();
    resolveOld({ items: [makeAction("old", "user.suspend", "Old result")], total: 1 });
    await waitFor(() => expect(screen.queryByText("Old result")).not.toBeInTheDocument());
  });

  it("keeps the search control available after a server error", async () => {
    mockedSearchAuditLog.mockRejectedValueOnce(new Error("network error"));
    render(<AuditLogPage />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Search the audit log")).toBeInTheDocument();
  });
});
