import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionsPage } from "./TransactionsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";
import type { UserRow } from "@/lib/adapters";
import type { AdminBookingDetail, WalletTransaction } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  searchTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  searchWalletTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  retryEscrowTransfer: vi.fn(),
  getBookingDetail: vi.fn().mockRejectedValue(new Error("offline")),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedGetBookingDetail = vi.mocked(services.getBookingDetail);
const mockedSearchWalletTransactions = vi.mocked(services.searchWalletTransactions);
const mockedSearchTransactions = vi.mocked(services.searchTransactions);

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "u-1",
    initials: "ML",
    name: "Morgan Lee",
    email: "morgan@example.com",
    role: "Provider",
    rolePlain: "Provider",
    isProvider: true,
    status: "Active",
    statusClass: "badge-active",
    joined: "Mar 10, 2024",
    createdAt: "2024-03-10",
    activity: "21 jobs · 4.9 rating",
    phone: "0917 555 0101",
    city: "Quezon City",
    category: "Plumbing",
    jobsCompleted: 21,
    rating: "4.9 rating",
    ratingValue: 4.9,
    suspendedUntil: "—",
    verification: "Verified",
    verificationClass: "badge-approved",
    suspensionReason: "—",
    ...overrides,
  };
}

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/** The shared app state the page reads; lastUpdated changes when the live refresh lands. */
function appState(lastUpdated: number) {
  return { users: [], ensureUsers: vi.fn(), settings: { anonymizeExports: false }, lastUpdated } as unknown as ReturnType<typeof useApp>;
}

function liveRefresh(rerender: (ui: React.ReactElement) => void, lastUpdated: number) {
  mockedUseApp.mockReturnValue(appState(lastUpdated));
  rerender(<ToastProvider><TransactionsPage /></ToastProvider>);
}

function jobDetail(completedAt: string | null, escrowStatus: AdminBookingDetail["escrowStatus"] = "DISPUTED"): AdminBookingDetail {
  return { description: null, address: null, scheduledAt: null, photoUrls: [], escrowStatus, escrowAmount: 1500, completedAt, status: "completed" };
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** Lets already-resolved mock requests settle inside the test. */
async function flushRequests() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe("TransactionsPage — Payment records is read-only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchWalletTransactions.mockResolvedValue({ items: [], total: 0 });
    mockedUseApp.mockReturnValue({ ensureUsers: vi.fn(), users: [makeUser()], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
  });

  it("has no Issue Credit control on the wallet history tab", async () => {
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));
    expect(await screen.findByText("No payment records found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /issue credit/i })).not.toBeInTheDocument();
  });
});

describe("TransactionsPage — Escrow tab payment details", () => {
  beforeEach(() => {
    mockedUseApp.mockReturnValue({ ensureUsers: vi.fn(), users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
    mockedSearchTransactions.mockResolvedValue({
      items: [
        {
          id: "esc-1", jobId: "job-1", customerName: "Jamie Kim", providerName: "Pat Morgan",
          service: "Plumbing", amount: 1500, status: "COMPLETED", date: "2026-10-16",
          fundingMethod: "wallet", transferStatus: "failed", stripeTransferId: null,
          transferError: "Account is restricted",
        },
      ],
      total: 1,
    });
  });

  it("shows a completed job's payment as released in the escrow drawer", async () => {
    mockedGetBookingDetail.mockResolvedValue(jobDetail(hoursAgo(10), "COMPLETED"));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));

    expect(mockedGetBookingDetail).toHaveBeenCalledWith("job-1");
    expect(await screen.findByText("Released")).toBeInTheDocument();
    expect(screen.queryByText("Held while the complaint is open")).not.toBeInTheDocument();
  });

  it("shows a completed job's payment as held only while a complaint is open", async () => {
    mockedGetBookingDetail.mockResolvedValue(jobDetail(hoursAgo(10), "DISPUTED"));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));

    expect(await screen.findByText("Held while the complaint is open")).toBeInTheDocument();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
  });

  it("says release is in progress, not a complaint, for a held payment with no dispute", async () => {
    mockedGetBookingDetail.mockResolvedValue(jobDetail(hoursAgo(10), "IN_ESCROW"));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));

    expect(await screen.findByText("Release in progress")).toBeInTheDocument();
    expect(screen.queryByText("Held while the complaint is open")).not.toBeInTheDocument();
  });

  it("uses the complaint wording when the job is disputed", async () => {
    mockedGetBookingDetail.mockResolvedValue({ ...jobDetail(hoursAgo(10), "IN_ESCROW"), displayStatus: "disputed" });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));

    expect(await screen.findByText("Held while the complaint is open")).toBeInTheDocument();
    expect(screen.queryByText("Release in progress")).not.toBeInTheDocument();
  });

  it("shows no payment line and no error when the job detail fails to load", async () => {
    mockedGetBookingDetail.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));

    await waitFor(() => expect(mockedGetBookingDetail).toHaveBeenCalledWith("job-1"));
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
    expect(screen.queryByText("Held while the complaint is open")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the payment once a job that was not completed yet is completed", async () => {
    mockedGetBookingDetail.mockClear();
    mockedGetBookingDetail
      .mockResolvedValueOnce(jobDetail(null))
      .mockResolvedValueOnce(jobDetail(hoursAgo(10), "COMPLETED"));
    const user = userEvent.setup();
    mockedUseApp.mockReturnValue(appState(1));
    const { rerender } = renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));
    await flushRequests();
    expect(screen.queryByText("Released")).not.toBeInTheDocument();

    liveRefresh(rerender, 2);
    expect(await screen.findByText("Released")).toBeInTheDocument();
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("recovers the payment after a failed job-detail request, on a later live refresh", async () => {
    mockedGetBookingDetail.mockClear();
    mockedGetBookingDetail
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jobDetail(hoursAgo(10), "DISPUTED"));
    const user = userEvent.setup();
    mockedUseApp.mockReturnValue(appState(1));
    const { rerender } = renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));
    await flushRequests();
    expect(screen.queryByText("Held while the complaint is open")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    liveRefresh(rerender, 2);
    expect(await screen.findByText("Held while the complaint is open")).toBeInTheDocument();
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(2);
  });
});

