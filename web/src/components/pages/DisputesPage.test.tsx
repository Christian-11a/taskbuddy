import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputesPage } from "./DisputesPage";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { useApp } from "@/context/AppContext";
import type { DisputeRow } from "@/lib/adapters";
import type { AdminBookingDetail, CaseEntry } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({ useApp: vi.fn() }));
vi.mock("@/lib/services", () => ({
  getJobConversation: vi.fn().mockResolvedValue([]),
  requestDisputeClarification: vi.fn().mockResolvedValue(undefined),
  getBookingDetail: vi.fn().mockResolvedValue({
    description: null, address: null, scheduledAt: null, photoUrls: [], escrowStatus: null, escrowAmount: null, completedAt: null, status: "completed",
  }),
}));

const resolveDispute = vi.fn().mockResolvedValue(undefined);

function row(over: Partial<DisputeRow> = {}): DisputeRow {
  return {
    id: "d1", jobId: "j1", jobTitle: "Repair tap", service: "Plumbing", clientName: "Client",
    providerName: "Provider", amount: "₱500.00", reason: "Work quality", details: null,
    status: "Open", statusClass: "badge-pending", resolution: null, resolutionNote: null,
    createdAt: "Oct 1, 2026", resolvedAt: null, isOpen: true, paymentSettled: false, cancellationState: null, cancellationDeadline: null, ...over,
  };
}

function entry(kind: string, created_at: string, over: Partial<CaseEntry> = {}): CaseEntry {
  return { id: `${kind}-${created_at}`, kind, body: `${kind} body`, created_at, author: null, message: null, attachment_url: null, ...over };
}

function booking(completedAt: string | null): AdminBookingDetail {
  return { description: null, address: null, scheduledAt: null, photoUrls: [], escrowStatus: null, escrowAmount: null, completedAt, status: "completed" };
}

function renderDisputes(disputes: DisputeRow[]) {
  vi.mocked(useApp).mockReturnValue({ disputes, resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), loading: false } as unknown as ReturnType<typeof useApp>);
  return render(<ToastProvider><DisputesPage /></ToastProvider>);
}

function setup(paymentSettled: boolean, extra: Partial<DisputeRow> = {}) {
  return renderDisputes([row({ paymentSettled, ...extra })]);
}

/** The console's live refresh lands: new disputes data and a new lastUpdated stamp. */
function liveRefresh(rerender: (ui: React.ReactElement) => void, disputes: DisputeRow[], lastUpdated: number) {
  vi.mocked(useApp).mockReturnValue({
    disputes, resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), loading: false, lastUpdated,
  } as unknown as ReturnType<typeof useApp>);
  rerender(<ToastProvider><DisputesPage /></ToastProvider>);
}

/** Lets already-resolved mock requests settle inside the test. */
async function flushRequests() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Case ids in the order the queue shows them. */
function queueIds(): string[] {
  const list = screen.getByRole("list", { name: "Disputes" });
  return Array.from(list.querySelectorAll("[data-queue-item]")).map((el) => el.getAttribute("data-queue-item") ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  it("closes an open release dialog without submitting when a live refresh resolves the case", async () => {
    const user = userEvent.setup();
    const { rerender } = setup(false);
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Both sides reviewed.");
    await user.click(screen.getByRole("button", { name: /Release to provider/i }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    // Another admin resolved the case while this dialog was open.
    vi.mocked(useApp).mockReturnValue({
      disputes: [row({ isOpen: false, status: "Resolved", resolution: "REFUNDED_TO_CLIENT", resolvedAt: "Oct 3, 2026", paymentSettled: true })],
      resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), loading: false,
    } as unknown as ReturnType<typeof useApp>);
    rerender(<ToastProvider><DisputesPage /></ToastProvider>);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByText("This case was already resolved.")).toBeInTheDocument();
    expect(resolveDispute).not.toHaveBeenCalled();
  });

  it("does not bring back a stale release dialog when the case is reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = setup(false);
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Both sides reviewed.");
    await user.click(screen.getByRole("button", { name: /Release to provider/i }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    liveRefresh(rerender, [row({ isOpen: false, status: "Resolved", resolution: "RELEASED_TO_PROVIDER", resolvedAt: "Oct 3, 2026", paymentSettled: true })], 2);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await screen.findByText("This case was already resolved.")).toBeInTheDocument();

    // The case is reopened with its payment held again (for example, an appeal).
    liveRefresh(rerender, [row({ isOpen: true, paymentSettled: false })], 3);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getAllByText("This case was already resolved.")).toHaveLength(1);
    expect(resolveDispute).not.toHaveBeenCalled();
  });

});

