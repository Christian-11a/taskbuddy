import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { useApp } from "@/context/AppContext";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

function setApp(overrides: { login?: unknown; sessionEnded?: boolean }) {
  mockedUseApp.mockReturnValue({
    login: vi.fn(),
    sessionEnded: false,
    ...overrides,
  } as unknown as ReturnType<typeof useApp>);
}

const COOKIE_BLOCKED =
  "Your browser blocked the sign-in cookie. Open the console in a regular (non-private) browser window, allow cookies for this site, or ask for the proxy setup.";
const SESSION_ENDED = "Your session ended. Please sign in again.";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains a blocked sign-in cookie rather than accepting the sign-in", async () => {
    const login = vi.fn().mockResolvedValue({ ok: false, reason: "cookies_blocked" });
    setApp({ login });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Admin email"), "admin@taskbuddy.io");
    await user.type(screen.getByLabelText("Password"), "pw-123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(login).toHaveBeenCalledWith("admin@taskbuddy.io", "pw-123");
    expect(await screen.findByRole("alert")).toHaveTextContent(COOKIE_BLOCKED);
  });

  it("does not blame the password when the cookie was blocked", async () => {
    const login = vi.fn().mockResolvedValue({ ok: false, reason: "cookies_blocked" });
    setApp({ login });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("Admin email"), "admin@taskbuddy.io");
    await user.type(screen.getByLabelText("Password"), "pw-123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COOKIE_BLOCKED);
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("says the session ended when the console sent the admin back here", () => {
    setApp({ sessionEnded: true });
    render(<LoginPage />);

    expect(screen.getByRole("status")).toHaveTextContent(SESSION_ENDED);
  });

  it("shows no session notice on a first visit", () => {
    setApp({ sessionEnded: false });
    render(<LoginPage />);

    expect(screen.queryByText(SESSION_ENDED)).toBeNull();
  });
});
