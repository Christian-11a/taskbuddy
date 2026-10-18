import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WithdrawalsPage } from "./WithdrawalsPage";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { splitPayoutFailures, owedProviders } from "@/lib/adapters";

vi.mock("@/lib/services", () => ({
  getPayoutFailures: vi.fn(),
  getFailedCardPayouts: vi.fn(),
  retryEscrowTransfer: vi.fn(),
  getWithdrawals: vi.fn(),
}));
const { refreshCounts } = vi.hoisted(() => ({ refreshCounts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/context/AppContext", () => ({ useApp: () => ({ refreshCounts }) }));
vi.mock("@/hooks/useLiveTick", () => ({ useLiveTick: () => 0 }));

const card = {
  id: "esc-1", jobId: "job-12345678", customerName: "Ana Client", providerName: "Test Provider", service: "Plumbing",
  amount: 350, status: "COMPLETED" as const, date: "2026-10-04T00:00:00Z", fundingMethod: "card" as const,
  transferStatus: "failed" as const, stripeTransferId: null, transferError: "Account is restricted",
};

const xendit = (id: string, reviewNote: string | null) => ({
  id, profileId: "p9", profileName: "Xendit Provider", amount: 1250, title: "Payout", destination: null,
  status: "failed" as const, createdAt: "2026-10-10T00:00:00Z", reviewedAt: null, reviewNote,
});

const completedAt = (id: string, createdAt: string, profileId = "p9") => ({
  id, profileId, profileName: "Xendit Provider", amount: 1250, title: "Payout", destination: null,
  status: "completed" as const, createdAt, reviewedAt: null, reviewNote: null,
});
/** A PayoutFailures as the service builds it; `balances` is each provider's wallet balance (default 0). */
const split = (failed: ReturnType<typeof xendit>[], completed: (ReturnType<typeof completedAt> | ReturnType<typeof xendit>)[] = [], balances: Record<string, number> = { p9: 1250 }) => {
  const base = splitPayoutFailures(failed, completed);
  return { ...base, owed: owedProviders(base.providers, new Map(Object.entries(balances))) };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([xendit("x1", "Xendit: Account number invalid")]));
  vi.mocked(services.getFailedCardPayouts).mockResolvedValue([]);
  vi.mocked(services.getWithdrawals).mockImplementation(async (status = "pending") => ({
    items: status === "completed"
      ? [{ id: "w1", profileId: "p1", profileName: "Old Provider", amount: 900, title: "Withdrawal", destination: "GCash 0917", status: "completed", createdAt: "2026-08-01T00:00:00Z", reviewedAt: null, reviewNote: null }]
      : status === "failed"
        ? [
            { id: "w9", profileId: "p2", profileName: "Cancelled Provider", amount: 500, title: "Withdrawal", destination: null, status: "failed", createdAt: "2026-08-02T00:00:00Z", reviewedAt: null, reviewNote: "No destination on file" },
            { id: "w10", profileId: "p9", profileName: "Xendit Provider", amount: 1250, title: "Payout", destination: null, status: "failed", createdAt: "2026-10-10T00:00:00Z", reviewedAt: null, reviewNote: "Xendit: Account number invalid" },
          ]
        : [],
    total: 0,
  }));
});
afterEach(() => vi.unstubAllGlobals());

const renderPage = () => render(<ToastProvider><WithdrawalsPage /></ToastProvider>);

it("lists failed payouts with provider, amount and the reason without its Xendit prefix", async () => {
  renderPage();
  expect(await screen.findByText("Xendit Provider")).toBeInTheDocument();
  expect(screen.getByText("Account number invalid")).toBeInTheDocument();
  expect(screen.queryByText(/Xendit:/)).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Failed payouts" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry|settle|mark as paid|reject/i })).not.toBeInTheDocument();
});

it("falls back to a plain message when there is no reason", async () => {
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([xendit("x2", "Xendit:  "), { ...xendit("x3", "Xendit:"), createdAt: "2026-10-11T00:00:00Z" }]));
  renderPage();
  expect(await screen.findAllByText("No reason given")).toHaveLength(2);
});

it("hides the older card section when nothing failed on cards", async () => {
  renderPage();
  await screen.findByText("Xendit Provider");
  expect(screen.queryByText("Older card payouts that failed")).not.toBeInTheDocument();
});

