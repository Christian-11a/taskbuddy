import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionsPage } from "./TransactionsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";
import type { UserRow } from "@/lib/adapters";
import type { AdminBookingDetail } from "@/lib/domain";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  searchTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  searchWalletTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  issueRecoveryCredit: vi.fn(),
  retryEscrowTransfer: vi.fn(),
  getBookingDetail: vi.fn().mockRejectedValue(new Error("offline")),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedGetBookingDetail = vi.mocked(services.getBookingDetail);
const mockedSearchWalletTransactions = vi.mocked(services.searchWalletTransactions);
const mockedIssueRecoveryCredit = vi.mocked(services.issueRecoveryCredit);
const mockedSearchTransactions = vi.mocked(services.searchTransactions);
const mockedRetryEscrowTransfer = vi.mocked(services.retryEscrowTransfer);

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
  return { users: [], settings: { anonymizeExports: false }, lastUpdated } as unknown as ReturnType<typeof useApp>;
}

function liveRefresh(rerender: (ui: React.ReactElement) => void, lastUpdated: number) {
  mockedUseApp.mockReturnValue(appState(lastUpdated));
  rerender(<ToastProvider><TransactionsPage /></ToastProvider>);
}

function jobDetail(completedAt: string | null): AdminBookingDetail {
  return { description: null, address: null, scheduledAt: null, photoUrls: [], escrowStatus: "IN_ESCROW", escrowAmount: 1500, completedAt, status: "completed" };
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** Lets already-resolved mock requests settle inside the test. */
async function flushRequests() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe("TransactionsPage — Issue Credit (Wallet tab)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchWalletTransactions.mockResolvedValue({ items: [], total: 0 });
    mockedUseApp.mockReturnValue({
      users: [makeUser()],
      settings: { anonymizeExports: false },
      refreshCounts: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof useApp>);
  });

  async function openIssueCreditDialog(user: ReturnType<typeof userEvent.setup>) {
    const user2 = user;
    await user2.click(screen.getByRole("button", { name: "Wallet" }));
    await user2.click(await screen.findByRole("button", { name: /issue credit/i }));
  }

  it("keeps the confirm button disabled until a recipient, amount, and title are all set", async () => {
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await openIssueCreditDialog(user);

    const dialog = screen.getByRole("alertdialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /issue credit/i });
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/search recipient/i), "Morgan");
    await user.click(await screen.findByText("Morgan Lee"));
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/credit amount/i), "500");
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByLabelText(/credit title/i), "Dispute resolution credit");
    expect(confirmBtn).toBeEnabled();
  });

  it("rejects an amount over the ₱50,000 typo-guard ceiling", async () => {
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await openIssueCreditDialog(user);

    await user.type(screen.getByLabelText(/search recipient/i), "Morgan");
    await user.click(await screen.findByText("Morgan Lee"));
    await user.type(screen.getByLabelText(/credit amount/i), "999999");
    await user.type(screen.getByLabelText(/credit title/i), "Too much");

    expect(screen.getByText(/50,000 or less/i)).toBeInTheDocument();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: /issue credit/i })).toBeDisabled();
  });

  it("submits the exact backend contract and refreshes the list on success", async () => {
    mockedIssueRecoveryCredit.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await openIssueCreditDialog(user);

    await user.type(screen.getByLabelText(/search recipient/i), "Morgan");
    await user.click(await screen.findByText("Morgan Lee"));
    await user.type(screen.getByLabelText(/credit amount/i), "500");
    await user.type(screen.getByLabelText(/credit title/i), "Dispute resolution credit");

    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /issue credit/i }));

    expect(mockedIssueRecoveryCredit).toHaveBeenCalledWith({
      profileId: "u-1",
      amount: 500,
      title: "Dispute resolution credit",
      jobId: "",
    });
    // Refetches rather than trusting the mutation response (the insert has no
    // joined profile name) — same convention as suspend/reinstate elsewhere.
    expect(mockedSearchWalletTransactions).toHaveBeenCalledTimes(2);
    expect(mockedSearchWalletTransactions).toHaveBeenLastCalledWith({ search: "", page: 1, pageSize: 12 });
    expect(await screen.findByText("Recovery credit issued.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("surfaces the backend's refusal message verbatim instead of a generic error", async () => {
    mockedIssueRecoveryCredit.mockRejectedValueOnce(
      new ApiError(400, "That recipient's account has been deleted."),
    );
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await openIssueCreditDialog(user);

    await user.type(screen.getByLabelText(/search recipient/i), "Morgan");
    await user.click(await screen.findByText("Morgan Lee"));
    await user.type(screen.getByLabelText(/credit amount/i), "500");
    await user.type(screen.getByLabelText(/credit title/i), "Dispute resolution credit");

    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /issue credit/i }));

    expect(await screen.findByText("That recipient's account has been deleted.")).toBeInTheDocument();
    // Stays open on failure so the admin can fix it rather than starting over.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("TransactionsPage — card-funded payouts (Escrow tab)", () => {
  beforeEach(() => {
    mockedUseApp.mockReturnValue({ users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
    mockedSearchTransactions.mockResolvedValue({
      items: [
        {
          id: "esc-1", jobId: "job-1", customerName: "Jamie Kim", providerName: "Pat Morgan",
          service: "Plumbing", amount: 1500, status: "COMPLETED", date: "2026-09-16",
          fundingMethod: "card", transferStatus: "failed", stripeTransferId: null,
          transferError: "Account is restricted",
        },
      ],
      total: 1,
    });
  });

  it("shows why a transfer failed and lets an admin retry it", async () => {
    mockedRetryEscrowTransfer.mockResolvedValue("transferred");
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    expect(await screen.findByText("Transfer failed")).toHaveAttribute("title", "Account is restricted");
    await user.click(screen.getByRole("button", { name: /show details for esc-1/i }));
    expect(screen.getByText("Card")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry transfer" }));

    expect(mockedRetryEscrowTransfer).toHaveBeenCalledWith("esc-1");
    expect(await screen.findByText("Payout sent to the provider's Stripe account.")).toBeInTheDocument();
    // Reloaded so the row shows the new state.
    expect(mockedSearchTransactions.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows the job's warranty window in the escrow drawer", async () => {
    mockedGetBookingDetail.mockResolvedValue({
      description: null,
      address: null,
      scheduledAt: null,
      photoUrls: [],
      escrowStatus: "IN_ESCROW",
      escrowAmount: 1500,
      completedAt: new Date(Date.now() - 10 * 3_600_000).toISOString(),
      status: "completed",
    });
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));

    expect(mockedGetBookingDetail).toHaveBeenCalledWith("job-1");
    expect(await screen.findByText(/Warranty open · 2 d 1[34] h left/)).toBeInTheDocument();
    expect(screen.getByText("Payment is held until the warranty ends")).toBeInTheDocument();
  });

  it("shows no warranty line and no error when the job detail fails to load", async () => {
    mockedGetBookingDetail.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));

    await waitFor(() => expect(mockedGetBookingDetail).toHaveBeenCalledWith("job-1"));
    expect(screen.queryByText(/Warranty/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the warranty window once a job that was not completed yet is completed", async () => {
    mockedGetBookingDetail.mockClear();
    mockedGetBookingDetail
      .mockResolvedValueOnce(jobDetail(null))
      .mockResolvedValueOnce(jobDetail(hoursAgo(10)));
    const user = userEvent.setup();
    mockedUseApp.mockReturnValue(appState(1));
    const { rerender } = renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));
    await flushRequests();
    expect(screen.queryByText(/Warranty/)).not.toBeInTheDocument();

    liveRefresh(rerender, 2);
    expect(await screen.findByText(/Warranty open · 2 d 1[34] h left/)).toBeInTheDocument();
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(2);
  });

  it("recovers the warranty window after a failed job-detail request, on a later live refresh", async () => {
    mockedGetBookingDetail.mockClear();
    mockedGetBookingDetail
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jobDetail(hoursAgo(10)));
    const user = userEvent.setup();
    mockedUseApp.mockReturnValue(appState(1));
    const { rerender } = renderWithToast(<TransactionsPage />);

    await user.click(await screen.findByRole("button", { name: /show details for esc-1/i }));
    await flushRequests();
    expect(screen.queryByText(/Warranty/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    liveRefresh(rerender, 2);
    expect(await screen.findByText(/Warranty open · 2 d 1[34] h left/)).toBeInTheDocument();
    expect(mockedGetBookingDetail).toHaveBeenCalledTimes(2);
  });
});

