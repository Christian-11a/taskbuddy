import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "./SettingsPage";
import { useApp } from "@/context/AppContext";

vi.mock("@/context/AppContext", () => ({
  useApp: vi.fn(),
}));

const mockedUseApp = vi.mocked(useApp);

function makeAppState() {
  return {
    adminProfile: { id: "admin-1", name: "Morgan Lee", email: "morgan@example.com" },
    updateDisplayName: vi.fn().mockResolvedValue(true),
    changePassword: vi.fn().mockResolvedValue(true),
    darkMode: false,
    setDarkMode: vi.fn(),
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    settings: {
      emailAlerts: true,
      disputeNotify: true,
      dailySummary: false,
      newUserNotify: false,
      activityBadge: true,
      autoPurge: false,
      anonymizeExports: true,
      auditLog: true,
      platformName: "",
      supportEmail: "not-an-email",
    },
    updateSettings: vi.fn(),
    maintenanceMode: false,
    setMaintenanceMode: vi.fn().mockResolvedValue(true),
  };
}

describe("SettingsPage", () => {
  let app: ReturnType<typeof makeAppState>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeAppState();
    mockedUseApp.mockReturnValue(app as unknown as ReturnType<typeof useApp>);
  });

  it("marks local-only Notifications, Platform, and Data & Privacy options unavailable and disables their controls", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Not available yet. Notification settings are not connected to a delivery service.")).toBeInTheDocument();
    expect(screen.getByText("Not available yet. These values are not connected to platform behavior.")).toBeInTheDocument();
    expect(screen.getByText("Not available yet. These options do not change data handling or reports.")).toBeInTheDocument();

    for (const label of [
      "Email alerts for new verifications",
      "Notify on disputed transactions",
      "Daily summary report",
      "New user registrations",
      "Auto-purge inactive accounts (1 year)",
      "Report anonymization",
      "Audit log retention (90 days)",
    ]) {
      expect(screen.getByRole("switch", { name: label })).toBeDisabled();
    }
    expect(screen.getByRole("textbox", { name: /Platform name/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Support email/ })).toBeDisabled();
    expect(screen.queryByText("Sent every morning at 8 AM")).not.toBeInTheDocument();
    expect(screen.queryByText("Everything else on this page saves as you change it.")).not.toBeInTheDocument();
  });

  it("saves Account changes without validating unavailable Platform values", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Morgan L.");
    await user.click(screen.getByRole("button", { name: "Save account changes" }));

    expect(app.updateDisplayName).toHaveBeenCalledWith("Morgan L.");
    expect(await screen.findByText("Account changes saved.")).toBeInTheDocument();
  });

  it("keeps Appearance and the activity badge interactive", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("radio", { name: /dark/i }));
    await user.click(screen.getByRole("switch", { name: "Show activity badge" }));

    expect(app.setDarkMode).toHaveBeenCalledWith(true);
    expect(app.updateSettings).toHaveBeenCalledWith({ activityBadge: false });
  });

  it("keeps Maintenance connected to the backend action", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("switch", { name: "Maintenance Mode" }));
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    expect(app.setMaintenanceMode).toHaveBeenCalledWith(true);
  });
});
