import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearanceQueue } from "./ClearanceQueue";
import * as services from "@/lib/services";

vi.mock("@/lib/services", () => ({
  getPendingClearances: vi.fn(),
  decideClearance: vi.fn(),
  clearanceLabel: (t: string) => (t === "nbi" ? "NBI clearance" : "Police clearance"),
}));
const mocked = vi.mocked(services);

const row: services.AdminClearanceApiRow = {
  id: "k1",
  provider_id: "p1",
  clearance_type: "nbi",
  clearance_number: "A12345678",
  issued_on: "2026-11-01",
  expires_on: "2027-11-01",
  status: "pending",
  rejection_reason: null,
  reviewed_at: null,
  created_at: "2026-11-12T08:00:00Z",
  document_url: "https://files.example.com/nbi.jpg?token=x",
  profiles: { full_name: "Ana Reyes" },
};

describe("ClearanceQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getPendingClearances.mockResolvedValue([row]);
    mocked.decideClearance.mockResolvedValue(undefined);
  });

  it("lists pending clearances with the number and expiry, and opens the photo in the viewer", async () => {
    const user = userEvent.setup();
    render(<ClearanceQueue />);
    expect(await screen.findByText("Ana Reyes")).toBeInTheDocument();
    expect(screen.getByText(/NBI clearance · No\. A12345678/)).toHaveTextContent("Expires Nov 1, 2027");
    await user.click(screen.getByRole("button", { name: "View clearance" }));
    const viewer = await screen.findByRole("dialog");
    expect(within(viewer).getByRole("img")).toHaveAttribute("src", "https://files.example.com/nbi.jpg?token=x");
  });

  it("approves after confirming, then reloads", async () => {
    const user = userEvent.setup();
    render(<ClearanceQueue />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(mocked.decideClearance).toHaveBeenCalledWith("k1", true, ""));
    expect(await screen.findByText("NBI clearance for Ana Reyes approved.")).toBeInTheDocument();
    expect(mocked.getPendingClearances).toHaveBeenCalledTimes(2);
  });

  it("needs a reason to reject", async () => {
    const user = userEvent.setup();
    render(<ClearanceQueue />);
    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Rejection reason (required)"), "Name does not match the ID");
    await user.click(confirm);
    await waitFor(() => expect(mocked.decideClearance).toHaveBeenCalledWith("k1", false, "Name does not match the ID"));
  });

  it("says when nothing is waiting", async () => {
    mocked.getPendingClearances.mockResolvedValue([]);
    render(<ClearanceQueue />);
    expect(await screen.findByText("No clearances waiting for review.")).toBeInTheDocument();
  });
});
