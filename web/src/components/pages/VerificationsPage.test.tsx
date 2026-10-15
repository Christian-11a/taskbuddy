import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerificationsPage } from "./VerificationsPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import type { VerificationRow } from "@/lib/adapters";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

function makeRow(overrides: Partial<VerificationRow> = {}): VerificationRow {
  return {
    id: "v-1",
    initials: "RL",
    name: "Rico Lim",
    email: "rico@example.com",
    date: "Oct 14, 2026",
    status: "pending",
    documents: [],
    documentType: "PhilSys (National ID)",
    method: "manual",
    ...overrides,
  };
}

function renderPage(rows: VerificationRow[]) {
  vi.mocked(useApp).mockReturnValue({
    verifications: rows,
    approveVerification: vi.fn(),
    rejectVerification: vi.fn(),
    loading: false,
    settings: { anonymizeExports: false },
  } as unknown as ReturnType<typeof useApp>);
  return render(
    <ToastProvider>
      <VerificationsPage />
    </ToastProvider>,
  );
}

describe("VerificationsPage — verification method", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains a Stripe Identity check that has no documents to review", () => {
    renderPage([makeRow({ method: "stripe_identity", documents: [] })]);

    // Shown in the list row and in the detail header.
    expect(screen.getAllByText("Stripe Identity").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Checked by Stripe Identity — no documents to review")).toBeInTheDocument();
    expect(screen.queryByText("No documents available")).not.toBeInTheDocument();
    // Approve and Reject stay available for the admin to finish the review.
    expect(screen.getByRole("button", { name: "Approve provider" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("tells the admin Stripe decides automatically, and hides the ID type for Stripe rows", () => {
    renderPage([makeRow({ method: "stripe_identity", documents: [] })]);

    expect(
      screen.getByText("Stripe checks this ID and decides automatically. Review it by hand only if no result arrives."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Check that the name matches the account/)).not.toBeInTheDocument();
    expect(screen.queryByText("ID type")).not.toBeInTheDocument();
  });

  it("shows only 'Checked by Stripe Identity' in the queue row for a Stripe check", () => {
    renderPage([makeRow({ method: "stripe_identity", documentType: "PhilSys (National ID)", documents: [] })]);

    expect(screen.getByText("Checked by Stripe Identity")).toBeInTheDocument();
    expect(screen.queryByText("PhilSys (National ID) · 0 files")).not.toBeInTheDocument();
  });

  it("keeps the manual review tip and ID type for a manual submission", () => {
    renderPage([makeRow({ method: "manual", documentType: "PhilSys (National ID)" })]);

    expect(screen.getByText(/Check that the name matches the account and the selfie matches the ID photo/)).toBeInTheDocument();
    expect(screen.queryByText(/Stripe checks this ID/)).not.toBeInTheDocument();
    expect(screen.getByText("ID type")).toBeInTheDocument();
  });

  it("labels a manual submission as ID and selfie review", () => {
    renderPage([
      makeRow({
        method: "manual",
        documents: [
          { label: "Government ID", url: "https://example.com/id.jpg" },
          { label: "Selfie", url: "https://example.com/selfie.jpg" },
        ],
      }),
    ]);

    expect(screen.getAllByText("ID + selfie review").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Stripe Identity")).not.toBeInTheDocument();
    expect(screen.queryByText("Checked by Stripe Identity — no documents to review")).not.toBeInTheDocument();
  });
});
