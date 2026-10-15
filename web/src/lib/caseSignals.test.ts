import { describe, expect, it } from "vitest";
import { byUrgency, caseSignals, type CaseSignalInput } from "./caseSignals";

const now = new Date("2026-10-15T12:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

const open = (over: Partial<CaseSignalInput> = {}): CaseSignalInput => ({
  isOpen: true,
  cancellationState: null,
  cancellationDeadline: null,
  entries: [],
  ...over,
});

const statement = { kind: "statement", created_at: at(-48) };
const clarification = { kind: "clarification", created_at: at(-2) };

describe("caseSignals: kind", () => {
  it("is a complaint by default", () => {
    expect(caseSignals(open({ entries: [statement] }), now).kind).toBe("complaint");
  });
  it("is an appeal when an appeal entry exists", () => {
    const entries = [statement, { kind: "appeal", created_at: at(-1) }];
    expect(caseSignals(open({ entries }), now).kind).toBe("appeal");
  });
  it("is a cancellation review when there is a cancellation state", () => {
    expect(caseSignals(open({ cancellationState: "pending" }), now).kind).toBe("cancellation");
  });
});

describe("caseSignals: urgency", () => {
  it("is overdue when a pending cancellation's deadline has passed", () => {
    const s = caseSignals(open({ cancellationState: "pending", cancellationDeadline: at(-1) }), now);
    expect(s.urgency).toBe("overdue");
    expect(s.hoursToDeadline).toBeCloseTo(-1);
  });
  it("is soon when a pending cancellation's deadline is within 24 hours", () => {
    const s = caseSignals(open({ cancellationState: "pending", cancellationDeadline: at(5) }), now);
    expect(s.urgency).toBe("soon");
    expect(s.hoursToDeadline).toBeCloseTo(5);
  });
  it("is soon right up to 24 hours, and normal beyond", () => {
    expect(caseSignals(open({ cancellationState: "pending", cancellationDeadline: at(23) }), now).urgency).toBe("soon");
    expect(caseSignals(open({ cancellationState: "pending", cancellationDeadline: at(25) }), now).urgency).toBe("normal");
  });
  it("is not urgent when the deadline is three days ahead", () => {
    const s = caseSignals(open({ cancellationState: "pending", cancellationDeadline: at(72) }), now);
    expect(s.urgency).toBe("normal");
    expect(s.hoursToDeadline).toBeCloseTo(72);
  });
  it("never treats contested, accepted or expired cancellations as urgent", () => {
    for (const state of ["contested", "accepted", "expired"]) {
      const s = caseSignals(open({ cancellationState: state, cancellationDeadline: at(-5) }), now);
      expect(s.urgency).toBe("normal");
    }
  });
  it("is always normal for resolved cases, even with a past deadline", () => {
    const s = caseSignals(
      { isOpen: false, cancellationState: "pending", cancellationDeadline: at(-3), entries: [clarification] },
      now,
    );
    expect(s.urgency).toBe("normal");
    expect(s.awaitingParty).toBe(false);
  });
  it("is waiting when the admin is waiting on a party", () => {
    expect(caseSignals(open({ entries: [statement, clarification] }), now).urgency).toBe("waiting");
  });
  it("ranks a deadline above waiting on a party", () => {
    const s = caseSignals(
      open({ cancellationState: "pending", cancellationDeadline: at(5), entries: [clarification] }),
      now,
    );
    expect(s.urgency).toBe("soon");
    expect(s.awaitingParty).toBe(true);
  });
});

describe("caseSignals: awaiting a party", () => {
  it("is true only when the last entry is a clarification", () => {
    expect(caseSignals(open({ entries: [statement, clarification] }), now).awaitingParty).toBe(true);
  });
  it("is false once a later statement has been added", () => {
    const entries = [clarification, { kind: "statement", created_at: at(-1) }];
    expect(caseSignals(open({ entries }), now).awaitingParty).toBe(false);
  });
  it("reads the latest entry by created_at, not by array position", () => {
    const entries = [
      { kind: "clarification", created_at: at(-1) },
      { kind: "statement", created_at: at(-10) },
    ];
    expect(caseSignals(open({ entries }), now).awaitingParty).toBe(true);
  });
});

describe("caseSignals: unknown or missing data", () => {
  it("treats an unknown cancellation state as a cancellation that needs nothing", () => {
    const s = caseSignals(open({ cancellationState: "escalated", cancellationDeadline: at(-3) }), now);
    expect(s.kind).toBe("cancellation");
    expect(s.urgency).toBe("normal");
  });
  it("is normal with no hours when a pending cancellation has no deadline", () => {
    const s = caseSignals(open({ cancellationState: "pending", cancellationDeadline: null }), now);
    expect(s.urgency).toBe("normal");
    expect(s.hoursToDeadline).toBeNull();
  });
  it("ignores a deadline that is not a date", () => {
    const s = caseSignals(open({ cancellationState: "pending", cancellationDeadline: "soonish" }), now);
    expect(s.urgency).toBe("normal");
    expect(s.hoursToDeadline).toBeNull();
  });
  it("handles a case with no entries", () => {
    expect(caseSignals(open({ entries: [] }), now)).toEqual({
      kind: "complaint",
      urgency: "normal",
      hoursToDeadline: null,
      awaitingParty: false,
    });
  });
});

describe("byUrgency", () => {
  const item = (input: CaseSignalInput, id: string) => ({ id, signals: caseSignals(input, now) });

  it("orders overdue, soon, normal, then waiting", () => {
    const items = [
      item(open({ entries: [clarification] }), "waiting"),
      item(open({ entries: [statement] }), "normal"),
      item(open({ cancellationState: "pending", cancellationDeadline: at(5) }), "soon"),
      item(open({ cancellationState: "pending", cancellationDeadline: at(-1) }), "overdue"),
    ];
    expect(items.sort(byUrgency).map((i) => i.id)).toEqual(["overdue", "soon", "normal", "waiting"]);
  });
  it("keeps the incoming order for ties", () => {
    const items = [
      item(open({ entries: [statement] }), "first"),
      item(open({ entries: [statement] }), "second"),
    ];
    expect(items.sort(byUrgency).map((i) => i.id)).toEqual(["first", "second"]);
  });
});
