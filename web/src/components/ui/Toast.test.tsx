import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ message, kind }: { message: string; kind?: "success" | "error" }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message, kind)}>fire</button>;
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a success toast as a polite status region", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger message="User suspended." />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "fire" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("User suspended.");
  });

  it("shows an error toast as an assertive alert, so a failed mutation isn't silent", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger message="Could not suspend. Please try again." kind="error" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "fire" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not suspend. Please try again.");
  });

  it("auto-dismisses a success toast sooner than an error toast", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger message="ok" kind="success" />
        <Trigger message="bad" kind="error" />
      </ToastProvider>,
    );
    const [firstTrigger, secondTrigger] = screen.getAllByRole("button", { name: "fire" });
    await user.click(firstTrigger);
    await user.click(secondTrigger);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dismisses a toast when its close button is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger message="ok" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "fire" }));
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("throws when useToast is used outside a provider", () => {
    const Bad = () => {
      useToast();
      return null;
    };
    expect(() => render(<Bad />)).toThrow("useToast must be used inside ToastProvider");
  });
});
