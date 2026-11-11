import { describe, expect, it } from "vitest";
import { manilaDay, parseReportQuery, periodFor, serializeReportQuery } from "./query";

describe("report period", () => {
  const now = new Date("2026-11-11T15:00:00Z");

  it("uses this month, trailing month windows, and a custom pair", () => {
    expect(periodFor("this", "", "", now)).toEqual({ from: "2026-11-01", to: "2026-11-11" });
    expect(periodFor("3", "", "", now)).toEqual({ from: "2026-09-01", to: "2026-11-11" });
    expect(periodFor("6", "", "", now)).toEqual({ from: "2026-06-01", to: "2026-11-11" });
    expect(periodFor("12", "", "", now)).toEqual({ from: "2025-12-01", to: "2026-11-11" });
    expect(periodFor("custom", "2026-10-31", "2026-10-01", now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("ends on Manila's date after midnight there, not the UTC date", () => {
    // 00:30 on Nov 12 in Manila is still Nov 11 in UTC.
    const afterMidnight = new Date("2026-11-11T16:30:00Z");
    expect(manilaDay(afterMidnight)).toBe("2026-11-12");
    expect(periodFor("this", "", "", afterMidnight)).toEqual({ from: "2026-11-01", to: "2026-11-12" });
    expect(periodFor("12", "", "", afterMidnight)).toEqual({ from: "2025-12-01", to: "2026-11-12" });
  });

  it("round-trips the filters through the query string", () => {
    const query = parseReportQuery(new URLSearchParams("tab=provider&preset=custom&from=2026-10-01&to=2026-10-31&status=cancelled&category=4&provider=p1"));
    expect(query).toMatchObject({
      tab: "provider",
      preset: "custom",
      status: "cancelled",
      category: "4",
      providerId: "p1",
    });
    const period = periodFor(query.preset, query.from, query.to, now);
    const again = parseReportQuery(new URLSearchParams(serializeReportQuery(query, period)));
    expect(again).toEqual(query);
  });
});
