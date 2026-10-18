import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputesPage } from "./DisputesPage";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { useApp } from "@/context/AppContext";
import type { DisputeRow } from "@/lib/adapters";
import type { AdminBookingDetail, CaseEntry, ConversationMessage } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({ useApp: vi.fn() }));
const REFUND_SENTENCE = "Recorded as refunded to the client's payment method (test mode: no real refund is sent).";

vi.mock("@/lib/services", () => ({
  getCommission: vi.fn().mockResolvedValue({ rate: 0.15, updatedAt: "2026-10-01T00:00:00Z", totalEarned: 0, earnedThisMonth: 0, releasedJobs: 0, pendingEstimate: 0 }),
  getJobConversation: vi.fn().mockResolvedValue({ messages: [], total: 0, hasMore: false }),
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

function booking(completedAt: string | null, escrowStatus: AdminBookingDetail["escrowStatus"] = null): AdminBookingDetail {
  return { description: null, address: null, scheduledAt: null, photoUrls: [], escrowStatus, escrowAmount: null, completedAt, status: "completed" };
}

function renderDisputes(disputes: DisputeRow[]) {
  vi.mocked(useApp).mockReturnValue({ disputes, resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), refreshCounts: vi.fn().mockResolvedValue(undefined), disputesLoading: false } as unknown as ReturnType<typeof useApp>);
  return render(<ToastProvider><DisputesPage /></ToastProvider>);
}

function setup(paymentSettled: boolean, extra: Partial<DisputeRow> = {}) {
  return renderDisputes([row({ paymentSettled, ...extra })]);
}

/** The console's live refresh lands: new disputes data and a new lastUpdated stamp. */
function liveRefresh(rerender: (ui: React.ReactElement) => void, disputes: DisputeRow[], lastUpdated: number) {
  vi.mocked(useApp).mockReturnValue({
    disputes, resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), refreshCounts: vi.fn().mockResolvedValue(undefined), disputesLoading: false, lastUpdated,
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

// Stubbed once for the whole file. useIsWide keeps a single matchMedia listener, but it still reads
// matchMedia on every render, so a render that lands after a per-test stub has been removed would throw.
beforeAll(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => {
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
    await waitFor(() => expect(services.requestDisputeClarification).toHaveBeenCalledWith("d1", "To both parties: Explain the missing task."));
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
      resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), refreshCounts: vi.fn().mockResolvedValue(undefined), disputesLoading: false,
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

  it("shows a completed job's payment as released, and does not refetch a fresh completed job on a live tick", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail).mockResolvedValueOnce(booking("2026-10-14T12:00:00Z", "COMPLETED"));
    const { rerender } = setup(false);
    expect(await screen.findByText("Released")).toBeInTheDocument();
    expect(screen.queryByText("Held while the complaint is open.")).not.toBeInTheDocument();
    liveRefresh(rerender, [row()], 2);
    expect(services.getBookingDetail).toHaveBeenCalledTimes(1);
    expect(services.getBookingDetail).toHaveBeenCalledWith("j1");
  });

  it("shows a completed job's payment as held only while the complaint is open", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail).mockResolvedValueOnce(booking("2026-10-14T12:00:00Z", "DISPUTED"));
    setup(false);
    expect(await screen.findByText("Held while the complaint is open.")).toBeInTheDocument();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
  });

  it("shows the payment once a job that was not completed yet is completed", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail)
      .mockResolvedValueOnce(booking(null, "IN_ESCROW"))
      .mockResolvedValueOnce(booking("2026-10-14T12:00:00Z", "COMPLETED"));
    const { rerender } = setup(false);
    await flushRequests();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();

    liveRefresh(rerender, [row()], 2);
    expect(await screen.findByText("Released")).toBeInTheDocument();
    expect(services.getBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("recovers the payment after a failed job-detail request, on a later live refresh", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(booking("2026-10-14T12:00:00Z", "DISPUTED"));
    const { rerender } = setup(false);
    await flushRequests();
    expect(screen.queryByText("Held while the complaint is open.")).not.toBeInTheDocument();
    expect(screen.queryByText("offline")).not.toBeInTheDocument();

    liveRefresh(rerender, [row()], 2);
    expect(await screen.findByText("Held while the complaint is open.")).toBeInTheDocument();
    expect(services.getBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("shows no payment line when the escrow was refunded", async () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    vi.mocked(services.getBookingDetail).mockResolvedValueOnce(booking("2026-10-01T00:00:00Z", "REFUNDED"));
    setup(false);
    await flushRequests();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
    expect(screen.queryByText("Held")).not.toBeInTheDocument();
  });

  it("shows no protection line when the booking request fails", async () => {
    vi.mocked(services.getBookingDetail).mockRejectedValueOnce(new Error("boom"));
    setup(false);
    await waitFor(() => expect(services.getBookingDetail).toHaveBeenCalled());
    // Let the rejected request settle inside the test, before the stubs are torn down.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText("Payment protection")).not.toBeInTheDocument();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });

  it("explains why a filter is empty", async () => {
    const user = userEvent.setup();
    setup(false);
    await user.click(screen.getByRole("button", { name: /Waiting on a party/ }));
    expect(screen.getByText("Nobody is being waited on")).toBeInTheDocument();
  });
});

const chat: ConversationMessage[] = [
  { id: "m1", senderId: "c1", senderName: "Ana", body: "The tap still leaks", createdAt: "2026-10-04T09:00:00Z" },
  { id: "m2", senderId: "p1", senderName: "Rico", body: "I will return Monday", createdAt: "2026-10-04T10:00:00Z", attachmentUrl: "https://signed.test/leak.jpg" },
  { id: "m3", senderId: null, senderName: "Unknown", body: "Job marked complete", createdAt: "2026-10-04T11:00:00Z" },
];

function restoreProperty(name: "scrollHeight" | "scrollTop", original: PropertyDescriptor | undefined) {
  if (original) Object.defineProperty(HTMLElement.prototype, name, original);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
}

/** One page of the admin conversation, as services.getJobConversation returns it. */
function page(messages: ConversationMessage[], over: { total?: number; hasMore?: boolean } = {}) {
  return { messages, total: over.total ?? messages.length, hasMore: over.hasMore ?? false };
}

function textMessage(id: string, body: string, minute: number): ConversationMessage {
  return { id, senderId: "c1", senderName: "Ana", body, createdAt: `2026-10-04T09:${String(minute).padStart(2, "0")}:00Z` };
}

describe("older chat messages", () => {
  const newest = [textMessage("m3", "Third", 3), textMessage("m4", "Fourth", 4)];
  const older = [textMessage("m1", "First", 1), textMessage("m2", "Second", 2)];

  it("loads the page before the oldest message and prepends it in order, then drops the button", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation)
      .mockResolvedValueOnce(page(newest, { total: 4, hasMore: true }))
      .mockResolvedValueOnce(page(older, { total: 4, hasMore: false }));
    renderDisputes([row({ clientId: "c1", providerId: "p1", chatMessageCount: 4 })]);
    const log = await screen.findByRole("log", { name: "Job conversation" });
    await user.click(screen.getByRole("button", { name: "Load older messages" }));
    await waitFor(() => expect(within(log).getAllByRole("listitem")).toHaveLength(4));
    expect(services.getJobConversation).toHaveBeenLastCalledWith("j1", { before: "m3" });
    const bodies = within(log).getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(bodies[0]).toContain("First");
    expect(bodies[1]).toContain("Second");
    expect(bodies[2]).toContain("Third");
    expect(bodies[3]).toContain("Fourth");
    expect(screen.queryByRole("button", { name: "Load older messages" })).not.toBeInTheDocument();
    expect(screen.getByText("4 messages")).toBeInTheDocument();
    expect(screen.queryByText(/showing/)).not.toBeInTheDocument();
  });

  it("shows an error with Retry when an older page fails, and keeps the newest messages", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation)
      .mockResolvedValueOnce(page(newest, { total: 4, hasMore: true }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page(older, { total: 4, hasMore: false }));
    renderDisputes([row({ clientId: "c1", providerId: "p1", chatMessageCount: 4 })]);
    const log = await screen.findByRole("log", { name: "Job conversation" });
    await user.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(await within(log).findByText("Could not load older messages.")).toBeInTheDocument();
    expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    await user.click(within(log).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(within(log).getAllByRole("listitem")).toHaveLength(4));
    expect(within(log).queryByText("Could not load older messages.")).not.toBeInTheDocument();
    expect(services.getJobConversation).toHaveBeenCalledTimes(3);
    expect(services.getJobConversation).toHaveBeenLastCalledWith("j1", { before: "m3" });
  });

  it("says how much of the chat is shown while older messages are still unloaded", async () => {
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(page(newest, { total: 4, hasMore: true }));
    renderDisputes([row({ clientId: "c1", providerId: "p1", chatMessageCount: 4 })]);
    await screen.findByRole("log", { name: "Job conversation" });
    const card = screen.getByRole("region", { name: "Attached chat" });
    expect(within(card).getByText("4 messages")).toBeInTheDocument();
    expect(within(card).getByText("(showing 2 of 4)")).toBeInTheDocument();
  });
});

