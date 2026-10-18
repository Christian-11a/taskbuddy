import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityLogPage } from "./ActivityLogPage";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";
import type { ActivityEvent } from "@/lib/domain";

vi.mock("@/lib/services", () => ({ searchActivity: vi.fn() }));

// The page reloads on the shared live timestamp (useLiveTick) from AppContext.
const liveState = vi.hoisted(() => ({ lastUpdated: null as number | null }));
vi.mock("@/context/AppContext", () => ({
  useApp: () => ({ lastUpdated: liveState.lastUpdated }),
}));

const mockedSearchActivity = vi.mocked(services.searchActivity);

const event: ActivityEvent = { id: 1, time: "2h ago", text: "Aircon cleaning was posted", type: "tx" };

describe("ActivityLogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveState.lastUpdated = null;
    mockedSearchActivity.mockReset();
    mockedSearchActivity.mockResolvedValue({ items: [event], total: 1 });
  });

  it("lists the loaded events", async () => {
    render(<ActivityLogPage />);
    expect(await screen.findByText("Aircon cleaning was posted")).toBeInTheDocument();
  });

  it("shows an error state, not 'No platform activity yet.', when the first load fails", async () => {
    mockedSearchActivity.mockRejectedValue(new Error("down"));
    render(<ActivityLogPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load platform activity.");
    expect(screen.queryByText("No platform activity yet.")).not.toBeInTheDocument();
  });

  it("keeps the last good events and offers Retry when a refresh fails", async () => {
    const user = userEvent.setup();
    render(<ActivityLogPage />);
    expect(await screen.findByText("Aircon cleaning was posted")).toBeInTheDocument();

    mockedSearchActivity.mockRejectedValueOnce(new Error("down"));
    await user.type(screen.getByLabelText("Search activity by job title"), "x");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't refresh platform activity.");
    expect(screen.getByText("Aircon cleaning was posted")).toBeInTheDocument();

    mockedSearchActivity.mockResolvedValueOnce({ items: [event], total: 1 });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("caps the search box at 100 characters and shows the API's 400 message under it", async () => {
    const user = userEvent.setup();
    render(<ActivityLogPage />);
    const search = await screen.findByLabelText("Search activity by job title");
    expect(search).toHaveAttribute("maxLength", "100");

    mockedSearchActivity.mockRejectedValueOnce(new ApiError(400, "Search is too long."));
    await user.type(search, "x");

    expect(await screen.findByText("Search is too long.")).toHaveAttribute("role", "alert");
    expect(search).toHaveAccessibleDescription("Search is too long.");
    expect(screen.queryByText("Couldn't refresh platform activity.")).not.toBeInTheDocument();
  });

  it("reloads when the live console refresh lands", async () => {
    const { rerender } = render(<ActivityLogPage />);
    expect(await screen.findByText("Aircon cleaning was posted")).toBeInTheDocument();
    expect(mockedSearchActivity).toHaveBeenCalledTimes(1);

    liveState.lastUpdated = Date.now();
    rerender(<ActivityLogPage />);
    await waitFor(() => expect(mockedSearchActivity).toHaveBeenCalledTimes(2));
  });
});