describe("TransactionsPage — server-paged Wallet tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({ ensureUsers: vi.fn(), users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
    mockedSearchWalletTransactions.mockResolvedValue({
      items: [
        {
          id: "wallet-1", profileName: "Morgan Lee", direction: "credit", kind: "topup",
          status: "completed", amount: 125, title: "Wallet funding", createdAt: "2026-10-18T10:00:00.000Z",
        },
      ],
      total: 25,
    });
  });

  it("sends debounced searches and page changes to the server and labels page-only summaries", async () => {
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));

    expect(await screen.findByText("Morgan Lee")).toBeInTheDocument();
    expect(mockedSearchWalletTransactions).toHaveBeenCalledWith({ search: "", page: 1, pageSize: 12 });
    expect(screen.getByText("credits on this page")).toBeInTheDocument();
    expect(screen.getByText("₱125")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search payment records"), "Morgan");
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export current page" })).toBeDisabled();
    });
    await vi.waitFor(() => {
      expect(mockedSearchWalletTransactions).toHaveBeenLastCalledWith({ search: "Morgan", page: 1, pageSize: 12 });
    });

    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await vi.waitFor(() => {
      expect(mockedSearchWalletTransactions).toHaveBeenLastCalledWith({ search: "Morgan", page: 2, pageSize: 12 });
    });
  });

  it("disables exports immediately while a new wallet search is pending", async () => {
    type Result = Awaited<ReturnType<typeof services.searchWalletTransactions>>;
    let resolveSearch!: (result: Result) => void;
    const pending = new Promise<Result>((resolve) => { resolveSearch = resolve; });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));
    expect(await screen.findByText("Morgan Lee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export current page" })).toBeEnabled();
    mockedSearchWalletTransactions.mockReturnValueOnce(pending);
    await user.type(screen.getByLabelText("Search payment records"), "missing");
    expect(screen.getByRole("button", { name: "Export current page" })).toBeDisabled();
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument();
    await waitFor(() => expect(mockedSearchWalletTransactions).toHaveBeenLastCalledWith({ search: "missing", page: 1, pageSize: 12 }));
    await act(async () => { resolveSearch({ items: [], total: 0 }); });
    expect(await screen.findByText("No payment records found.")).toBeInTheDocument();
  });

  it("ignores an older wallet response after a newer search has completed", async () => {
    type Result = Awaited<ReturnType<typeof services.searchWalletTransactions>>;
    let resolveOld!: (result: Result) => void;
    let resolveNew!: (result: Result) => void;
    mockedSearchWalletTransactions
      .mockReturnValueOnce(new Promise<Result>((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise<Result>((resolve) => { resolveNew = resolve; }));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));
    await user.type(screen.getByLabelText("Search payment records"), "current");
    await waitFor(() => expect(mockedSearchWalletTransactions).toHaveBeenLastCalledWith({ search: "current", page: 1, pageSize: 12 }));
    await act(async () => { resolveNew({ items: [], total: 0 }); });
    expect(await screen.findByText("No payment records found.")).toBeInTheDocument();
    await act(async () => { resolveOld({ items: [{ id: "old", profileName: "Old result", direction: "credit", kind: "topup", status: "completed", amount: 1, title: "Old funding", createdAt: "2026-10-17T00:00:00.000Z" }], total: 1 }); });
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(screen.getByText("No payment records found.")).toBeInTheDocument();
  });
});


