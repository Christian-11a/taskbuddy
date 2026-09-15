import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionsPage } from "./TransactionsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";
import type { UserRow } from "@/lib/adapters";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  searchTransactions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getWalletTransactions: vi.fn().mockResolvedValue([]),
  issueRecoveryCredit: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);
const mockedGetWalletTransactions = vi.mocked(services.getWalletTransactions);
const mockedIssueRecoveryCredit = vi.mocked(services.issueRecoveryCredit);

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
    suspensionReason: "—",
    ...overrides,
  };
}

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("TransactionsPage — Issue Credit (Wallet tab)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetWalletTransactions.mockResolvedValue([]);
    mockedUseApp.mockReturnValue({
      users: [makeUser()],
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
    expect(mockedGetWalletTransactions).toHaveBeenCalledTimes(2);
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
