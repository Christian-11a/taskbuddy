import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueCounts } from "@/lib/attention";
import { TooltipProvider } from "@/components/ui/tooltip";

const mockState = vi.hoisted(() => ({
  queueCounts: { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 } as QueueCounts,
  settings: { activityBadge: true },
}));

vi.mock("@/context/AppContext", () => ({
  useApp: () => ({
    ...mockState,
    verifications: [],
    disputes: [],
    adminProfile: { id: "a1", name: "Morgan Lee", email: "morgan@example.com" },
  }),
}));

import { Sidebar } from "./Sidebar";

const noop = () => {};

function renderSidebar(collapsed = false) {
  return render(
    <TooltipProvider>
      <Sidebar
        activePage={null}
        onNavigate={noop}
        onLogout={noop}
        collapsed={collapsed}
        onToggleCollapse={noop}
        drawerOpen={false}
      />
    </TooltipProvider>,
  );
}

/** The nav link whose visible label starts with `label`. */
function navLink(label: string) {
  return screen.getByRole("link", { name: new RegExp(`^${label}`) });
}

beforeEach(() => {
  mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0 };
  mockState.settings = { activityBadge: true };
});

describe("Sidebar credentials link", () => {
  it("links to the credentials page", () => {
    renderSidebar();
    expect(navLink("Credentials")).toHaveAttribute("href", "/admin/credentials");
  });
});

describe("Sidebar queue badges", () => {
  it("shows a number on every queue that has work", () => {
    mockState.queueCounts = { verifications: 3, disputes: 1, withdrawals: 2, "skill-requests": 2 };
    renderSidebar();
    expect(within(navLink("Verifications")).getByText("3")).toBeInTheDocument();
    expect(within(navLink("Disputes")).getByText("1")).toBeInTheDocument();
    expect(within(navLink("Failed payouts")).getByText("2")).toBeInTheDocument();
    expect(within(navLink("Service Requests")).getByText("2")).toBeInTheDocument();
  });

  it("caps a full service-request list at 100+", () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 100 };
    renderSidebar();
    expect(within(navLink("Service Requests")).getByText("100+")).toBeInTheDocument();
  });

  it("shows Failed payouts with no badge at 0", () => {
    renderSidebar();
    expect(navLink("Failed payouts").textContent).toBe("Failed payouts");
  });

  it("shows Failed payouts with no badge while the count is unknown", () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: null, "skill-requests": 0 };
    renderSidebar();
    expect(navLink("Failed payouts").textContent).toBe("Failed payouts");
  });

  it("shows the Failed payouts count with the activity badge setting off", () => {
    mockState.queueCounts = { verifications: 3, disputes: 1, withdrawals: 2, "skill-requests": 2 };
    mockState.settings = { activityBadge: false };
    renderSidebar();
    expect(within(navLink("Failed payouts")).getByText("2")).toBeInTheDocument();
  });

  it("hides every badge when the activity badge setting is off", () => {
    mockState.queueCounts = { verifications: 3, disputes: 1, withdrawals: 2, "skill-requests": 2 };
    mockState.settings = { activityBadge: false };
    renderSidebar();
    expect(navLink("Verifications").textContent).toBe("Verifications");
    expect(navLink("Service Requests").textContent).toBe("Service Requests");
  });

  it("keeps the count on the collapsed link's accessible name", () => {
    mockState.queueCounts = { verifications: 0, disputes: 0, withdrawals: 4, "skill-requests": 0 };
    renderSidebar(true);
    expect(screen.getByRole("link", { name: "Failed payouts (4)" })).toBeInTheDocument();
  });
});
