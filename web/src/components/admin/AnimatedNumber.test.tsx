import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => true,
}));
import { AnimatedNumber } from "./AnimatedNumber";

describe("AnimatedNumber", () => {
  it("shows the formatted final value immediately under reduced motion", () => {
    render(<AnimatedNumber value={1234.5} format={(n) => `₱${n.toFixed(2)}`} />);
    expect(screen.getByText("₱1234.50")).toBeInTheDocument();
  });

  it("updates straight to a new value under reduced motion", () => {
    const { rerender } = render(<AnimatedNumber value={7} />);
    rerender(<AnimatedNumber value={9} />);
    expect(screen.getByText("9")).toBeInTheDocument();
  });
});
