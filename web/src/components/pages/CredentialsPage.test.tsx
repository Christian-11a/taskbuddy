import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialsPage } from "./CredentialsPage";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";

vi.mock("@/context/AppContext", () => ({
  useApp: () => ({ refreshCounts: vi.fn().mockResolvedValue(undefined), lastUpdated: 0 }),
}));

vi.mock("@/lib/services", () => ({
  getCredentials: vi.fn(),
  approveCredential: vi.fn(),
  rejectCredential: vi.fn(),
}));

const mocked = vi.mocked(services);

const base: services.Credential = {
  id: "c1",
  providerId: "p1",
  providerName: "Ana Reyes",
  type: "tesda_nc",
  title: "Plumbing NC II",
  issuer: "TESDA",
  number: "NC-123",
  categoryName: "Plumbing",
  issuedOn: "2025-01-10",
  expiresOn: null,
  status: "pending",
  rejectionReason: null,
  createdAt: "2026-10-01T08:00:00Z",
  documentUrl: "https://files.example.com/p1/cert.jpg?token=abc",
};
const pdf: services.Credential = {
  ...base,
  id: "c2",
  providerName: "Ben Cruz",
  type: "prc_license",
  title: "Master Electrician",
  documentUrl: "https://files.example.com/p2/licence.pdf?token=abc",
};

function renderPage() {
  return render(
    <ToastProvider>
      <CredentialsPage />
    </ToastProvider>,
  );
}

describe("CredentialsPage", () => {
  beforeAll(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getCredentials.mockResolvedValue({ items: [base, pdf], total: 2 });
    mocked.approveCredential.mockResolvedValue(undefined);
    mocked.rejectCredential.mockResolvedValue(undefined);
  });

  it("lists pending credentials with provider and type", async () => {
    renderPage();
    expect(await screen.findByText("Ben Cruz")).toBeInTheDocument();
    expect(screen.getAllByText("Ana Reyes").length).toBeGreaterThan(0);
    expect(screen.getByText("TESDA certificate · Plumbing NC II")).toBeInTheDocument();
    expect(screen.getByText("PRC licence · Master Electrician")).toBeInTheDocument();
    expect(mocked.getCredentials).toHaveBeenCalledWith({ status: "pending", page: 1, pageSize: 20 });
  });

  it("shows the image inline and a PDF as a new-tab link", async () => {
    const user = userEvent.setup();
    renderPage();
    const img = await screen.findByAltText("Plumbing NC II document");
    expect(img).toHaveAttribute("src", base.documentUrl);
    await user.click(screen.getByText("Ben Cruz"));
    const link = await screen.findByRole("link", { name: /Open PDF in a new tab/ });
    expect(link).toHaveAttribute("href", pdf.documentUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("offers a link refresh when the image fails to load", async () => {
    const user = userEvent.setup();
    renderPage();
    const img = await screen.findByAltText("Plumbing NC II document");
    fireEvent.error(img);
    await user.click(await screen.findByRole("button", { name: "Refresh link" }));
    expect(mocked.getCredentials).toHaveBeenCalledTimes(2);
  });

  it("approves after confirming", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByAltText("Plumbing NC II document");
    await user.click(screen.getByRole("button", { name: /^Approve$/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(mocked.approveCredential).toHaveBeenCalledWith("c1");
    expect(await screen.findByText("Credential approved.")).toBeInTheDocument();
  });

  it("will not reject without a reason, then sends it", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByAltText("Plumbing NC II document");
    await user.click(screen.getByRole("button", { name: /^Reject$/ }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject credential" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "Photo is blurry");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(mocked.rejectCredential).toHaveBeenCalledWith("c1", "Photo is blurry");
  });

  it("shows the API's message when a decision fails", async () => {
    const user = userEvent.setup();
    mocked.approveCredential.mockRejectedValueOnce(new ApiError(409, "Credential not found or already reviewed"));
    renderPage();
    await screen.findByAltText("Plumbing NC II document");
    await user.click(screen.getByRole("button", { name: /^Approve$/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Credential not found or already reviewed")).toBeInTheDocument();
  });

  it("disables Approve and explains why for a pending credential past its expiry", async () => {
    mocked.getCredentials.mockResolvedValueOnce({ items: [{ ...base, expiresOn: "2000-01-01" }], total: 1 });
    renderPage();
    await screen.findByAltText("Plumbing NC II document");
    expect(screen.getByRole("button", { name: /^Approve$/ })).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent("Expired on");
    expect(screen.getByRole("note")).toHaveTextContent("can't be approved");
    expect(screen.getByRole("button", { name: /^Reject$/ })).toBeEnabled();
  });

  it("keeps Approve enabled for a credential that expires today in Manila", async () => {
    const manilaToday = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    mocked.getCredentials.mockResolvedValueOnce({ items: [{ ...base, expiresOn: manilaToday }], total: 1 });
    renderPage();
    await screen.findByAltText("Plumbing NC II document");
    expect(screen.getByRole("button", { name: /^Approve$/ })).toBeEnabled();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows an empty state and a list error", async () => {
    mocked.getCredentials.mockResolvedValueOnce({ items: [], total: 0 });
    const { unmount } = renderPage();
    expect(await screen.findByText("No credentials waiting for review")).toBeInTheDocument();
    unmount();
    mocked.getCredentials.mockRejectedValueOnce(new ApiError(500, "Server exploded"));
    renderPage();
    expect(await screen.findByText("Couldn't load credentials")).toBeInTheDocument();
    expect(screen.getByText("Server exploded")).toBeInTheDocument();
  });
});
