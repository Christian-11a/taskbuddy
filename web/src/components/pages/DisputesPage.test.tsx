import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputesPage } from "./DisputesPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import type { DisputeRow } from "@/lib/adapters";

vi.mock("@/context/AppContext", () => ({ useApp: vi.fn() }));
vi.mock("@/lib/services", () => ({ getJobConversation: vi.fn().mockResolvedValue([]) }));

const resolveDispute = vi.fn().mockResolvedValue(undefined);
function setup(paymentSettled: boolean) {
  const dispute: DisputeRow = {
    id: "d1", jobId: "j1", jobTitle: "Repair tap", service: "Plumbing", clientName: "Client",
    providerName: "Provider", amount: "₱500.00", reason: "Work quality", details: null,
    status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    createdAt: "Oct 1, 2026", resolvedAt: null, isOpen: true, paymentSettled,
  };
  vi.mocked(useApp).mockReturnValue({ disputes: [dispute], resolveDispute, loading: false } as unknown as ReturnType<typeof useApp>);
  return render(<ToastProvider><DisputesPage /></ToastProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => vi.unstubAllGlobals());

describe("admin review of settled disputes", () => {
  it("requires a decision note and never offers another escrow release/refund", async () => {
    const user = userEvent.setup();
    setup(true);
    expect(screen.queryByRole("button", { name: /Refund client/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Release to provider/i })).not.toBeInTheDocument();
    const save = screen.getByRole("button", { name: /Record admin decision/i });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText(/Resolution note/i), "Reviewed evidence; compensation handled separately.");
    await user.click(save);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save decision" }));
    expect(resolveDispute).toHaveBeenCalledWith("d1", "REVIEWED", "Reviewed evidence; compensation handled separately.");
  });

  it("retains release/refund actions for funds still held in escrow", () => {
    setup(false);
    expect(screen.getByRole("button", { name: /Refund client/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Release to provider/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Record admin decision/i })).not.toBeInTheDocument();
  });
});