describe("TransactionsPage — server-paged Wallet tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({ users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
    mockedSearchWalletTransactions.mockResolvedValue({
      items: [
        {
          id: "wallet-1", profileName: "Morgan Lee", direction: "credit", kind: "topup",
          status: "completed", amount: 125, title: "Wallet funding", createdAt: "2026-09-18T10:00:00.000Z",
        },
      ],
      total: 25,
    });
  });

  it("sends debounced searches and page changes to the server and labels page-only summaries", async () => {
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Wallet" }));

    expect(await screen.findByText("Morgan Lee")).toBeInTheDocument();
    expect(mockedSearchWalletTransactions).toHaveBeenCalledWith({ search: "", page: 1, pageSize: 12 });
    expect(screen.getByText("credits on this page")).toBeInTheDocument();
    expect(screen.getByText("₱125")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search wallet activity"), "Morgan");
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
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    expect(await screen.findByText("Morgan Lee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export current page" })).toBeEnabled();
    mockedSearchWalletTransactions.mockReturnValueOnce(pending);
    await user.type(screen.getByLabelText("Search wallet activity"), "missing");
    expect(screen.getByRole("button", { name: "Export current page" })).toBeDisabled();
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument();
    await waitFor(() => expect(mockedSearchWalletTransactions).toHaveBeenLastCalledWith({ search: "missing", page: 1, pageSize: 12 }));
    await act(async () => { resolveSearch({ items: [], total: 0 }); });
    expect(await screen.findByText("No wallet activity found.")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    await user.type(screen.getByLabelText("Search wallet activity"), "current");
    await waitFor(() => expect(mockedSearchWalletTransactions).toHaveBeenLastCalledWith({ search: "current", page: 1, pageSize: 12 }));
    await act(async () => { resolveNew({ items: [], total: 0 }); });
    expect(await screen.findByText("No wallet activity found.")).toBeInTheDocument();
    await act(async () => { resolveOld({ items: [{ id: "old", profileName: "Old result", direction: "credit", kind: "topup", status: "completed", amount: 1, title: "Old funding", createdAt: "2026-09-30" }], total: 1 }); });
    expect(screen.queryByText("Old result")).not.toBeInTheDocument();
    expect(screen.getByText("No wallet activity found.")).toBeInTheDocument();
  });
});


