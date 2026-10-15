import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  IDENTITY_CONFLICT_MESSAGE,
  JobCapacityCard,
  NOT_AVAILABLE_MESSAGE,
  PlatformIdentityCard,
  parseJobCapacityForm,
} from "./PlatformSettingsCards";
import { ToastProvider } from "@/components/ui/Toast";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";

vi.mock("@/lib/services", () => ({
  getPlatformIdentity: vi.fn(),
  updatePlatformIdentity: vi.fn(),
  getJobCapacity: vi.fn(),
  updateJobCapacity: vi.fn(),
}));

const identity = { platformName: "TaskBuddy", supportEmail: "help@taskbuddy.test", identityVersion: 4 };
const limits = {
  clientActiveMax: 3, providerActiveMax: 3, providerPendingMax: 3,
  dailyHoursMax: 8, restHours: 1, travelKmh: 20,
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderIdentity() {
  return render(<ToastProvider><PlatformIdentityCard /></ToastProvider>);
}

function renderLimits() {
  return render(<ToastProvider><JobCapacityCard /></ToastProvider>);
}

/** The inline alert holding `text`. Toasts also use role="alert", so the message is found first. */
async function inlineAlert(text: string | RegExp): Promise<HTMLElement> {
  const alert = (await screen.findByText(text)).closest<HTMLElement>('[role="alert"]');
  if (!alert) throw new Error(`No inline alert holds ${String(text)}`);
  return alert;
}

describe("PlatformIdentityCard", () => {
  it("loads the current name and support email", async () => {
    vi.mocked(services.getPlatformIdentity).mockResolvedValue(identity);
    renderIdentity();
    expect(await screen.findByLabelText("Platform name")).toHaveValue("TaskBuddy");
    expect(screen.getByLabelText("Support email")).toHaveValue("help@taskbuddy.test");
    expect(screen.getByRole("button", { name: "Save platform identity" })).toBeDisabled();
  });

  it("shows 'not available yet' with every control disabled, and no error, when the update is not deployed", async () => {
    vi.mocked(services.getPlatformIdentity).mockResolvedValue(null);
    renderIdentity();
    expect(await screen.findByText(NOT_AVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText("Platform name")).toBeDisabled();
    expect(screen.getByLabelText("Support email")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save platform identity" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers a retry, not a fake form, when the read fails for another reason", async () => {
    vi.mocked(services.getPlatformIdentity).mockRejectedValueOnce(new ApiError(500, "Database unavailable"));
    renderIdentity();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load these settings.");
    vi.mocked(services.getPlatformIdentity).mockResolvedValueOnce(identity);
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Platform name")).toHaveValue("TaskBuddy");
  });

  it("saves only after confirmation, sending the version it read", async () => {
    vi.mocked(services.getPlatformIdentity).mockResolvedValue(identity);
    vi.mocked(services.updatePlatformIdentity).mockResolvedValue({ ...identity, platformName: "TaskBuddy PH", identityVersion: 5 });
    const user = userEvent.setup();
    renderIdentity();
    const nameInput = await screen.findByLabelText("Platform name");
    await user.clear(nameInput);
    await user.type(nameInput, "TaskBuddy PH");
    await user.click(screen.getByRole("button", { name: "Save platform identity" }));

    expect(services.updatePlatformIdentity).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Save identity" }));

    await waitFor(() => expect(services.updatePlatformIdentity).toHaveBeenCalledWith({
      platformName: "TaskBuddy PH",
      supportEmail: "help@taskbuddy.test",
      expectedVersion: 4,
    }));
    expect(await screen.findByText("Platform identity saved.")).toBeInTheDocument();
    expect(screen.getByText("Version 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save platform identity" })).toBeDisabled();
  });

  it("validates the name and the email before a save can be sent", async () => {
    vi.mocked(services.getPlatformIdentity).mockResolvedValue(identity);
    const user = userEvent.setup();
    renderIdentity();
    const nameInput = await screen.findByLabelText("Platform name");
    const emailInput = screen.getByLabelText("Support email");

    await user.clear(nameInput);
    expect(screen.getByText("Required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save platform identity" })).toBeDisabled();

    await user.type(nameInput, "TaskBuddy");
    await user.clear(emailInput);
    await user.type(emailInput, "not-an-email");
    expect(screen.getByText("Enter a valid email address, or leave it empty.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save platform identity" })).toBeDisabled();
    expect(services.updatePlatformIdentity).not.toHaveBeenCalled();
  });

  it("stops on a 409 and asks for a reload, never overwriting; reload shows the other admin's values", async () => {
    vi.mocked(services.getPlatformIdentity)
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce({ platformName: "Someone Else Name", supportEmail: null, identityVersion: 5 });
    vi.mocked(services.updatePlatformIdentity).mockRejectedValueOnce(new ApiError(409, IDENTITY_CONFLICT_MESSAGE));
    const user = userEvent.setup();
    renderIdentity();
    const nameInput = await screen.findByLabelText("Platform name");
    await user.clear(nameInput);
    await user.type(nameInput, "My Name");
    await user.click(screen.getByRole("button", { name: "Save platform identity" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save identity" }));

    const alert = await inlineAlert(IDENTITY_CONFLICT_MESSAGE);
    expect(alert).toHaveTextContent("Platform settings changed; reload and try again");
    expect(screen.getByRole("button", { name: "Save platform identity" })).toBeDisabled();
    expect(services.updatePlatformIdentity).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole("button", { name: "Reload" }));
    expect(await screen.findByDisplayValue("Someone Else Name")).toBeInTheDocument();
    expect(screen.queryByText(IDENTITY_CONFLICT_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save platform identity" })).toBeDisabled();
    expect(services.updatePlatformIdentity).toHaveBeenCalledTimes(1);
  });

  it("keeps the edits and shows the API's reason when a save is refused", async () => {
    vi.mocked(services.getPlatformIdentity).mockResolvedValue(identity);
    vi.mocked(services.updatePlatformIdentity).mockRejectedValueOnce(new ApiError(403, "Admin access required"));
    const user = userEvent.setup();
    renderIdentity();
    const nameInput = await screen.findByLabelText("Platform name");
    await user.clear(nameInput);
    await user.type(nameInput, "Kept Name");
    await user.click(screen.getByRole("button", { name: "Save platform identity" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save identity" }));

    expect(await inlineAlert("Admin access required")).toBeInTheDocument();
    expect(screen.getByLabelText("Platform name")).toHaveValue("Kept Name");
    expect(screen.getByText("Platform identity not saved.", { exact: false })).toBeInTheDocument();
  });
});

describe("JobCapacityCard", () => {
  it("shows each limit with what it does", async () => {
    vi.mocked(services.getJobCapacity).mockResolvedValue(limits);
    renderLimits();
    expect(await screen.findByLabelText(/Client active jobs/)).toHaveValue(3);
    expect(screen.getByLabelText(/Travel speed/)).toHaveValue(20);
    expect(screen.getByText(/Posting another job past this is refused/)).toBeInTheDocument();
    expect(screen.getByText(/Booking past this is refused/)).toBeInTheDocument();
  });

  it("shows 'not available yet' with every control disabled when the route or table is missing", async () => {
    vi.mocked(services.getJobCapacity).mockResolvedValue(null);
    renderLimits();
    expect(await screen.findByText(NOT_AVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByLabelText(/Client active jobs/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save job limits" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses values the server would refuse, and says why on the field", async () => {
    vi.mocked(services.getJobCapacity).mockResolvedValue(limits);
    const user = userEvent.setup();
    renderLimits();
    const client = await screen.findByLabelText(/Client active jobs/);

    await user.clear(client);
    await user.type(client, "0");
    expect(screen.getByText("Enter a whole number, 1 or more.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save job limits" })).toBeDisabled();

    await user.clear(client);
    await user.type(client, "2");
    expect(screen.queryByText("Enter a whole number, 1 or more.")).not.toBeInTheDocument();

    const daily = screen.getByLabelText(/Daily hours per provider/);
    await user.clear(daily);
    await user.type(daily, "0");
    expect(screen.getByText("Enter a number greater than 0.")).toBeInTheDocument();

    // Rest may be zero; a fraction is fine for hours.
    const rest = screen.getByLabelText(/Rest between jobs/);
    await user.clear(rest);
    await user.type(rest, "0");
    expect(screen.queryByText("Enter a number, 0 or more.")).not.toBeInTheDocument();
    expect(services.updateJobCapacity).not.toHaveBeenCalled();
  });

  it("saves after confirmation and shows the saved values", async () => {
    vi.mocked(services.getJobCapacity).mockResolvedValue(limits);
    vi.mocked(services.updateJobCapacity).mockResolvedValue({ ...limits, clientActiveMax: 5 });
    const user = userEvent.setup();
    renderLimits();
    const client = await screen.findByLabelText(/Client active jobs/);
    await user.clear(client);
    await user.type(client, "5");
    await user.click(screen.getByRole("button", { name: "Save job limits" }));
    expect(services.updateJobCapacity).not.toHaveBeenCalled();

    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save limits" }));
    await waitFor(() => expect(services.updateJobCapacity).toHaveBeenCalledWith({ ...limits, clientActiveMax: 5 }));
    expect(await screen.findByText("Job limits saved.")).toBeInTheDocument();
    expect(screen.getByText("No changes to save.")).toBeInTheDocument();
  });

  it("keeps the edits and shows the reason when the server refuses the save", async () => {
    vi.mocked(services.getJobCapacity).mockResolvedValue(limits);
    vi.mocked(services.updateJobCapacity).mockRejectedValueOnce(new ApiError(400, "Limits must be positive"));
    const user = userEvent.setup();
    renderLimits();
    const client = await screen.findByLabelText(/Client active jobs/);
    await user.clear(client);
    await user.type(client, "7");
    await user.click(screen.getByRole("button", { name: "Save job limits" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Save limits" }));

    expect(await inlineAlert("Limits must be positive")).toBeInTheDocument();
    expect(screen.getByLabelText(/Client active jobs/)).toHaveValue(7);
  });
});

describe("parseJobCapacityForm", () => {
  const form = {
    clientActiveMax: "3", providerActiveMax: "3", providerPendingMax: "3",
    dailyHoursMax: "8", restHours: "0", travelKmh: "20",
  };

  it("returns numbers when every field is valid, including zero rest", () => {
    expect(parseJobCapacityForm(form)).toEqual({ ok: true, limits: { ...limits, restHours: 0 } });
  });

  it("names each field that fails its rule", () => {
    expect(parseJobCapacityForm({ ...form, clientActiveMax: "2.5", providerPendingMax: "", travelKmh: "-4", restHours: "-1" })).toEqual({
      ok: false,
      errors: {
        clientActiveMax: "Enter a whole number, 1 or more.",
        providerPendingMax: "Enter a whole number, 1 or more.",
        travelKmh: "Enter a number greater than 0.",
        restHours: "Enter a number, 0 or more.",
      },
    });
  });
});
