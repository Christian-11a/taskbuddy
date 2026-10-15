import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WarrantyLine } from "./WarrantyLine";

const NOW = new Date("2026-10-15T12:00:00Z");

describe("WarrantyLine", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the open warranty and time left", () => {
    // Completed 10 h ago: 62 h of the 72 h window remain.
    render(<WarrantyLine completedAt="2026-10-15T02:00:00Z" escrowStatus="COMPLETED" />);
    expect(screen.getByText("Warranty open · 2 d 14 h left")).toBeInTheDocument();
    expect(screen.queryByText("Payment is held until the warranty ends")).not.toBeInTheDocument();
  });

  it("says payment is held while an open warranty holds escrow", () => {
    render(<WarrantyLine completedAt="2026-10-15T02:00:00Z" escrowStatus="IN_ESCROW" />);
    expect(screen.getByText("Warranty open · 2 d 14 h left")).toBeInTheDocument();
    expect(screen.getByText("Payment is held until the warranty ends")).toBeInTheDocument();
  });

  it("shows a closed warranty once 72 hours have passed", () => {
    render(<WarrantyLine completedAt="2026-10-10T12:00:00Z" escrowStatus="IN_ESCROW" />);
    expect(screen.getByText("Warranty closed")).toBeInTheDocument();
    expect(screen.queryByText("Payment is held until the warranty ends")).not.toBeInTheDocument();
  });

  it("renders nothing when the job has no completion time", () => {
    const { container } = render(<WarrantyLine completedAt={null} escrowStatus="IN_ESCROW" />);
    expect(container).toBeEmptyDOMElement();
  });
});
