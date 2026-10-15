import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformPage } from "./PlatformPage";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";

vi.mock("@/lib/services", () => ({
  getCategories: vi.fn().mockResolvedValue([]),
  getAdmins: vi.fn().mockResolvedValue([]),
  getCommission: vi.fn().mockResolvedValue({ rate: 0.15, updatedAt: "2026-10-01T00:00:00Z" }),
  broadcastNotification: vi.fn(),
  createAdmin: vi.fn(),
  createCategory: vi.fn(),
  revokeAdmin: vi.fn(),
  updateCategory: vi.fn(),
  updateCommission: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const TITLE = "Short announcement title";
const MESSAGE = "What should users know?";

/** Renders the page and opens its Broadcast tab once the platform controls have loaded. */
async function openBroadcast(user: ReturnType<typeof userEvent.setup>) {
  render(<ToastProvider><PlatformPage /></ToastProvider>);
  await user.click(await screen.findByRole("button", { name: /^Broadcast/ }));
  return screen.getByPlaceholderText(TITLE);
}

async function fillAndSend(user: ReturnType<typeof userEvent.setup>, title: string, message: string) {
  await user.type(screen.getByPlaceholderText(TITLE), title);
  await user.type(screen.getByPlaceholderText(MESSAGE), message);
  await user.click(screen.getByRole("button", { name: /Send announcement/ }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Send announcement" }));
}

describe("broadcast announcement", () => {
  it("counts the title and message live against their limits", async () => {
    const user = userEvent.setup();
    await openBroadcast(user);
    expect(screen.getByText("0/120")).toBeInTheDocument();
    expect(screen.getByText("0/500")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(TITLE), "Hello");
    await user.type(screen.getByPlaceholderText(MESSAGE), "Hi there");
    expect(screen.getByText("5/120")).toBeInTheDocument();
    expect(screen.getByText("8/500")).toBeInTheDocument();
  });

  it("says how many inboxes received it, and that push is best-effort and email is not sent", async () => {
    const user = userEvent.setup();
    vi.mocked(services.broadcastNotification).mockResolvedValueOnce({ sent: 12, failed: 0, audience: "all" });
    await openBroadcast(user);
    await fillAndSend(user, "Maintenance", "Tonight at 22:00.");

    expect(services.broadcastNotification).toHaveBeenCalledWith("Maintenance", "Tonight at 22:00.", "all");
    const result = await screen.findByText("Added to 12 inboxes.");
    expect(result.parentElement).toHaveTextContent("Push delivery is best-effort");
    expect(result.parentElement).toHaveTextContent("email is not sent");
    // The form is cleared once the send lands.
    expect(screen.getByPlaceholderText(TITLE)).toHaveValue("");
  });

  it("uses the singular for a single inbox and reports partial failures", async () => {
    const user = userEvent.setup();
    vi.mocked(services.broadcastNotification).mockResolvedValueOnce({ sent: 10, failed: 2, audience: "providers" });
    await openBroadcast(user);
    await fillAndSend(user, "Providers", "Please update your profile.");
    expect(await screen.findByText("Added to 10 inboxes. 2 could not be added.")).toBeInTheDocument();
  });

  it("says so when the audience matched nobody", async () => {
    const user = userEvent.setup();
    vi.mocked(services.broadcastNotification).mockResolvedValueOnce({ sent: 0, failed: 0, audience: "clients" });
    await openBroadcast(user);
    await fillAndSend(user, "Nobody", "Is anyone there?");
    expect(await screen.findByText("No active accounts are in that audience, so nothing was added.")).toBeInTheDocument();
  });

  it("shows the real error when the send fails", async () => {
    const user = userEvent.setup();
    vi.mocked(services.broadcastNotification).mockRejectedValueOnce(new ApiError(503, "Notifications are paused for maintenance."));
    await openBroadcast(user);
    await fillAndSend(user, "Hello", "World");
    expect(await screen.findByText("Notifications are paused for maintenance.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(TITLE)).toHaveValue("Hello");
  });
});
