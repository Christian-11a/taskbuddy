import { describe, expect, it } from "vitest";
import { displayCount, documentTitle, newWork, totalAttention, type QueueCounts } from "./attention";

const c = (over: Partial<QueueCounts> = {}): QueueCounts => ({
  verifications: 0, disputes: 0, withdrawals: 0, "skill-requests": 0, ...over,
});

describe("totalAttention", () => {
  it("sums the known counts and ignores queues that failed to load", () => {
    expect(totalAttention(c({ verifications: 2, disputes: 1, withdrawals: null, "skill-requests": 3 }))).toBe(6);
  });
});

describe("displayCount", () => {
  it("hides zero and unknown, and caps long lists", () => {
    expect(displayCount(0)).toBeUndefined();
    expect(displayCount(null)).toBeUndefined();
    expect(displayCount(7)).toBe("7");
    expect(displayCount(100)).toBe("100+");
    expect(displayCount(100, 100)).toBe("100+");
  });
});

describe("newWork", () => {
  it("is empty on the first reading, so a fresh login never toasts everything", () => {
    expect(newWork(null, c({ verifications: 5 }))).toEqual([]);
  });
  it("reports only queues whose count went up", () => {
    const prev = c({ verifications: 2, disputes: 1 });
    const next = c({ verifications: 2, disputes: 2, withdrawals: 1 });
    expect(newWork(prev, next)).toEqual(["disputes", "withdrawals"]);
  });
  it("ignores falling counts and queues that are unknown on either side", () => {
    expect(newWork(c({ verifications: 3 }), c({ verifications: 1 }))).toEqual([]);
    expect(newWork(c({ withdrawals: null }), c({ withdrawals: 4 }))).toEqual([]);
    expect(newWork(c({ withdrawals: 2 }), c({ withdrawals: null }))).toEqual([]);
  });
});

describe("documentTitle", () => {
  it("prefixes the count only when something is waiting", () => {
    expect(documentTitle("TaskBuddy Admin", 3)).toBe("(3) TaskBuddy Admin");
    expect(documentTitle("TaskBuddy Admin", 0)).toBe("TaskBuddy Admin");
  });
});
