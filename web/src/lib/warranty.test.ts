import { describe, expect, it } from "vitest";
import { formatHoursLeft, warrantyStatus } from "./warranty";

const now = new Date("2026-10-15T12:00:00Z");

describe("warrantyStatus", () => {
  it("is none without a completion time or with garbage", () => {
    expect(warrantyStatus(null, now)).toEqual({ state: "none" });
    expect(warrantyStatus(undefined, now)).toEqual({ state: "none" });
    expect(warrantyStatus("", now)).toEqual({ state: "none" });
    expect(warrantyStatus("not a date", now)).toEqual({ state: "none" });
  });
  it("is open for 72 hours after completion", () => {
    const w = warrantyStatus("2026-10-14T12:00:00Z", now);
    expect(w).toMatchObject({ state: "open", hoursLeft: 48 });
  });
  it("closes exactly at 72 hours", () => {
    expect(warrantyStatus("2026-10-12T12:00:00Z", now).state).toBe("closed");
    expect(warrantyStatus("2026-10-12T12:00:01Z", now).state).toBe("open");
  });
  it("reports the moment it closed", () => {
    expect(warrantyStatus("2026-10-01T08:30:00Z", now)).toEqual({
      state: "closed",
      closedAt: new Date("2026-10-04T08:30:00Z"),
    });
  });
  it("reports the closing time while open", () => {
    const w = warrantyStatus("2026-10-14T12:00:00Z", now);
    expect(w).toEqual({
      state: "open",
      closesAt: new Date("2026-10-17T12:00:00Z"),
      hoursLeft: 48,
    });
  });
});

describe("formatHoursLeft", () => {
  it("reads naturally", () => {
    expect(formatHoursLeft(0.4)).toBe("under 1 h left");
    expect(formatHoursLeft(5)).toBe("5 h left");
    expect(formatHoursLeft(52)).toBe("2 d 4 h left");
  });
  it("drops the zero hours when days divide evenly", () => {
    expect(formatHoursLeft(24)).toBe("1 d left");
    expect(formatHoursLeft(48)).toBe("2 d left");
  });
  it("rounds down to whole hours", () => {
    expect(formatHoursLeft(23.5)).toBe("23 h left");
  });
});