describe("TransactionsPage — load failures", () => {
  const escrowRow = {
    id: "esc-1", jobId: "job-1", customerName: "Jamie Kim", providerName: "Pat Morgan",
    service: "Plumbing", amount: 1500, status: "COMPLETED", date: "2026-09-16",
    fundingMethod: "card", transferStatus: "none", stripeTransferId: null, transferError: null,
  } as const;
  const walletRow = {
    id: "wallet-1", profileName: "Morgan Lee", direction: "credit", kind: "topup",
    status: "completed", amount: 125, title: "Wallet funding", createdAt: "2026-09-18T10:00:00.000Z",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({ users: [], settings: { anonymizeExports: false } } as unknown as ReturnType<typeof useApp>);
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
    await user.click(screen.getByRole("button", { name: "Wallet" }));
    expect(await screen.findByText("Morgan Lee")).toBeInTheDocument();

    mockedSearchWalletTransactions.mockRejectedValueOnce(new Error("down"));
    await user.type(screen.getByLabelText("Search wallet activity"), "Mor");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't refresh wallet activity.");
    expect(screen.getByText("Morgan Lee")).toBeInTheDocument();
  });

  it("shows the wallet error state with a retry when the first wallet load fails", async () => {
    mockedSearchWalletTransactions.mockRejectedValue(new Error("down"));
    const user = userEvent.setup();
    renderWithToast(<TransactionsPage />);
    await user.click(screen.getByRole("button", { name: "Wallet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load wallet activity.");
    expect(screen.queryByText("No wallet activity found.")).not.toBeInTheDocument();
  });
});