describe("attached chat and complaint photos", () => {
  it("shows the attached chat with the case's message count", async () => {
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(page(chat));
    renderDisputes([row({ clientId: "c1", providerId: "p1", entries: [], chatMessageCount: 42 })]);
    await screen.findByRole("log", { name: "Job conversation" });
    const card = screen.getByRole("region", { name: "Attached chat" });
    expect(within(card).getByText("42 messages")).toBeInTheDocument();
  });

  it("says so when the client and provider never messaged", async () => {
    renderDisputes([row({ entries: [] })]);
    expect(await screen.findByText("No messages between the client and provider.")).toBeInTheDocument();
  });

  const photoRow = () => row({
    clientId: "c1", providerId: "p1", raisedById: "c1", photoUrls: ["https://signed.test/a.jpg"],
    entries: [{ ...entry("appeal", "2026-10-05T00:00:00Z"), author: { id: "p1", full_name: "Rico", role: "provider" }, photo_urls: ["https://signed.test/b.jpg", "https://signed.test/c.jpg"] }],
  });

  it("groups complaint photos by the side that sent them", () => {
    renderDisputes([photoRow()]);
    const client = screen.getByRole("region", { name: "From the client" });
    const provider = screen.getByRole("region", { name: "From the provider" });
    expect(within(client).getAllByRole("img")).toHaveLength(1);
    expect(within(provider).getAllByRole("img")).toHaveLength(2);
  });

  it("opens a photo in a dialog that Escape closes, returning focus", async () => {
    const user = userEvent.setup();
    renderDisputes([photoRow()]);
    const thumb = screen.getByRole("button", { name: "Complaint photo 1 of 2, from the provider" });
    await user.click(thumb);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("img", { name: "Complaint photo 1 of 2, from the provider" })).toHaveAttribute("src", "https://signed.test/b.jpg");
    await user.click(within(dialog).getByRole("button", { name: "Next photo" }));
    expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://signed.test/c.jpg");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(thumb).toHaveFocus());
  });

  it("replaces a photo that fails to load with a placeholder", () => {
    renderDisputes([photoRow()]);
    fireEvent.error(screen.getByRole("img", { name: "Complaint photo 1 of 1, from the client" }));
    expect(screen.getByText("Photo unavailable. Refresh the case.")).toBeInTheDocument();
  });

  it("labels photos by the raiser when the job's parties are unknown", () => {
    renderDisputes([row({ raisedById: "x", photoUrls: ["https://signed.test/a.jpg"], entries: [] })]);
    expect(screen.getByRole("region", { name: "From the person who raised the complaint" })).toBeInTheDocument();
  });
});

