import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersPage } from "./UsersPage";
import { ToastProvider } from "@/components/ui/Toast";
import { useApp } from "@/context/AppContext";
import type { UserRow } from "@/lib/adapters";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseApp.mockReturnValue({
      users: [makeUser()],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
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
      users: [makeUser(), makeUser({ id: "u-2", name: "Jamie Kim", email: "jamie@example.com", isProvider: false, rolePlain: "Homeowner" })],
      setUserStatus,
      bulkSetUserStatus,
      sendPasswordReset,
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

  it("shows the correct empty state when a search matches nothing", async () => {
    const user = userEvent.setup();
    renderWithToast(<UsersPage />);
    await user.type(screen.getByPlaceholderText("Search by name, email…"), "nobody");
    expect(screen.getByText("No users match this search or filter.")).toBeInTheDocument();
  });
});