describe("TransactionsPage — load failures", () => {
  const escrowRow = {
    id: "esc-1", jobId: "job-1", customerName: "Jamie Kim", providerName: "Pat Morgan",
    service: "Plumbing", amount: 1500, status: "COMPLETED", date: "2026-09-16",
    fundingMethod: "wallet", transferStatus: "none", stripeTransferId: null, transferError: null,
  } as const;
  const walletRow = {
    id: "wallet-1", profileName: "Morgan Lee", direction: "credit", kind: "topup",
    status: "completed", amount: 125, title: "Wallet funding", createdAt: "2026-10-18T10:00:00.000Z",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({ ensureUsers: vi.fn(), users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
    mockedSearchTransactions.mockReset();
    mockedSearchWalletTransactions.mockReset();
    mockedSearchTransactions.mockResolvedValue({ items: [], total: 0 });
    mockedSearchWalletTransactions.mockResolvedValue({ items: [], total: 0 });
  });

  it("shows an error state, not 'No escrow transactions yet.', when the first escrow load fails", async () => {
    mockedSearchTransactions.mockRejectedValue(new Error("down"));
    renderWithToast(<TransactionsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load escrow transactions.");
    expect(screen.queryByText("No escrow transactions yet.")).not.toBeInTheDocument();
  });

  it("keeps the last good escrow rows and offers Retry when an escrow refresh fails", async () => {
    mockedSearchTransactions.mockResolvedValueOnce({ items: [escrowRow], total: 1 });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    expect(await screen.findByText("Jamie Kim")).toBeInTheDocument();

    mockedSearchTransactions.mockRejectedValueOnce(new Error("down"));
    await user.type(screen.getByLabelText("Search escrow transactions"), "Jam");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't refresh escrow transactions.");
    expect(screen.getByText("Jamie Kim")).toBeInTheDocument();

    mockedSearchTransactions.mockResolvedValueOnce({ items: [escrowRow], total: 1 });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("keeps the last good wallet rows and offers Retry when a wallet refresh fails", async () => {
    mockedSearchWalletTransactions.mockResolvedValueOnce({ items: [walletRow], total: 1 });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));
    expect(await screen.findByText("Morgan Lee")).toBeInTheDocument();

    mockedSearchWalletTransactions.mockRejectedValueOnce(new Error("down"));
    await user.type(screen.getByLabelText("Search payment records"), "Mor");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't refresh payment records.");
    expect(screen.getByText("Morgan Lee")).toBeInTheDocument();
  });

  it("shows the wallet error state with a retry when the first wallet load fails", async () => {
    mockedSearchWalletTransactions.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load payment records.");
    expect(screen.queryByText("No payment records found.")).not.toBeInTheDocument();
  });

  it("caps the escrow search at 100 characters and shows the API's 400 message under it", async () => {
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    const escrowSearch = await screen.findByLabelText("Search escrow transactions");
    expect(escrowSearch).toHaveAttribute("maxLength", "100");

    mockedSearchTransactions.mockRejectedValueOnce(new ApiError(400, "Search is too long."));
    await user.type(escrowSearch, "x");

    expect(await screen.findByText("Search is too long.")).toHaveAttribute("role", "alert");
    expect(escrowSearch).toHaveAccessibleDescription("Search is too long.");
    expect(screen.queryByText("Could not load escrow transactions.")).not.toBeInTheDocument();
  });
});

describe("TransactionsPage - online payments and payment records", () => {
  beforeEach(() => {
    mockedUseApp.mockReturnValue({ ensureUsers: vi.fn(), users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
  });

  it("labels a non-card payment Online payment and gives the payout a no-job-state note", async () => {
    mockedSearchTransactions.mockResolvedValue({
      items: [{
        id: "esc-9", jobId: "job-9", customerName: "Jamie Kim", providerName: "Pat Morgan",
        service: "Plumbing", amount: 900, status: "COMPLETED", date: "2026-10-01",
        fundingMethod: "wallet", transferStatus: "none", stripeTransferId: null, transferError: null,
      }],
      total: 1,
    });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    const dash = await screen.findByTitle("Paid out with the provider's next automatic payout");
    expect(dash).toHaveTextContent("—");
    await user.click(screen.getByRole("button", { name: /show details for esc-9/i }));
    expect(screen.getByText("Online payment")).toBeInTheDocument();
    expect(screen.queryByText("Wallet")).not.toBeInTheDocument();
  });

  it("shows the Payment records tab with plain kind labels and a status", async () => {
    mockedSearchWalletTransactions.mockResolvedValue({
      items: [
        { id: "w1", profileName: "Pat Morgan", direction: "debit", kind: "withdrawal", status: "failed", amount: 500, title: "Payout sent", createdAt: "2026-10-18T10:00:00.000Z", reviewNote: "Xendit: Account number invalid" },
      ],
      total: 1,
    });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    expect(screen.queryByRole("button", { name: /wallet history/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Payment records" }));
    expect(await screen.findByText("Payout to provider")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("labels a 'Refund sent' withdrawal as a refund to client", async () => {
    mockedSearchWalletTransactions.mockResolvedValue({
      items: [
        { id: "w2", profileName: "Client Lee", direction: "debit", kind: "withdrawal", status: "completed", amount: 300, title: "Refund sent", createdAt: "2026-10-18T10:00:00.000Z", reviewNote: "XENDIT-payout-1" },
      ],
      total: 1,
    });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));
    expect(await screen.findByText("Refund to client")).toBeInTheDocument();
    expect(screen.queryByText("Payout to provider")).not.toBeInTheDocument();
  });
});

describe("TransactionsPage — legacy test records are hidden", () => {
  beforeEach(() => {
    mockedUseApp.mockReturnValue({ ensureUsers: vi.fn(), users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
  });

  it("hides card-funded escrow rows and leaves them out of the page volume", async () => {
    const escrow = (id: string, fundingMethod: "wallet" | "card", amount: number) => ({
      id, jobId: `job-${id}`, customerName: "Jamie Kim", providerName: "Pat Morgan", service: "Plumbing", amount,
      status: "COMPLETED" as const, date: "2026-10-18", fundingMethod, transferStatus: "none" as const, stripeTransferId: null, transferError: null,
    });
    mockedSearchTransactions.mockResolvedValue({ items: [escrow("keep-1", "wallet", 900), escrow("card-1", "card", 5000)], total: 2 });
    renderWithToast(<TransactionsPage />);
    expect(await screen.findByRole("button", { name: /show details for keep-1/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show details for card-1/i })).not.toBeInTheDocument();
    expect(screen.getAllByText("₱900").length).toBeGreaterThan(0);
    expect(screen.queryByText("₱5,900")).not.toBeInTheDocument();
  });

  it("hides wallet-era payment records and keeps current ones", async () => {
    const row = (id: string, over: Partial<WalletTransaction>): WalletTransaction => ({
      id, profileName: "Morgan Lee", direction: "credit", kind: "topup", status: "completed", amount: 100,
      title: "Client payment", createdAt: "2026-10-18T10:00:00.000Z", ...over,
    });
    mockedSearchWalletTransactions.mockResolvedValue({
      items: [
        row("keep-topup", {}),
        row("keep-xendit", { direction: "debit", kind: "withdrawal", title: "Payout sent", reviewNote: "XENDIT-42" }),
        row("old-date", { createdAt: "2026-10-15T23:59:00Z" }),
        row("retired", { title: "Prototype wallet retired" }),
        row("recovery", { kind: "recovery_credit", title: "Dispute credit" }),
        row("no-marker", { direction: "debit", kind: "withdrawal", title: "Payout sent", reviewNote: null }),
      ],
      total: 6,
    });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Payment records" }));
    expect(await screen.findByText("Payout to provider")).toBeInTheDocument();
    expect(screen.getAllByText("Morgan Lee")).toHaveLength(2);
    expect(screen.queryByText("Dispute credit")).not.toBeInTheDocument();
    expect(screen.queryByText("Prototype wallet retired")).not.toBeInTheDocument();
    expect(screen.getByText("rows on this page")).toBeInTheDocument();
  });
});

