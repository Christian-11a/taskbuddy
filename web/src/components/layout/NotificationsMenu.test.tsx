import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueCounts } from "@/lib/attention";

const mockState = vi.hoisted(() => ({
  verifications: [] as unknown[],
  disputes: [] as unknown[],
  queueCounts: { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 } as QueueCounts,
}));

vi.mock("@/context/AppContext", () => ({
  useApp: () => mockState,
}));

import { NotificationsMenu } from "./NotificationsMenu";

beforeAll(() => {
  // Radix menus measure with these; jsdom has neither.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

beforeEach(() => {
  mockState.verifications = [];
  mockState.disputes = [];
  mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 };
});

const verification = {
  id: "v1", name: "Rico Dela Cruz", status: "pending", documents: [{ id: "d1" }], date: "Oct 14", method: "manual",
};
const dispute = {
  id: "d1", isOpen: true, jobTitle: "Fix kitchen sink", clientName: "Ana Reyes", amount: "₱1,200", createdAt: "Oct 13",
};

describe("NotificationsMenu", () => {
  it("badges the bell with the total across all four queues", () => {
    mockState.queueCounts = { verifications: 1, disputes: 1, withdrawals: 2, "skill-requests": 3 };
    mockState.verifications = [verification];
    mockState.disputes = [dispute];
    render(<NotificationsMenu />);
    expect(screen.getByRole("button", { name: "Notifications (7 need attention)" })).toBeInTheDocument();
  });

  it("says unknown, not 'all caught up', when a queue could not be loaded", async () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: null, "skill-requests": 0 };
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("All caught up!")).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn.t check withdrawals/i)).toBeInTheDocument();
  });

  it("shows 'All caught up!' only when every queue loaded and nothing is waiting", async () => {
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("All caught up!")).toBeInTheDocument();
  });

  it("does not claim all caught up when a failed queue sits next to zero counts", async () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": null };
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("All caught up!")).not.toBeInTheDocument();
    expect(screen.getByText(/Couldn.t check service requests/i)).toBeInTheDocument();
  });

  it("links each queue to its page", async () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 2, "skill-requests": 1 };
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByRole("menuitem", { name: /2 withdrawals waiting/i })).toHaveAttribute("href", "/admin/withdrawals");
    expect(screen.getByRole("menuitem", { name: /1 service request to review/i })).toHaveAttribute("href", "/admin/skill-requests");
  });

  it("names pending verifications and open disputes with their details", async () => {
    mockState.queueCounts = { verifications: 1, disputes: 1, withdrawals: 0, "skill-requests": 0 };
    mockState.verifications = [verification];
    mockState.disputes = [dispute];
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Rico Dela Cruz needs verification")).toBeInTheDocument();
    const disputeRow = screen.getByText("Fix kitchen sink: dispute raised").closest("a");
    expect(disputeRow).not.toBeNull();
    expect(within(disputeRow as HTMLElement).getByText(/Ana Reyes/)).toBeInTheDocument();
  });

  it("says a Stripe Identity submission was checked by Stripe, not a document count", async () => {
    mockState.queueCounts = { verifications: 1, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    mockState.verifications = [{ ...verification, method: "stripe_identity", documents: [] }];
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("Stripe Identity check · Submitted Oct 14")).toBeInTheDocument();
    expect(screen.queryByText(/0 documents/)).not.toBeInTheDocument();
  });

  it("keeps the document count for a manual submission", async () => {
    mockState.queueCounts = { verifications: 1, disputes: 0, withdrawals: 0, "skill-requests": 0 };
    mockState.verifications = [verification];
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.getByText("1 document · Submitted Oct 14")).toBeInTheDocument();
  });

  it("does not link the unknown queue", async () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: null, "skill-requests": 0 };
    render(<NotificationsMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByRole("menuitem", { name: /withdrawal/i })).not.toBeInTheDocument();
  });
});