it("shows older card failures with a working Retry and refreshes the counts", async () => {
  vi.mocked(services.getFailedCardPayouts).mockResolvedValue([card]);
  vi.mocked(services.retryEscrowTransfer).mockResolvedValue("transferred");
  const user = userEvent.setup();
  renderPage();
  expect(await screen.findByText("Older card payouts that failed")).toBeInTheDocument();
  expect(screen.getByText("Account is restricted")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /retry payout for test provider/i }));
  expect(services.retryEscrowTransfer).toHaveBeenCalledWith("esc-1");
  expect(await screen.findByText("Payout sent to the provider.")).toBeInTheDocument();
  await waitFor(() => expect(refreshCounts).toHaveBeenCalled());
  expect(services.getPayoutFailures).toHaveBeenCalledTimes(2);
});

it("shows an empty state when nothing has failed", async () => {
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([]));
  renderPage();
  expect(await screen.findByText(/No failed payouts/)).toBeInTheDocument();
});

it("keeps old withdrawal requests as a read-only collapsed section", async () => {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText("Xendit Provider");
  expect(services.getWithdrawals).not.toHaveBeenCalled();
  await user.click(screen.getByText("Old withdrawal requests (before automatic payouts)"));
  expect(await screen.findByText("Old Provider")).toBeInTheDocument();
  expect(screen.getByText("Paid")).toBeInTheDocument();
  expect(screen.getByText("Cancelled Provider")).toBeInTheDocument();
  expect(screen.getByText("Not paid")).toBeInTheDocument();
  expect(screen.getByText("No destination on file")).toBeInTheDocument();
  // The Xendit failure stays in the main list only, not repeated in the old section.
  expect(screen.getAllByText("Xendit Provider")).toHaveLength(1);
});

it("owes the provider's wallet balance, not the failed amount, and explains it", async () => {
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([
    xendit("a", "Xendit: first try"),
    { ...xendit("b", "Xendit: second try"), amount: 1500, createdAt: "2026-10-12T00:00:00Z" },
  ], [], { p9: 4321 }));
  renderPage();
  expect(await screen.findByText("first try")).toBeInTheDocument();
  expect(screen.getByText("second try")).toBeInTheDocument();
  expect(screen.getByText("₱4,321")).toBeInTheDocument();
  expect(screen.getByText("provider not yet paid")).toBeInTheDocument();
  expect(screen.getByText(/current balance, not the failed amounts/)).toBeInTheDocument();
});

it("lists a failure whose provider has no balance left but does not count it", async () => {
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([xendit("x1", "Xendit: Account number invalid")], [], { p9: 0 }));
  renderPage();
  expect(await screen.findByText("Account number invalid")).toBeInTheDocument();
  expect(screen.getByText("providers not yet paid")).toBeInTheDocument();
  expect(screen.getByText("₱0")).toBeInTheDocument();
  expect(screen.getByText(/nothing left to send/)).toBeInTheDocument();
});

it("header counts owed providers plus old card failures, the same number the sidebar gets", async () => {
  vi.mocked(services.getFailedCardPayouts).mockResolvedValue([card]);
  renderPage();
  await screen.findByText("Older card payouts that failed");
  // 1 owed provider (1,250) + 1 card failure (350)
  expect(screen.getByText("providers not yet paid")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
  expect(screen.getByText("₱1,600")).toBeInTheDocument();
});

it("shows an inline error with Retry when older card payouts cannot load, and still lists Xendit failures", async () => {
  vi.mocked(services.getFailedCardPayouts).mockRejectedValueOnce(new Error("down"));
  const user = userEvent.setup();
  renderPage();
  expect(await screen.findByText("Account number invalid")).toBeInTheDocument();
  expect(await screen.findByText(/Couldn.t load older card payouts/)).toBeInTheDocument();
  vi.mocked(services.getFailedCardPayouts).mockResolvedValue([card]);
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Older card payouts that failed")).toBeInTheDocument();
  expect(screen.queryByText(/Couldn.t load older card payouts/)).not.toBeInTheDocument();
});

it("moves a failure paid by a later payout into read-only history, not money owed", async () => {
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([xendit("x1", "Xendit: Account number invalid")], [completedAt("c1", "2026-10-15T00:00:00Z")]));
  renderPage();
  expect(await screen.findByRole("heading", { name: "Earlier failed attempts" })).toBeInTheDocument();
  expect(screen.getByText(/Paid later/)).toBeInTheDocument();
  expect(screen.getByText(/No failed payouts/)).toBeInTheDocument();
  expect(screen.getByText("₱0")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
});
