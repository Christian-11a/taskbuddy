import { describe, expect, it } from "vitest";
import { caseSignals } from "@/lib/caseSignals";
import type { CaseEntry } from "@/lib/domain";
import { caseNextStep, durationText, type NextStepInput } from "./caseNextStep";

const now = new Date("2026-10-15T12:00:00Z");
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

function entry(kind: string, created_at: string, body = "Body"): CaseEntry {
  return { id: `${kind}-${created_at}`, kind, body, created_at, author: null, message: null, attachment_url: null };
}

/** Builds the same signals the queue computes, then asks for the next step. */
function nextFor(over: Partial<NextStepInput> & { cancellationDeadline?: string | null } = {}) {
  const { cancellationDeadline = null, ...rest } = over;
  const input: NextStepInput = { isOpen: true, cancellationState: null, entries: [], ...rest };
  const signals = caseSignals(
    { isOpen: input.isOpen, cancellationState: input.cancellationState, cancellationDeadline, entries: input.entries },
    now,
  );
  return caseNextStep(input, signals);
}

describe("durationText", () => {
  it("reads a stretch of time in plain words", () => {
    expect(durationText(0.5)).toBe("under 1 h");
    expect(durationText(4)).toBe("4 h");
    expect(durationText(26)).toBe("1 d 2 h");
    expect(durationText(48)).toBe("2 d");
  });
});

describe("caseNextStep: cancellation responses", () => {
  it("says the provider is overdue once the response deadline has passed", () => {
    expect(nextFor({ cancellationState: "pending", cancellationDeadline: hoursFromNow(-3) })).toEqual({
      text: "Waiting for provider · overdue by 3 h",
      tone: "danger",
    });
  });

  it("warns when the response is due soon", () => {
    expect(nextFor({ cancellationState: "pending", cancellationDeadline: hoursFromNow(4) })).toEqual({
      text: "Waiting for provider · due in 4 h",
      tone: "warn",
    });
  });

  it("says under 1 h when less than an hour is left", () => {
    expect(nextFor({ cancellationState: "pending", cancellationDeadline: hoursFromNow(0.5) })).toEqual({
      text: "Waiting for provider · due in under 1 h",
      tone: "warn",
    });
  });

  it("gives the time left when the deadline is comfortably far away", () => {
    expect(nextFor({ cancellationState: "pending", cancellationDeadline: hoursFromNow(52) })).toEqual({
      text: "Waiting for provider · due in 2 d 4 h",
      tone: "neutral",
    });
  });

  it("names the provider without a deadline when none is set", () => {
    expect(nextFor({ cancellationState: "pending", cancellationDeadline: null })).toEqual({
      text: "Waiting for provider",
      tone: "neutral",
    });
  });

  it("treats a contested cancellation as ready for a decision", () => {
    expect(nextFor({ cancellationState: "contested", cancellationDeadline: hoursFromNow(-3) })).toEqual({
      text: "Ready for your decision",
      tone: "accent",
    });
  });
});

describe("caseNextStep: clarifications", () => {
  const statement = entry("statement", "2026-10-10T00:00:00Z");

  it("names the client when the last clarification is addressed to them", () => {
    const clarification = entry("clarification", "2026-10-11T00:00:00Z", "To the client: Share the agreement chat.");
    expect(nextFor({ entries: [statement, clarification] })).toEqual({ text: "Waiting for client", tone: "info" });
  });

  it("names the provider when the last clarification is addressed to them", () => {
    const clarification = entry("clarification", "2026-10-11T00:00:00Z", "To the provider: Explain the delay.");
    expect(nextFor({ entries: [statement, clarification] })).toEqual({ text: "Waiting for provider", tone: "info" });
  });

  it("names both parties when the clarification is addressed to both", () => {
    const clarification = entry("clarification", "2026-10-11T00:00:00Z", "To both parties: Confirm completion.");
    expect(nextFor({ entries: [statement, clarification] })).toEqual({ text: "Waiting for both parties", tone: "info" });
  });

  it("says only that a reply is awaited when the clarification has no address", () => {
    const clarification = entry("clarification", "2026-10-11T00:00:00Z", "Older note without an address.");
    expect(nextFor({ entries: [statement, clarification] })).toEqual({ text: "Waiting for a reply", tone: "info" });
  });

  it("uses the most recent clarification when there are several", () => {
    const older = entry("clarification", "2026-10-09T00:00:00Z", "To the client: First ask.");
    const newer = entry("clarification", "2026-10-11T00:00:00Z", "To the provider: Second ask.");
    expect(nextFor({ entries: [older, newer, statement] })).toEqual({ text: "Waiting for provider", tone: "info" });
  });
});

describe("caseNextStep: other states", () => {
  it("says a closed case needs nothing", () => {
    expect(nextFor({ isOpen: false, entries: [] })).toEqual({ text: "Closed · no action needed", tone: "neutral" });
  });

  it("says an open case with nobody to wait on is ready for a decision", () => {
    expect(nextFor({ entries: [entry("statement", "2026-10-10T00:00:00Z")] })).toEqual({
      text: "Ready for your decision",
      tone: "accent",
    });
  });
});
