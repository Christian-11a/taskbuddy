import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const setDarkMode = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/AppContext", () => ({
  useApp: () => ({
    users: [{ id: "u1", name: "Mark Santos", email: "mark@example.com" }],
    bookings: [],
    transactions: [],
    disputes: [],
    darkMode: false,
    setDarkMode,
    refreshData: vi.fn(),
    logout: vi.fn(),
  }),
}));
import { CommandPalette } from "./CommandPalette";

beforeAll(() => {
  // cmdk scrolls the active item into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
beforeEach(() => vi.clearAllMocks());

describe("CommandPalette", () => {
  it("jumps to a page", async () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "withdrawals");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/admin/withdrawals");
  });

  it("finds loaded users and opens the Users page", async () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "mark");
    await userEvent.click(await screen.findByText("Mark Santos"));
    expect(push).toHaveBeenCalledWith("/admin/users");
  });

  it("runs actions such as switching theme", async () => {
    render(<CommandPalette open onOpenChange={() => {}} />);
    await userEvent.type(screen.getByRole("combobox"), "dark mode");
    await userEvent.keyboard("{Enter}");
    expect(setDarkMode).toHaveBeenCalledWith(true);
  });
});
