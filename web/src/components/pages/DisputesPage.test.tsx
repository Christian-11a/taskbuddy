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
  vi.mocked(useApp).mockReturnValue({ disputes, resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), refreshCounts: vi.fn().mockResolvedValue(undefined), loading: false } as unknown as ReturnType<typeof useApp>);
  return render(<ToastProvider><DisputesPage /></ToastProvider>);
}

function setup(paymentSettled: boolean, extra: Partial<DisputeRow> = {}) {
  return renderDisputes([row({ paymentSettled, ...extra })]);
}

/** The console's live refresh lands: new disputes data and a new lastUpdated stamp. */
function liveRefresh(rerender: (ui: React.ReactElement) => void, disputes: DisputeRow[], lastUpdated: number) {
  vi.mocked(useApp).mockReturnValue({
    disputes, resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), refreshCounts: vi.fn().mockResolvedValue(undefined), loading: false, lastUpdated,
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
      resolveDispute, refreshData: vi.fn().mockResolvedValue(undefined), refreshCounts: vi.fn().mockResolvedValue(undefined), loading: false,
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

const chat: ConversationMessage[] = [
  { id: "m1", senderId: "c1", senderName: "Ana", body: "The tap still leaks", createdAt: "2026-10-04T09:00:00Z" },
  { id: "m2", senderId: "p1", senderName: "Rico", body: "I will return Monday", createdAt: "2026-10-04T10:00:00Z", attachmentUrl: "https://signed.test/leak.jpg" },
  { id: "m3", senderId: null, senderName: "Unknown", body: "Job marked complete", createdAt: "2026-10-04T11:00:00Z" },
];

function restoreProperty(name: "scrollHeight" | "scrollTop", original: PropertyDescriptor | undefined) {
  if (original) Object.defineProperty(HTMLElement.prototype, name, original);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
}

describe("job conversation panel", () => {
  it("shows a fixed-height scrolling log with a message count and each sender's role", async () => {
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(chat);
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
      vi.mocked(services.getJobConversation).mockResolvedValueOnce(chat);
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
      .mockResolvedValueOnce(chat)
      .mockResolvedValueOnce([...chat, { id: "m4", senderId: "c1", senderName: "Ana", body: "Photo sent in chat", createdAt: "2026-10-04T12:00:00Z" }]);
    renderDisputes([row({ clientId: "c1", providerId: "p1" })]);
    await screen.findByText("The tap still leaks");
    await user.click(screen.getByRole("button", { name: "Refresh conversation" }));
    expect(await screen.findByText("Photo sent in chat")).toBeInTheDocument();
    expect(screen.getByText("4 messages")).toBeInTheDocument();
    expect(services.getJobConversation).toHaveBeenCalledTimes(2);
  });

  it("keeps the last copy on screen and says so when a refresh fails", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(chat).mockRejectedValueOnce(new Error("offline"));
    renderDisputes([row({ clientId: "c1", providerId: "p1" })]);
    await screen.findByText("The tap still leaks");
    await user.click(screen.getByRole("button", { name: "Refresh conversation" }));
    expect(await screen.findByText("Could not refresh the conversation. The last copy is still shown.")).toBeInTheDocument();
    expect(screen.getByText("The tap still leaks")).toBeInTheDocument();
  });

  it("opens a chat photo in a dialog that Escape closes, handing focus back to the thumbnail", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(chat);
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
    vi.mocked(services.getJobConversation).mockResolvedValueOnce([
      { id: "n1", senderName: "Ana", body: "Client here", createdAt: "2026-10-04T09:00:00Z" },
      { id: "n2", senderName: "Rico", body: "Provider here", createdAt: "2026-10-04T10:00:00Z" },
    ] as ConversationMessage[]);
    renderDisputes([row({ clientName: "Ana", providerName: "Rico", entries: [] })]);
    const log = await screen.findByRole("log", { name: "Job conversation" });
    const [client, provider] = within(log).getAllByRole("listitem");
    expect(client).toHaveAttribute("data-role", "client");
    expect(provider).toHaveAttribute("data-role", "provider");
  });

  it("does not let Escape in the photo dialog reach the queue's page shortcuts", async () => {
    const user = userEvent.setup();
    vi.mocked(services.getJobConversation).mockResolvedValueOnce(chat);
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
    expect(screen.getByRole("region", { name: "Conversation" })).toBeInTheDocument();
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

  it("says in plain words what each decision does, beside its button", () => {
    setup(false, { amount: "₱500.00", clientName: "Ana Cruz", providerName: "Rico Lim" });
    expect(screen.getByText("Pays ₱500.00 to Rico Lim. This can't be undone.")).toBeInTheDocument();
    expect(screen.getByText("Returns ₱500.00 to Ana Cruz. This can't be undone.")).toBeInTheDocument();
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

  it("moves the decision buttons into one sticky bottom bar when the pane is narrow", () => {
    paneWidth(480);
    setup(false);
    const bar = screen.getByRole("group", { name: "Decision actions" });
    expect(within(bar).getByRole("button", { name: /Release to provider/ })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /Refund client/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Release to provider/ })).toHaveLength(1);
    const decision = screen.getByRole("complementary", { name: "Your decision" });
    expect(within(decision).queryByRole("button", { name: /Release to provider/ })).not.toBeInTheDocument();
    expect(within(decision).getByText("Pays ₱500.00 to Provider. This can't be undone.")).toBeInTheDocument();
    expect(decision).not.toHaveClass("sticky");
  });

  it("keeps the bottom bar's buttons behind the confirmation dialog", async () => {
    paneWidth(480);
    const user = userEvent.setup();
    setup(false);
    await user.type(screen.getByLabelText(/Resolution or clarification note/i), "Both sides reviewed.");
    await user.click(within(screen.getByRole("group", { name: "Decision actions" })).getByRole("button", { name: /Refund client/ }));
    expect(within(screen.getByRole("alertdialog")).getByText("Refund escrow to the client?")).toBeInTheDocument();
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
