import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WithdrawalsPage } from "./WithdrawalsPage";
import * as services from "@/lib/services";
import { splitPayoutFailures, owedProviders } from "@/lib/adapters";

vi.mock("@/lib/services", () => ({
  getPayoutFailures: vi.fn(),
  getWithdrawals: vi.fn(),
}));
vi.mock("@/hooks/useLiveTick", () => ({ useLiveTick: () => 0 }));

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

const renderPage = () => render(<WithdrawalsPage />);

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

it("shows no card or old-withdrawal sections and never loads the old withdrawal list", async () => {
  renderPage();
  await screen.findByText("Xendit Provider");
  expect(screen.queryByText(/Older card payouts/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Old withdrawal requests/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry payout/i })).not.toBeInTheDocument();
  expect(services.getWithdrawals).not.toHaveBeenCalled();
});

it("shows an empty state when nothing has failed", async () => {
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([]));
  renderPage();
  expect(await screen.findByText(/No failed payouts/)).toBeInTheDocument();
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

it("moves a failure paid by a later payout into read-only history, not money owed", async () => {
  vi.mocked(services.getPayoutFailures).mockResolvedValue(split([xendit("x1", "Xendit: Account number invalid")], [completedAt("c1", "2026-10-15T00:00:00Z")]));
  renderPage();
  expect(await screen.findByRole("heading", { name: "Earlier failed attempts" })).toBeInTheDocument();
  expect(screen.getByText(/Paid later/)).toBeInTheDocument();
  expect(screen.getByText(/No failed payouts/)).toBeInTheDocument();
  expect(screen.getByText("₱0")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
});

it("counts only providers with an unresolved Xendit failure in the header", async () => {
  renderPage();
  await screen.findByText("Xendit Provider");
  // 1 owed provider with a 1,250 balance; nothing else is counted.
  expect(screen.getByText("provider not yet paid")).toBeInTheDocument();
  expect(screen.getAllByText("₱1,250").length).toBeGreaterThan(0);
});
