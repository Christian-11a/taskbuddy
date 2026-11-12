import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderVerificationSection, revokeEffect, revokedNotice } from "./RevokeVerification";
import * as services from "@/lib/services";

vi.mock("@/lib/services", () => ({
  getVerificationHistory: vi.fn(),
  getIdentityDocuments: vi.fn(),
  revokeVerification: vi.fn(),
  canRevoke: (entry: { result: string }) => entry.result === "approved" || entry.result === "expired",
}));
const mocked = vi.mocked(services);

const history: services.VerificationHistoryEntry[] = [
  { id: "v:1", kind: "identity", providerId: "p1", providerName: "Ana Reyes", subject: "Identity (ID + selfie)", result: "approved", reason: null, decidedAt: "2026-10-15T08:00:00Z" },
  { id: "c:2", kind: "certificate", providerId: "p1", providerName: "Ana Reyes", subject: "Certificate: Plumbing - Plumbing NC II", result: "approved", reason: null, decidedAt: "2026-10-16T08:00:00Z", documentUrl: "https://files.example.com/cert.jpg?token=x" },
  { id: "c:3", kind: "certificate", providerId: "p1", providerName: "Ana Reyes", subject: "Certificate: Handyman - Carpentry NC II", result: "revoked", reason: "Fake number", decidedAt: "2026-11-01T08:00:00Z", documentUrl: null },
  { id: "c:4", kind: "certificate", providerId: "p1", providerName: "Ana Reyes", subject: "Certificate: Plumbing - Old", result: "rejected", reason: "Blurry", decidedAt: "2026-09-01T08:00:00Z" },
  { id: "c:5", kind: "certificate", providerId: "p2", providerName: "Ben Cruz", subject: "Certificate: Cleaning - NC II", result: "approved", reason: null, decidedAt: "2026-10-01T08:00:00Z" },
];

function renderSection(onChanged = vi.fn()) {
  render(<ProviderVerificationSection providerId="p1" providerName="Ana Reyes" onChanged={onChanged} />);
  return onChanged;
}

describe("ProviderVerificationSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getVerificationHistory.mockResolvedValue(history);
  });

  it("lists only this provider's approved and revoked items, with their files", async () => {
    renderSection();
    expect(await screen.findByText("Identity (ID + selfie)")).toBeInTheDocument();
    expect(screen.getByText("Certificate: Plumbing - Plumbing NC II")).toBeInTheDocument();
    expect(screen.getByText(/Revoked .* — Fake number/)).toBeInTheDocument();
    expect(screen.queryByText("Certificate: Plumbing - Old")).not.toBeInTheDocument();
    expect(screen.queryByText("Certificate: Cleaning - NC II")).not.toBeInTheDocument();
    // Files open in the in-page viewer, never as a link to another site.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View certificate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ID photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selfie" })).toBeInTheDocument();
    // A revoked item cannot be ticked again.
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("loads the ID photo and selfie on the first click and shows them in the viewer", async () => {
    mocked.getIdentityDocuments.mockResolvedValue(["https://files.example.com/id.jpg", "https://files.example.com/selfie.jpg"]);
    const user = userEvent.setup();
    renderSection();
    expect(mocked.getIdentityDocuments).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Selfie" }));
    const viewer = await screen.findByRole("dialog", { name: "Selfie" });
    expect(within(viewer).getByRole("img", { name: "Selfie" })).toHaveAttribute("src", "https://files.example.com/selfie.jpg");
    expect(viewer).toHaveTextContent("2 of 2");
    await user.click(within(viewer).getByRole("button", { name: "Previous image" }));
    expect(await screen.findByRole("img", { name: "ID photo" })).toHaveAttribute("src", "https://files.example.com/id.jpg");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocked.getIdentityDocuments).toHaveBeenCalledTimes(1);
  });

  it("opens the certificate in the viewer", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: "View certificate" }));
    const viewer = await screen.findByRole("dialog");
    expect(within(viewer).getByRole("img")).toHaveAttribute("src", "https://files.example.com/cert.jpg?token=x");
    await user.click(within(viewer).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("revokes the ticked items one by one with one reason, then reloads", async () => {
    mocked.revokeVerification
      .mockResolvedValueOnce({ verified: false, withdrawnProposals: 1 })
      .mockResolvedValueOnce({ verified: false, withdrawnProposals: 2 });
    const user = userEvent.setup();
    const onChanged = renderSection();
    await user.click(await screen.findByRole("checkbox", { name: "Select Identity (ID + selfie) to revoke" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Certificate: Plumbing - Plumbing NC II to revoke" }));

    const open = screen.getByRole("button", { name: "Revoke 2 selected items" });
    await user.type(screen.getByLabelText("Revoke reason (required)"), "short");
    expect(open).toBeDisabled();
    await user.type(screen.getByLabelText("Revoke reason (required)"), " — the ID photo was edited");
    await user.click(open);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Ana Reyes loses the Verified badge.");
    expect(dialog).toHaveTextContent("Reason: short — the ID photo was edited");
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(mocked.revokeVerification).toHaveBeenCalledTimes(2));
    expect(mocked.revokeVerification).toHaveBeenCalledWith(expect.objectContaining({ id: "v:1" }), "short — the ID photo was edited");
    expect(mocked.revokeVerification).toHaveBeenCalledWith(expect.objectContaining({ id: "c:2" }), "short — the ID photo was edited");
    expect(await screen.findByText("Revoked 2 items. The provider is no longer verified. 3 pending proposals were withdrawn.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    expect(mocked.getVerificationHistory).toHaveBeenCalledTimes(2);
  });

  it("names what failed and keeps going with the rest", async () => {
    mocked.revokeVerification
      .mockRejectedValueOnce(new Error("This was already revoked"))
      .mockResolvedValueOnce({ verified: true, withdrawnProposals: 0 });
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("checkbox", { name: "Select Identity (ID + selfie) to revoke" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Certificate: Plumbing - Plumbing NC II to revoke" }));
    await user.type(screen.getByLabelText("Revoke reason (required)"), "The documents do not match");
    await user.click(screen.getByRole("button", { name: "Revoke 2 selected items" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not revoked: Identity (ID + selfie): This was already revoked");
    expect(screen.getByRole("status")).toHaveTextContent("Revoked. The provider is still verified for their main service.");
  });
});

describe("revoke wording", () => {
  it("says what a certificate-only revoke does", () => {
    expect(revokeEffect([{ kind: "certificate" }], "Ana")).toMatch(/^Ana can no longer take jobs in this service unless another valid certificate covers it\./);
    expect(revokeEffect([{ kind: "certificate" }, { kind: "certificate" }], "Ana")).toMatch(/these services .* covers them/);
  });

  it("counts withdrawn proposals", () => {
    expect(revokedNotice(1, { verified: false, withdrawnProposals: 1 })).toBe("Revoked. The provider is no longer verified. 1 pending proposal was withdrawn.");
  });
});