describe("job conversation panel", () => {
  it("shows a fixed-height scrolling log with a message count and each sender's role", async () => {
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(page(chat));
    renderDisputes([row({ clientId: "c1", providerId: "p1", entries: [] })]);
    const log = await screen.findByRole("log", { name: "Job conversation" });
    expect(log).toHaveClass("max-h-[320px]", "overflow-y-auto");
    expect(screen.getByText("3 messages")).toBeInTheDocument();
    const [client, provider, system] = within(log).getAllByRole("listitem");
    expect(within(client).getByText("Client")).toBeInTheDocument();
    expect(client).toHaveTextContent("The tap still leaks");
    expect(within(provider).getByText("Provider")).toBeInTheDocument();
    expect(within(system).getByText("System")).toBeInTheDocument();
    expect(system).not.toHaveTextContent("Unknown");
  });

  it("starts the conversation scrolled to the newest message", async () => {
    const heightBefore = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    const topBefore = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop");
    const setTop = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", { configurable: true, get: () => 0, set: setTop });
    try {
      vi.mocked(services.getJobConversation).mockResolvedValueOnce(page(chat));
      renderDisputes([row({ clientId: "c1", providerId: "p1" })]);
      await screen.findByRole("log", { name: "Job conversation" });
      await waitFor(() => expect(setTop).toHaveBeenLastCalledWith(640));
    } finally {
      restoreProperty("scrollHeight", heightBefore);
      restoreProperty("scrollTop", topBefore);
    }
  });

  it("refreshes the job chat on request", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation)
      .mockResolvedValueOnce(page(chat))
      .mockResolvedValueOnce(page([...chat, { id: "m4", senderId: "c1", senderName: "Ana", body: "Photo sent in chat", createdAt: "2026-10-04T12:00:00Z" }]));
    renderDisputes([row({ clientId: "c1", providerId: "p1" })]);
    await screen.findByText("The tap still leaks");
    await user.click(screen.getByRole("button", { name: "Refresh conversation" }));
    expect(await screen.findByText("Photo sent in chat")).toBeInTheDocument();
    expect(screen.getByText("4 messages")).toBeInTheDocument();
    expect(services.getJobConversation).toHaveBeenCalledTimes(2);
  });

  it("keeps the last copy on screen and says so when a refresh fails", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(page(chat)).mockRejectedValueOnce(new Error("offline"));
    renderDisputes([row({ clientId: "c1", providerId: "p1" })]);
    await screen.findByText("The tap still leaks");
    await user.click(screen.getByRole("button", { name: "Refresh conversation" }));
    expect(await screen.findByText("Could not refresh the conversation. The last copy is still shown.")).toBeInTheDocument();
    expect(screen.getByText("The tap still leaks")).toBeInTheDocument();
  });

  it("opens a chat photo in a dialog that Escape closes, handing focus back to the thumbnail", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(page(chat));
    renderDisputes([row({ clientId: "c1", providerId: "p1" })]);
    const thumbnail = await screen.findByRole("button", { name: "Chat photo from Rico, Provider" });
    await user.click(thumbnail);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("img", { name: "Chat photo from Rico, Provider" })).toHaveAttribute("src", "https://signed.test/leak.jpg");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Radix hands focus back on a later tick, so wait for it.
    await waitFor(() => expect(thumbnail).toHaveFocus());
  });

  it("tells senders apart by name when the API sends no sender ids", async () => {
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(page([
      { id: "n1", senderName: "Ana", body: "Client here", createdAt: "2026-10-04T09:00:00Z" },
      { id: "n2", senderName: "Rico", body: "Provider here", createdAt: "2026-10-04T10:00:00Z" },
    ] as ConversationMessage[]));
    renderDisputes([row({ clientName: "Ana", providerName: "Rico", entries: [] })]);
    const log = await screen.findByRole("log", { name: "Job conversation" });
    const [client, provider] = within(log).getAllByRole("listitem");
    expect(client).toHaveAttribute("data-role", "client");
    expect(provider).toHaveAttribute("data-role", "provider");
  });

  it("does not let Escape in the photo dialog reach the queue's page shortcuts", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(page(chat));
    renderDisputes([row({ clientId: "c1", providerId: "p1" })]);
    await user.click(await screen.findByRole("button", { name: "Chat photo from Rico, Provider" }));
    await screen.findByRole("dialog");
    const pageListener = vi.fn();
    document.addEventListener("keydown", pageListener);
    try {
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(pageListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", pageListener);
    }
  });
});

