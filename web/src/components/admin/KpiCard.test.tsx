import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Delta, monthOverMonth } from "./KpiCard";

describe("monthOverMonth", () => {
  it("compares the last two months", () => {
    expect(monthOverMonth([{ value: 100 }, { value: 125 }])).toBe(25);
    expect(monthOverMonth([{ value: 80 }, { value: 40 }])).toBe(-50);
  });
  it("is null without a usable previous month", () => {
    expect(monthOverMonth([{ value: 10 }])).toBeNull();
    expect(monthOverMonth([{ value: 0 }, { value: 10 }])).toBeNull();
  });
});

describe("Delta", () => {
  it("labels growth and the missing-baseline case", () => {
    const { rerender } = render(<Delta value={25} />);
    expect(screen.getByText("25%")).toBeInTheDocument();
    rerender(<Delta value={null} />);
    expect(screen.getByText("No prior month")).toBeInTheDocument();
  });
});
