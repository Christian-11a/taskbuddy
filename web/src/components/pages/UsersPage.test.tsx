import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersPage, bulkMessage } from "./UsersPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import { downloadCsv } from "@/lib/export/csv";
import type { UserRow } from "@/lib/adapters";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("@/lib/export/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/csv")>()),
  downloadCsv: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

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
    verification: "Verified",
    verificationClass: "badge-approved",
    suspensionReason: "—",
    ...overrides,
  };
}

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("UsersPage — suspend flow", () => {
  const setUserStatus = vi.fn();
  const bulkSetUserStatus = vi.fn();
  const sendPasswordReset = vi.fn();
  const refreshUsers = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockedUseApp.mockReturnValue({
      users: [makeUser()],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
      refreshUsers,
      loading: false,
    } as unknown as ReturnType<typeof useApp>);
  });

  async function openSuspendPrompt(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByText("Morgan Lee"));
    await user.click(await screen.findByRole("button", { name: /suspend account/i }));
  }

  it("keeps the confirm button disabled until a reason is entered (backend requires one)", async () => {
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);
    await openSuspendPrompt(user);

    const confirmBtn = await screen.findByRole("button", { name: /confirm suspend/i });
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Reason (required)"), "Repeated no-shows");
    expect(confirmBtn).toBeEnabled();
  });

  it("shows an error toast instead of failing silently when the suspend request rejects", async () => {
    setUserStatus.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);
    await openSuspendPrompt(user);

    await user.type(screen.getByPlaceholderText("Reason (required)"), "Repeated no-shows");
    await user.click(screen.getByRole("button", { name: /confirm suspend/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not suspend. Please try again.");
    expect(setUserStatus).toHaveBeenCalledTimes(1);
  });

  it("reports a successful suspend separately from a failed user-list refresh", async () => {
    setUserStatus.mockResolvedValueOnce({ refreshFailed: true });
    refreshUsers.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);
    await openSuspendPrompt(user);

    await user.type(screen.getByPlaceholderText("Reason (required)"), "Repeated no-shows");
    await user.click(screen.getByRole("button", { name: /confirm suspend/i }));

    expect(await screen.findByText("The user list could not be refreshed after that action.")).toBeInTheDocument();
    expect(await screen.findByText("User suspended.")).toBeInTheDocument();
    expect(screen.queryByText("Could not suspend. Please try again.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh users/i })).toBeInTheDocument();
    await user.click(screen.getByText("Morgan Lee"));
    expect(screen.getByRole("button", { name: /suspend account/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /refresh users/i }));
    expect(refreshUsers).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("The user list could not be refreshed after that action.")).not.toBeInTheDocument();
  });

  it("disables the confirm button while the request is in flight, so a slow network can't double-submit", async () => {
    let resolveRequest!: () => void;
    setUserStatus.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);
    await openSuspendPrompt(user);

    await user.type(screen.getByPlaceholderText("Reason (required)"), "Repeated no-shows");
    const confirmBtn = screen.getByRole("button", { name: /confirm suspend/i });
    await user.click(confirmBtn);

    expect(await screen.findByRole("button", { name: /suspending…/i })).toBeDisabled();
    expect(setUserStatus).toHaveBeenCalledTimes(1);

    resolveRequest();
  });

  it("filters the table by search text", async () => {
    mockedUseApp.mockReturnValue({
      users: [makeUser(), makeUser({ id: "u-2", name: "Jamie Kim", email: "jamie@example.com", isProvider: false, rolePlain: "Client" })],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
      refreshUsers,
      loading: false,
    } as unknown as ReturnType<typeof useApp>);
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);

    expect(screen.getByText("Morgan Lee")).toBeInTheDocument();
    expect(screen.getByText("Jamie Kim")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search by name, email…"), "jamie");
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument();
    expect(screen.getByText("Jamie Kim")).toBeInTheDocument();
  });

  it("filters to new users by join date", async () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    mockedUseApp.mockReturnValue({
      users: [
        makeUser({ createdAt: "2024-03-10" }),
        makeUser({ id: "u-2", name: "Nina New", email: "nina@example.com", createdAt: recent }),
      ],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
      refreshUsers,
      loading: false,
    } as unknown as ReturnType<typeof useApp>);
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);

    await user.selectOptions(screen.getByLabelText("Filter users by join date"), "7d");
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument();
    expect(screen.getByText("Nina New")).toBeInTheDocument();
  });

  it("filters providers by verification status", async () => {
    mockedUseApp.mockReturnValue({
      users: [
        makeUser(),
        makeUser({ id: "u-3", name: "Paula Pending", email: "paula@example.com", verification: "Pending review", verificationClass: "badge-pending" }),
      ],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
      refreshUsers,
      loading: false,
    } as unknown as ReturnType<typeof useApp>);
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);

    await user.selectOptions(screen.getByLabelText("Filter providers by verification status"), "Pending review");
    expect(screen.queryByText("Morgan Lee")).not.toBeInTheDocument();
    expect(screen.getByText("Paula Pending")).toBeInTheDocument();
  });

  it("shows the correct empty state when a search matches nothing", async () => {
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);
    await user.type(screen.getByPlaceholderText("Search by name, email…"), "nobody");
    expect(screen.getByText("No users match this search or filter.")).toBeInTheDocument();
  });

  it("keeps only failed accounts selected, shows their names and errors, and retries no successes", async () => {
    const users = [
      makeUser(),
      makeUser({ id: "u-2", name: "Jamie Kim", email: "jamie@example.com" }),
      makeUser({ id: "u-3", name: "Paula Pending", email: "paula@example.com" }),
    ];
    mockedUseApp.mockReturnValue({
      users,
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
      refreshUsers,
      loading: false,
    } as unknown as ReturnType<typeof useApp>);
    bulkSetUserStatus
      .mockResolvedValueOnce({
        succeeded: 2,
        failed: 1,
        errors: [{ id: "u-2", status: 429, message: "Too many requests — try again in 30s." }],
      })
      .mockResolvedValueOnce({ succeeded: 1, failed: 0, errors: [] });
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);

    await user.click(screen.getByRole("checkbox", { name: "Select all 3 matching users" }));
    await user.click(screen.getByRole("button", { name: "Reinstate" }));

    expect(await screen.findByText("Some user actions failed")).toBeInTheDocument();
    const failurePanel = screen.getByRole("region", { name: "Some user actions failed" });
    expect(within(failurePanel).getByText("Jamie Kim")).toBeInTheDocument();
    expect(within(failurePanel).getByText(/Too many requests — try again in 30s\./)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Jamie Kim" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Morgan Lee" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Paula Pending" })).not.toBeChecked();
    expect(within(failurePanel).getByText(/jamie@example\.com · ID u-2/)).toBeInTheDocument();
    expect(bulkSetUserStatus).toHaveBeenNthCalledWith(1, ["u-1", "u-2", "u-3"], "Active");

    await user.click(screen.getByRole("button", { name: "Reinstate" }));
    await screen.findByText("Reinstated 1 user.");
    expect(bulkSetUserStatus).toHaveBeenNthCalledWith(2, ["u-2"], "Active");
    expect(screen.queryByText("Some user actions failed")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Jamie Kim" })).not.toBeChecked();
  });

  it("shows a bulk action success with a separate refresh warning and clears it after refresh", async () => {
    mockedUseApp.mockReturnValue({
      users: [makeUser()],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
      refreshUsers,
      loading: false,
    } as unknown as ReturnType<typeof useApp>);
    bulkSetUserStatus.mockResolvedValueOnce({ succeeded: 1, failed: 0, errors: [], refreshFailed: true });
    refreshUsers.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);

    await user.click(screen.getByRole("checkbox", { name: "Select all 1 matching users" }));
    await user.click(screen.getByRole("button", { name: "Reinstate" }));

    expect(await screen.findByText("The user list could not be refreshed after that action.")).toBeInTheDocument();
    expect(await screen.findByText("Reinstated 1 user.")).toBeInTheDocument();
    expect(screen.queryByText("Could not reinstate the selected users. Please try again.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh users/i }));
    expect(refreshUsers).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("The user list could not be refreshed after that action.")).not.toBeInTheDocument();
  });

  it("requires a list refresh and deselects accounts when a bulk request outcome is unconfirmed", async () => {
    mockedUseApp.mockReturnValue({
      users: [makeUser()],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
      refreshUsers,
      loading: false,
    } as unknown as ReturnType<typeof useApp>);
    bulkSetUserStatus.mockResolvedValueOnce({
      succeeded: 0,
      failed: 1,
      errors: [{ id: "u-1", status: 0, message: "Failed to fetch" }],
    });
    refreshUsers.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);

    await user.click(screen.getByRole("checkbox", { name: "Select all 1 matching users" }));
    await user.click(screen.getByRole("button", { name: "Reinstate" }));

    expect(await screen.findByText("Some account outcomes are unconfirmed.")).toBeInTheDocument();
    expect(screen.getByText(/morgan@example\.com · ID u-1/)).toBeInTheDocument();
    expect(screen.getByText(/the action may already have succeeded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export 1 selected" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh users/i }));
    expect(await screen.findByText(/check the refreshed account status before selecting it again/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Morgan Lee" })).not.toBeChecked();
    expect(screen.queryByText("Some account outcomes are unconfirmed.")).not.toBeInTheDocument();
  });
});

describe("bulkMessage", () => {
  it("says so plainly when everything worked", () => {
    expect(bulkMessage("Suspended", { succeeded: 3, failed: 0, errors: [] })).toBe("Suspended 3 users.");
  });

  it("reports the reasons the API actually gave, grouped", () => {
    const tooMany = { status: 429, message: "Too many requests — try again in 30s." };
    expect(
      bulkMessage("Suspended", {
        succeeded: 2,
        failed: 3,
        errors: [
          { id: "a", ...tooMany },
          { id: "b", ...tooMany },
          { id: "c", status: 0, message: "Failed to fetch" },
        ],
      }),
    ).toBe("Suspended 2 of 5. 3 failed: Too many requests — try again in 30s. (×2); Failed to fetch.");
  });

  it("summarises beyond the first two distinct reasons", () => {
    const errors = ["one", "two", "three", "four"].map((message, i) => ({ id: `u${i}`, status: 400, message }));
    expect(bulkMessage("Reinstated", { succeeded: 0, failed: 4, errors })).toBe(
      "Reinstated 0 of 4. 4 failed: one; two; +2 other reasons.",
    );
  });
});

describe("UsersPage — CSV export anonymization", () => {
  function setup(anonymizeExports: boolean) {
    mockedUseApp.mockReturnValue({
      users: [makeUser()],
      setUserStatus: vi.fn(),
      bulkSetUserStatus: vi.fn(),
      sendPasswordReset: vi.fn(),
      refreshUsers: vi.fn(),
      loading: false,
      settings: { anonymizeExports },
    } as unknown as ReturnType<typeof useApp>);
  }

  async function exportCsv() {
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);
    await user.click(screen.getByRole("button", { name: /export csv/i }));
    await user.click(await screen.findByRole("button", { name: "Export" }));
    return vi.mocked(downloadCsv).mock.calls[0][1];
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("masks name, email and phone but keeps role, city and counts when anonymization is on", async () => {
    setup(true);
    const csv = await exportCsv();

    expect(csv).toContain("M. L.,m***@example.com,***01,Provider,Plumbing,Quezon City");
    expect(csv).not.toContain("Morgan");
    expect(csv).not.toContain("morgan@example.com");
    expect(csv).not.toContain("0917");
  });

  it("exports full values when anonymization is off", async () => {
    setup(false);
    const csv = await exportCsv();

    expect(csv).toContain("Morgan Lee,morgan@example.com,0917 555 0101,Provider");
  });
});