describe("case layout", () => {
  it("keeps the response deadline above the case parties", () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    renderDisputes([row({ id: "c1", jobTitle: "Move sofa", clientName: "Ana", clientId: "c1", providerId: "p1", cancellationState: "pending", cancellationDeadline: "2026-10-15T09:00:00Z" })]);
    const banner = screen.getByText(/Provider response deadline passed 3 h ago/);
    const clientLabel = screen.getByText("Client", { exact: true });
    expect(banner.compareDocumentPosition(clientLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("clarification form", () => {
  it("addresses the clarification to the party chosen in Ask", async () => {
    const user = userEvent.setup();
    setup(false);
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Share the agreement chat.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Ask" }), "client");
    await user.click(screen.getByRole("button", { name: "Request clarification" }));
    await waitFor(() => expect(services.requestDisputeClarification).toHaveBeenCalledWith("d1", "To the client: Share the agreement chat."));
  });

  it("fills a quick template into the note and says who can see it", async () => {
    const user = userEvent.setup();
    setup(false);
    await user.click(screen.getByRole("button", { name: "Please share a photo of the finished work" }));
    expect(screen.getByLabelText(/Resolution or clarification note/i)).toHaveValue("Please share a photo of the finished work");
    expect(screen.getByText(/visible to both parties on this case/)).toBeInTheDocument();
    expect(screen.getByText(/attach evidence from their own job chat/)).toBeInTheDocument();
  });

  it("will not send a clarification that is too long once the address is added", () => {
    setup(false);
    const note = screen.getByLabelText(/Resolution or clarification note/i);
    fireEvent.change(note, { target: { value: "x".repeat(983) } });
    expect(screen.getByRole("button", { name: "Request clarification" })).toBeEnabled();
    fireEvent.change(note, { target: { value: "x".repeat(990) } });
    expect(screen.getByRole("button", { name: "Request clarification" })).toBeDisabled();
    expect(screen.getByText(/shorten by 7 characters/)).toBeInTheDocument();
  });
});

describe("case sections and decision card", () => {
  afterEach(() => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    window.localStorage.clear();
  });

  /** Makes the detail pane report `width`, as the browser's ResizeObserver would. */
  function paneWidth(width: number) {
    class PaneObserver {
      constructor(private readonly onResize: ResizeObserverCallback) {}
      observe(target: Element) {
        this.onResize([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = PaneObserver;
  }

  it("shows the case header with the client, the amount held and the provider", () => {
    setup(false, { clientName: "Ana Cruz", providerName: "Rico Lim" });
    const header = screen.getByRole("region", { name: "Case header" });
    expect(within(header).getByRole("heading", { level: 2, name: "Repair tap" })).toBeInTheDocument();
    expect(within(header).getByText("Held in escrow")).toBeInTheDocument();
    expect(within(header).getByText("₱500.00")).toBeInTheDocument();
    expect(within(header).getByText("Client", { exact: true })).toBeInTheDocument();
    expect(within(header).getByText("Ana Cruz")).toBeInTheDocument();
    expect(within(header).getByText("Rico Lim")).toBeInTheDocument();
  });

  it("names each evidence card and counts what is inside it", () => {
    setup(false, { entries: [
      entry("statement", "2026-10-10T00:00:00Z"),
      entry("appeal", "2026-10-11T00:00:00Z"),
    ] });
    expect(screen.getByRole("region", { name: "Summary" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Activity" })).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Attached chat" })).toBeInTheDocument();
  });

  it("says what is missing when a case has no statements yet", () => {
    setup(false);
    expect(within(screen.getByRole("region", { name: "Activity" })).getByText("No statements yet. Ask a party for one.")).toBeInTheDocument();
  });

  it("puts the clarification step and the decision step in the decision card", () => {
    setup(false);
    const decision = screen.getByRole("complementary", { name: "Your decision" });
    expect(within(decision).getByRole("heading", { name: /Need more info\?/ })).toBeInTheDocument();
    expect(within(decision).getByRole("heading", { name: /Decide/ })).toBeInTheDocument();
    expect(within(decision).getByRole("button", { name: "Request clarification" })).toBeInTheDocument();
  });

  it("splits the release into job amount, platform fee and provider share at the current rate", async () => {
    setup(false, { amount: "₱1,000.00", clientName: "Ana Cruz", providerName: "Rico Lim" });
    expect(await screen.findByText("Job amount ₱1,000 · Platform fee ₱150 · Provider receives ₱850. This can't be undone.")).toBeInTheDocument();
    expect(screen.getByText(REFUND_SENTENCE)).toBeInTheDocument();
  });

  it("rounds the platform fee half-up to centavos: ₱67 at 7.5% is ₱5.03, provider ₱61.97", async () => {
    vi.mocked(services.getCommission).mockResolvedValueOnce({ rate: 0.075, updatedAt: "2026-10-01T00:00:00Z", totalEarned: 0, earnedThisMonth: 0, releasedJobs: 0, pendingEstimate: 0 });
    setup(false, { amount: "₱67.00" });
    expect(await screen.findByText("Job amount ₱67 · Platform fee ₱5.03 · Provider receives ₱61.97. This can't be undone.")).toBeInTheDocument();
  });

  it("shows only the job amount when the commission rate is not available", async () => {
    vi.mocked(services.getCommission).mockRejectedValueOnce(new Error("offline"));
    setup(false, { amount: "₱1,000.00" });
    await flushRequests();
    expect(screen.getByText("Job amount ₱1,000. This can't be undone.")).toBeInTheDocument();
    expect(screen.queryByText(/Platform fee/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Provider receives/)).not.toBeInTheDocument();
  });

  it("describes a refund as recorded, not sent, in the decision card and the confirmation", async () => {
    const user = userEvent.setup();
    setup(false);
    expect(screen.getByText(REFUND_SENTENCE)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Both sides reviewed.");
    await user.click(screen.getByRole("button", { name: /Refund client/ }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Record the refund to the client?")).toBeInTheDocument();
    expect(within(dialog).getByText(REFUND_SENTENCE)).toBeInTheDocument();
  });

  it("says a recorded decision moves no money", () => {
    setup(true);
    expect(screen.getByText("Saves the decision and note. No money moves.")).toBeInTheDocument();
  });

  it("colour-codes release green and refund red", () => {
    setup(false);
    expect(screen.getByRole("button", { name: /Release to provider/ })).toHaveClass("bg-ok-solid");
    expect(screen.getByRole("button", { name: /Refund client/ })).toHaveClass("text-danger");
  });

  it("renders each decision button once, inside the decision card, when the pane is wide", () => {
    paneWidth(900);
    setup(false);
    const decision = screen.getByRole("complementary", { name: "Your decision" });
    expect(within(decision).getByRole("button", { name: /Release to provider/ })).toBeInTheDocument();
    expect(within(decision).getByRole("button", { name: /Refund client/ })).toBeInTheDocument();
    expect(decision).toHaveClass("sticky");
    expect(screen.queryByRole("group", { name: "Decision actions" })).not.toBeInTheDocument();
  });

  it("moves the decision buttons into one sticky bottom bar when the pane is narrow", async () => {
    paneWidth(480);
    setup(false);
    const bar = screen.getByRole("group", { name: "Decision actions" });
    expect(within(bar).getByRole("button", { name: /Release to provider/ })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /Refund client/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Release to provider/ })).toHaveLength(1);
    const decision = screen.getByRole("complementary", { name: "Your decision" });
    expect(within(decision).queryByRole("button", { name: /Release to provider/ })).not.toBeInTheDocument();
    expect(await within(decision).findByText("Job amount ₱500 · Platform fee ₱75 · Provider receives ₱425. This can't be undone.")).toBeInTheDocument();
    expect(decision).not.toHaveClass("sticky");
  });

  it("keeps the bottom bar's buttons behind the confirmation dialog", async () => {
    paneWidth(480);
    const user = userEvent.setup();
    setup(false);
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Both sides reviewed.");
    await user.click(within(screen.getByRole("group", { name: "Decision actions" })).getByRole("button", { name: /Refund client/ }));
    expect(within(screen.getByRole("alertdialog")).getByText("Record the refund to the client?")).toBeInTheDocument();
    expect(resolveDispute).not.toHaveBeenCalled();
  });

  it("shows a closed case's decision in plain words, with no decision buttons", async () => {
    const user = userEvent.setup();
    setup(true, {
      isOpen: false, status: "Resolved", resolution: "RELEASED_TO_PROVIDER", resolvedAt: "Oct 3, 2026", resolutionNote: "Checked the chat.",
    });
    await user.click(screen.getByRole("button", { name: /Resolved/ }));
    const decision = screen.getByRole("complementary", { name: "Decision" });
    expect(within(decision).getByText("Released to provider · Oct 3, 2026")).toBeInTheDocument();
    expect(within(decision).getByText("Checked the chat.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Release to provider|Refund client|Record/ })).not.toBeInTheDocument();
  });

  it("shows the next step under each case row", () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    renderDisputes([row({ id: "c1", jobTitle: "Move sofa", cancellationState: "pending", cancellationDeadline: "2026-10-15T16:00:00Z" })]);
    const list = screen.getByRole("list", { name: "Disputes" });
    expect(within(list).getByText("Waiting for provider · due in 4 h")).toBeInTheDocument();
  });

  it("remembers a collapsed case list under the disputes page's own key", async () => {
    const user = userEvent.setup();
    setup(false);
    await user.click(screen.getByRole("button", { name: "Collapse list" }));
    expect(window.localStorage.getItem("admin.queue.disputes")).toBe("1");
    expect(screen.getByRole("button", { name: "Expand list" })).toBeInTheDocument();
  });
});

describe("DisputesPage — console parts", () => {
  function renderParts(parts: Record<string, unknown>, disputes: DisputeRow[]) {
    vi.mocked(useApp).mockReturnValue({
      disputes, resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), refreshCounts: vi.fn().mockResolvedValue(undefined),
      loading: false, disputesLoading: false, ...parts,
    } as unknown as ReturnType<typeof useApp>);
    return render(<ToastProvider><DisputesPage /></ToastProvider>);
  }

  it("shows the queue placeholder, not the empty state, while the disputes are still loading", () => {
    renderParts({ disputesLoading: true }, []);
    expect(screen.queryByText("No disputes raised yet")).not.toBeInTheDocument();
  });

  it("lists the disputes as soon as they arrive, while the rest of the console is still loading", () => {
    renderParts({ loading: true }, [row({ jobTitle: "Move sofa" })]);
    expect(screen.getAllByText("Move sofa").length).toBeGreaterThan(0);
  });
});