describe("complaint queue", () => {
  it("marks a pending cancellation past its deadline as overdue in the list and detail", () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    renderDisputes([row({ id: "c1", jobTitle: "Move sofa", cancellationState: "pending", cancellationDeadline: "2026-10-15T09:00:00Z" })]);
    const list = screen.getByRole("list", { name: "Disputes" });
    expect(within(list).getByText("Cancellation review")).toBeInTheDocument();
    expect(within(list).getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("overdue by 3 h")).toBeInTheDocument();
    expect(screen.getByText("Waiting for the other side")).toBeInTheDocument();
  });

  it("counts down a pending cancellation deadline and labels it due soon", () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    renderDisputes([row({ id: "c2", cancellationState: "pending", cancellationDeadline: "2026-10-16T00:00:00Z" })]);
    const list = screen.getByRole("list", { name: "Disputes" });
    expect(within(list).getByText("Due in 12 h")).toBeInTheDocument();
    expect(screen.getByText("12 h left")).toBeInTheDocument();
  });

  it("splits open cases into queues and counts each tab", async () => {
    const user = userEvent.setup();
    renderDisputes([
      row({ id: "plain", jobTitle: "Plain complaint", entries: [entry("statement", "2026-10-10T00:00:00Z")] }),
      row({ id: "waiting", jobTitle: "Waiting case", entries: [entry("statement", "2026-10-10T00:00:00Z"), entry("clarification", "2026-10-11T00:00:00Z")] }),
      row({ id: "appeal", jobTitle: "Appeal case", entries: [entry("statement", "2026-10-10T00:00:00Z"), entry("appeal", "2026-10-12T00:00:00Z")] }),
      row({ id: "cancel", jobTitle: "Cancel case", cancellationState: "contested", entries: [] }),
      row({ id: "old", jobTitle: "Old case", status: "Resolved", isOpen: false, resolution: "REVIEWED", resolutionNote: "Done", resolvedAt: "Oct 2, 2026", entries: [] }),
    ]);
    expect(queueIds()).toEqual(["plain", "appeal", "cancel"]);
    expect(within(screen.getByRole("button", { name: /Needs decision/ })).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Waiting on a party/ })).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Cancellations/ })).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Appeals/ })).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Resolved/ })).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^All/ })).getByText("5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Waiting on a party/ }));
    expect(queueIds()).toEqual(["waiting"]);
    await user.click(screen.getByRole("button", { name: /Cancellations/ }));
    expect(queueIds()).toEqual(["cancel"]);
    await user.click(screen.getByRole("button", { name: /Appeals/ }));
    expect(queueIds()).toEqual(["appeal"]);
    await user.click(screen.getByRole("button", { name: /Resolved/ }));
    expect(queueIds()).toEqual(["old"]);
  });

  it("orders open cases overdue, due soon, needs decision, then waiting on a party", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    renderDisputes([
      row({ id: "waiting", jobTitle: "Waiting", entries: [entry("statement", "2026-10-10T00:00:00Z"), entry("clarification", "2026-10-11T00:00:00Z")] }),
      row({ id: "plain", jobTitle: "Plain", entries: [] }),
      row({ id: "soon", jobTitle: "Soon", cancellationState: "pending", cancellationDeadline: "2026-10-16T00:00:00Z" }),
      row({ id: "overdue", jobTitle: "Overdue", cancellationState: "pending", cancellationDeadline: "2026-10-15T09:00:00Z" }),
    ]);
    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(queueIds()).toEqual(["overdue", "soon", "plain", "waiting"]);
  });

  it("shows no amount for a case without a payment and offers only Record decision", async () => {
    const user = userEvent.setup();
    setup(true, { hasPayment: false, amount: "₱0.00" });
    expect(screen.queryByText("₱0.00")).not.toBeInTheDocument();
    const decide = screen.getByRole("button", { name: /Record decision/ });
    expect(decide).toBeDisabled();
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Checked the chat.");
    expect(decide).toBeEnabled();
    await user.click(decide);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save decision" }));
    expect(resolveDispute).toHaveBeenCalledWith("d1", "REVIEWED", "Checked the chat.");
  });

  it("still offers release and refund on a contested cancellation with held funds", () => {
    setup(false, { cancellationState: "contested", hasPayment: true });
    expect(screen.getAllByText("₱500.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Refund client/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Release to provider/ })).toBeDisabled();
  });

  it("shows an unknown cancellation state as its raw value without crashing", () => {
    setup(false, { cancellationState: "escalated", cancellationDeadline: null });
    expect(screen.getByText("escalated")).toBeInTheDocument();
    expect(screen.getByText("No deadline set")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("shows the warranty window while it is open, and does not refetch a fresh completed job on a live tick", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail).mockResolvedValueOnce(booking("2026-10-14T12:00:00Z"));
    const { rerender } = setup(false);
    expect(await screen.findByText("Warranty open · 2 d left")).toBeInTheDocument();
    expect(screen.getByText("A timely complaint blocks the release.")).toBeInTheDocument();
    liveRefresh(rerender, [row()], 2);
    expect(services.getBookingDetail).toHaveBeenCalledTimes(1);
    expect(services.getBookingDetail).toHaveBeenCalledWith("j1");
  });

  it("shows the warranty window once a job that was not completed yet is completed", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail)
      .mockResolvedValueOnce(booking(null))
      .mockResolvedValueOnce(booking("2026-10-14T12:00:00Z"));
    const { rerender } = setup(false);
    await flushRequests();
    expect(screen.queryByText("Payment protection")).not.toBeInTheDocument();

    liveRefresh(rerender, [row()], 2);
    expect(await screen.findByText("Warranty open · 2 d left")).toBeInTheDocument();
    expect(services.getBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("recovers the warranty window after a failed job-detail request, on a later live refresh", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(booking("2026-10-14T12:00:00Z"));
    const { rerender } = setup(false);
    await flushRequests();
    expect(screen.queryByText("Payment protection")).not.toBeInTheDocument();
    expect(screen.queryByText("offline")).not.toBeInTheDocument();

    liveRefresh(rerender, [row()], 2);
    expect(await screen.findByText("Warranty open · 2 d left")).toBeInTheDocument();
    expect(services.getBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("says when the warranty window has closed", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail).mockResolvedValueOnce(booking("2026-10-01T00:00:00Z"));
    setup(false);
    expect(await screen.findByText("Warranty window closed")).toBeInTheDocument();
  });

  it("shows no protection line when the booking request fails", async () => {
    vi.mocked(services.getBookingDetail).mockRejectedValueOnce(new Error("boom"));
    setup(false);
    await waitFor(() => expect(services.getBookingDetail).toHaveBeenCalled());
    // Let the rejected request settle inside the test, before the stubs are torn down.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText("Payment protection")).not.toBeInTheDocument();
    expect(screen.queryByText(/Warranty/)).not.toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("explains why a filter is empty", async () => {
    const user = userEvent.setup();
    setup(false);
    await user.click(screen.getByRole("button", { name: /Waiting on a party/ }));
    expect(screen.getByText("Nobody is being waited on")).toBeInTheDocument();
  });
});
