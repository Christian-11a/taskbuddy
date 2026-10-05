import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputesPage } from "./DisputesPage";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { useApp } from "@/context/AppContext";
import type { DisputeRow } from "@/lib/adapters";

vi.mock("@/context/AppContext", () => ({ useApp: vi.fn() }));
vi.mock("@/lib/services", () => ({ getJobConversation: vi.fn().mockResolvedValue([]), requestDisputeClarification: vi.fn().mockResolvedValue(undefined) }));

const resolveDispute = vi.fn().mockResolvedValue(undefined);
function setup(paymentSettled: boolean, extra: Partial<DisputeRow> = {}) {
  const dispute: DisputeRow = {
    id: "d1", jobId: "j1", jobTitle: "Repair tap", service: "Plumbing", clientName: "Client",
    providerName: "Provider", amount: "₱500.00", reason: "Work quality", details: null,
    status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    createdAt: "Oct 1, 2026", resolvedAt: null, isOpen: true, paymentSettled, ...extra,
  };
  vi.mocked(useApp).mockReturnValue({ disputes: [dispute], resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), loading: false } as unknown as ReturnType<typeof useApp>);
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
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Reviewed evidence; compensation handled separately.");
    await user.click(save);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save decision" }));
    expect(resolveDispute).toHaveBeenCalledWith("d1", "REVIEWED", "Reviewed evidence; compensation handled separately.");
  });

  it("requires a reasoned note before releasing or refunding held funds", async () => {
    const user = userEvent.setup();
    setup(false);
    expect(screen.getByRole("button", { name: /Refund client/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Both sides reviewed.");
    expect(screen.getByRole("button", { name: /Refund client/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Release to provider/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Record admin decision/i })).not.toBeInTheDocument();
  });
  it("shows both participants' recorded statements and requests clarification", async () => {
    const user = userEvent.setup();
    setup(false, { entries: [
      { id: "e1", kind: "statement", body: "Client statement", created_at: "2026-10-04T00:00:00Z", author: { id: "c1", full_name: "Client", role: "client" }, message: null, attachment_url: null },
      { id: "e2", kind: "appeal", body: "Provider explanation", created_at: "2026-10-04T01:00:00Z", author: { id: "p1", full_name: "Provider", role: "provider" }, message: { id: "m1", body: "Repair photo", attachment_path: "photo.jpg" }, attachment_url: "https://storage.test/photo" },
    ] });
    expect(screen.getByText("Client statement")).toBeInTheDocument();
    expect(screen.getByText("Provider explanation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View photo evidence" })).toHaveAttribute("href", "https://storage.test/photo");
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Explain the missing task.");
    await user.click(screen.getByRole("button", { name: "Request clarification" }));
    await waitFor(() => expect(services.requestDisputeClarification).toHaveBeenCalledWith("d1", "Explain the missing task."));
    await waitFor(() => expect(useApp().refreshData).toHaveBeenCalled());
  });
  it("does not offer financial actions for a zero-budget case", () => {
    setup(true, { hasPayment: false, amount: "₱0.00" });
    expect(screen.getByText("No payment to settle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refund client/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Release to provider/i })).not.toBeInTheDocument();
  });

});
