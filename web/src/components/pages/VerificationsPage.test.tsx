import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificationsPage } from "./VerificationsPage";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";

const refreshCounts = vi.fn().mockResolvedValue(undefined);
vi.mock("@/context/AppContext", () => ({
  useApp: () => ({ refreshCounts, lastUpdated: 0 }),
}));

vi.mock("@/lib/services", () => ({
  getVerificationCases: vi.fn(),
  decideVerificationCase: vi.fn(),
  getVerificationHistory: vi.fn(),
}));

const mocked = vi.mocked(services);

const credential = (over: Partial<NonNullable<services.VerificationCase["credential"]>> = {}) => ({
  id: "cr1",
  type: "tesda_nc" as const,
  title: "Plumbing NC II",
  issuer: "TESDA",
  number: "NC-123",
  serviceName: "Plumbing",
  issuedOn: "2025-01-10",
  expiresOn: "2099-01-01",
  documentUrl: "https://files.example.com/p1/cert.jpg?token=abc",
  ...over,
});

const newProvider: services.VerificationCase = {
  id: "v1",
  type: "New provider",
  providerId: "p1",
  name: "Ana Reyes",
  email: "ana@example.com",
  identity: "pending",
  submittedAt: "2026-10-01T08:00:00Z",
  verification: { id: "v1", method: "manual", documentType: "philsys", documents: ["https://files.example.com/id.jpg", "https://files.example.com/selfie.jpg"] },
  credential: credential(),
};
const stripeCase: services.VerificationCase = {
  id: "cr2",
  type: "New provider",
  providerId: "p2",
  name: "Ben Cruz",
  email: "ben@example.com",
  identity: "approved",
  submittedAt: "2026-10-02T08:00:00Z",
  verification: null,
  credential: credential({ id: "cr2", title: "Carpentry NC II", serviceName: "Handyman" }),
};
const renewal: services.VerificationCase = {
  ...stripeCase,
  id: "cr3",
  type: "Certificate renewal: Pedicure",
  name: "Cora Diaz",
  credential: credential({ id: "cr3", title: "Beauty Care NC II", serviceName: "Pedicure" }),
};
const extra: services.VerificationCase = {
  ...stripeCase,
  id: "cr4",
  type: "New service certificate: Cleaning",
  name: "Dan Lopez",
  credential: credential({ id: "cr4", title: "Housekeeping NC II", serviceName: "Cleaning" }),
};
const expired: services.VerificationCase = {
  ...stripeCase,
  id: "cr5",
  name: "Eve Tan",
  credential: credential({ id: "cr5", expiresOn: "2020-01-01" }),
};

function setCases(items: services.VerificationCase[]) {
  mocked.getVerificationCases.mockResolvedValue({ items, total: items.length });
}
function renderPage() {
  return render(
    <ToastProvider>
      <VerificationsPage />
    </ToastProvider>,
  );
}

