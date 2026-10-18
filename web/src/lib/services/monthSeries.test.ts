import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentMonthKey,
  fillMonths,
  monthLabel,
  monthValue,
  monthsEndingAt,
  percentChange,
  previousMonth,
  spansYears,
  toChartSeries,
} from "./monthSeries";

describe("currentMonthKey", () => {
  it("uses the UTC calendar month", () => {
    expect(currentMonthKey(new Date("2026-10-31T20:00:00Z"))).toBe("2026-10"); // still October in UTC
    expect(currentMonthKey(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(currentMonthKey(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });
});

describe("previousMonth / addMonths", () => {
  it("steps back across the year boundary", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });

  it("steps forward and back by several months", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-02", -14)).toBe("2024-12");
  });

  it("returns the window of months ending at the given month, oldest first", () => {
    expect(monthsEndingAt("2027-01", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("fillMonths", () => {
  it("fills missing months with 0, in order, and keeps the year", () => {
    expect(fillMonths([{ month: "2026-09", amount: 40 }, { month: "2026-11", amount: 7.5 }], "2026-11", 4)).toEqual([
      { month: "2026-08", amount: 0 },
      { month: "2026-09", amount: 40 },
      { month: "2026-10", amount: 0 },
      { month: "2026-11", amount: 7.5 },
    ]);
  });

  it("crosses the Dec to Jan boundary with the year on every key", () => {
    const series = fillMonths([{ month: "2026-12", amount: 5 }], "2027-01", 3);
    expect(series.map((p) => p.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(series.map((p) => p.amount)).toEqual([0, 5, 0]);
  });

  it("drops entries outside the window and sums duplicate months", () => {
    const series = fillMonths(
      [{ month: "2025-01", amount: 99 }, { month: "2026-10", amount: 1 }, { month: "2026-10", amount: 2.25 }],
      "2026-10",
      2,
    );
    expect(series).toEqual([
      { month: "2026-09", amount: 0 },
      { month: "2026-10", amount: 3.25 },
    ]);
  });
});

describe("delta against the real previous month", () => {
  it("is null when the previous calendar month is missing (0 has no percentage)", () => {
    const series = [{ month: "2026-08", value: 200 }, { month: "2026-10", value: 300 }];
    const change = percentChange(monthValue(series, "2026-10"), monthValue(series, previousMonth("2026-10")));
    expect(change).toBeNull();
  });

  it("compares Jan 2027 with Dec 2026, not with the previous point in a sparse list", () => {
    const series = [{ month: "2026-09", value: 200 }, { month: "2026-11", value: 999 }, { month: "2027-01", value: 100 }];
    // Dec 2026 is missing, so it counts as 0 and there is no percentage.
    expect(percentChange(monthValue(series, "2027-01"), monthValue(series, previousMonth("2027-01")))).toBeNull();
  });

  it("computes the change once the previous month has activity", () => {
    const series = [{ month: "2026-12", value: 50 }, { month: "2027-01", value: 75 }];
    expect(percentChange(75, 50)).toBe(50);
    expect(monthValue(series, previousMonth("2027-01"))).toBe(50);
  });
});

describe("month labels", () => {
  it("shows the year only when the range crosses a year boundary", () => {
    expect(monthLabel("2026-10", false)).toBe("Oct");
    expect(monthLabel("2026-10", true)).toBe("Oct 2026");
    expect(spansYears([{ month: "2026-02" }, { month: "2026-10" }])).toBe(false);
    expect(spansYears([{ month: "2025-11" }, { month: "2026-10" }])).toBe(true);
  });

  it("labels a chart series with years when it spans two years", () => {
    expect(toChartSeries([{ month: "2025-12", value: 1 }, { month: "2026-01", value: 2 }])).toEqual([
      { month: "Dec 2025", value: 1 },
      { month: "Jan 2026", value: 2 },
    ]);
  });

  it("leaves non-key labels unchanged", () => {
    expect(toChartSeries([{ month: "Aug", value: 1 }, { month: "Sep", value: 2 }])).toEqual([
      { month: "Aug", value: 1 },
      { month: "Sep", value: 2 },
    ]);
  });
});
