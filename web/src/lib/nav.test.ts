import { describe, expect, it } from "vitest";
import { ADMIN_NAV, NAV_GROUPS, pageMeta } from "./nav";

describe("ADMIN_NAV", () => {
  it("covers all 13 admin pages exactly once, in known groups", () => {
    const ids = ADMIN_NAV.map((n) => n.id);
    expect(new Set(ids).size).toBe(13);
    expect(ids).toEqual(
      expect.arrayContaining([
        "dashboard", "verifications", "bookings", "disputes", "transactions", "withdrawals",
        "skill-requests", "users", "activity-log", "audit-log", "reports", "platform", "settings",
      ]),
    );
    const groups = new Set(NAV_GROUPS.map((g) => g.id));
    ADMIN_NAV.forEach((n) => expect(groups.has(n.group)).toBe(true));
  });

  it("keeps today's labels", () => {
    expect(pageMeta("skill-requests").label).toBe("Service Requests");
    expect(pageMeta("activity-log").label).toBe("Activity");
  });
});