describe("VerificationsPage", () => {
  beforeAll(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setCases([newProvider, stripeCase, renewal, extra]);
    mocked.decideVerificationCase.mockResolvedValue({ provider_id: "p1", identity: "approved", certificate: "approved", identity_verified: true, verified: true });
  });

  it("lists every case type and shows the first one in detail", async () => {
    renderPage();
    expect(await screen.findByText("Ben Cruz")).toBeInTheDocument();
    expect(screen.getAllByText("New provider").length).toBeGreaterThan(0);
    expect(screen.getByText("Certificate renewal: Pedicure")).toBeInTheDocument();
    expect(screen.getByText("New service certificate: Cleaning")).toBeInTheDocument();
    // First case: ID photo, selfie and certificate on one screen, with the service guidance.
    expect(screen.getByRole("link", { name: "Open ID photo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Selfie" })).toBeInTheDocument();
    expect(screen.getByAltText("Plumbing NC II document")).toBeInTheDocument();
    expect(screen.getByText(/look for TESDA Plumbing NC II/)).toBeInTheDocument();
    expect(screen.getByText("NC-123")).toBeInTheDocument();
  });

  it("shows a Stripe-approved identity with only the certificate to review", async () => {
    setCases([stripeCase]);
    renderPage();
    expect(await screen.findByText(/Identity already approved \(Stripe\)/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open ID photo" })).not.toBeInTheDocument();
    expect(screen.getByText(/Carpentry or Electrical Installation NC II/)).toBeInTheDocument();
  });

  it("approves with one call carrying both ids", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ben Cruz");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(mocked.decideVerificationCase).toHaveBeenCalledTimes(1);
    expect(mocked.decideVerificationCase).toHaveBeenCalledWith({ verificationId: "v1", credentialId: "cr1", decision: "approve" });
    expect(refreshCounts).toHaveBeenCalled();
  });

  it("sends only the credential id for a certificate-only case", async () => {
    setCases([stripeCase]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/Identity already approved/);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Approve" }));
    expect(mocked.decideVerificationCase).toHaveBeenCalledWith({ verificationId: undefined, credentialId: "cr2", decision: "approve" });
  });

  it("needs a failed part and a note before rejecting, then sends failed_parts", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ben Cruz");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Parts you leave unticked are approved/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Note to the provider"), "Certificate is blurry");
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText("21/500")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "Certificate" }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(mocked.decideVerificationCase).toHaveBeenCalledWith({
      verificationId: "v1",
      credentialId: "cr1",
      decision: "reject",
      failedParts: ["certificate"],
      note: "Certificate is blurry",
    });
  });

  it("offers only the certificate when identity is already approved", async () => {
    setCases([stripeCase]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/Identity already approved/);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const boxes = within(screen.getByRole("alertdialog")).getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName("Certificate");
  });

  it("disables approve for an expired certificate", async () => {
    setCases([expired]);
    renderPage();
    expect(await screen.findByText(/Expired on .* can.t be approved/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("shows the server message when a reject fails and keeps the dialog open", async () => {
    mocked.decideVerificationCase.mockRejectedValueOnce(new Error("This case was already decided."));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ben Cruz");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "Selfie" }));
    await user.type(within(dialog).getByLabelText("Note to the provider"), "Selfie does not match");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This case was already decided.");
  });

  it("shows an error state with a retry", async () => {
    mocked.getVerificationCases.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Couldn't load verifications")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    setCases([]);
    renderPage();
    expect(await screen.findByText("Queue clear")).toBeInTheDocument();
  });

  it("closes the dialog, toasts and reloads when the case was already decided (409)", async () => {
    mocked.decideVerificationCase.mockRejectedValueOnce(new ApiError(409, "This case was already decided."));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ben Cruz");
    const loadsBefore = mocked.getVerificationCases.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("This case was already decided.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocked.getVerificationCases.mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it("does the same for a reject that hits a 409", async () => {
    mocked.decideVerificationCase.mockRejectedValueOnce(new ApiError(409, "Already decided by another admin."));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ben Cruz");
    const loadsBefore = mocked.getVerificationCases.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "Certificate" }));
    await user.type(within(dialog).getByLabelText("Note to the provider"), "Blurry");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Already decided by another admin.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocked.getVerificationCases.mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  describe("history tab", () => {
    const history: services.VerificationHistoryEntry[] = [
      { id: "v:1", kind: "identity", providerId: "p1", providerName: "Ana Reyes", subject: "Identity (ID + selfie)", result: "approved", reason: null, decidedAt: "2026-10-15T08:00:00Z" },
      { id: "c:2", kind: "certificate", providerId: "p2", providerName: "Ben Cruz", subject: "Certificate: Handyman - Carpentry NC II", result: "rejected", reason: "Photo is blurry", decidedAt: "2026-10-10T08:00:00Z" },
      { id: "c:3", kind: "certificate", providerId: "p3", providerName: "Cara Lim", subject: "Certificate: Cleaning - Housekeeping NC II", result: "expired", reason: null, decidedAt: "2026-09-01T08:00:00Z" },
    ];

    async function openHistory() {
      mocked.getVerificationHistory.mockResolvedValue(history);
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Ben Cruz");
      await user.click(screen.getByRole("tab", { name: "History" }));
      await screen.findByText("Photo is blurry");
      return user;
    }

    it("lists approved and rejected rows, newest first, with the reason", async () => {
      await openHistory();
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toHaveTextContent("Ana Reyes");
      expect(rows[0]).toHaveTextContent("Approved");
      expect(rows[0]).not.toHaveTextContent("now expired");
      expect(rows[2]).toHaveTextContent("Cara Lim");
      expect(rows[2]).toHaveTextContent("Approved (now expired)");
      expect(rows[1]).toHaveTextContent("Ben Cruz");
      expect(rows[1]).toHaveTextContent("Rejected");
      expect(rows[1]).toHaveTextContent("Photo is blurry");
    });

    it("filters by provider name", async () => {
      const user = await openHistory();
      await user.type(screen.getByLabelText("Search by provider"), "ana");
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
      expect(screen.queryByText("Photo is blurry")).not.toBeInTheDocument();
    });

    it("has no approve or reject actions", async () => {
      await openHistory();
      expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    });
  });
});
