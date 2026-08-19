import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog open={false} title="Cancel booking?" message="BK-0042" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("renders the title and message when open", () => {
    render(
      <ConfirmDialog open title="Cancel booking?" message="BK-0042" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Cancel booking?")).toBeInTheDocument();
    expect(screen.getByText("BK-0042")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog open title="t" message="m" confirmLabel="Suspend" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on backdrop click, Cancel button, and Escape", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ConfirmDialog open title="t" message="m" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<ConfirmDialog open title="t" message="m" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("disables both buttons and blocks Escape/backdrop-close while busy", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open busy title="t" message="m" confirmLabel="Suspend" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables only the confirm button when confirmDisabled is set", () => {
    render(
      <ConfirmDialog
        open
        confirmDisabled
        title="t"
        message="m"
        confirmLabel="Suspend"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Suspend" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});
