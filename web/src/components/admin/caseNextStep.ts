import type { CaseSignals } from "@/lib/caseSignals";
import type { CaseEntry } from "@/lib/domain";
import { parseClarificationAddress } from "./CaseTimeline";

export type NextStepTone = "danger" | "warn" | "info" | "accent" | "neutral";

export interface CaseNextStep {
  text: string;
  tone: NextStepTone;
}

export interface NextStepInput {
  isOpen: boolean;
  cancellationState: string | null;
  entries: CaseEntry[];
}

/** "under 1 h", "3 h", "2 d", "2 d 4 h": how long a stretch of time is, for "due in" and "overdue by". */
export function durationText(hours: number): string {
  if (hours < 1) return "under 1 h";
  if (hours < 24) return `${Math.floor(hours)} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

/**
 * The one line under a case row: who the case is waiting on, and by when.
 * Built only from the case's own state (cancellation, latest clarification, deadline).
 */
export function caseNextStep(input: NextStepInput, signals: CaseSignals): CaseNextStep {
  if (!input.isOpen) return { text: "Closed · no action needed", tone: "neutral" };

  if (input.cancellationState === "pending") {
    const hours = signals.hoursToDeadline;
    if (hours === null) return { text: "Waiting for provider", tone: "neutral" };
    if (hours < 0) return { text: `Waiting for provider · overdue by ${durationText(-hours)}`, tone: "danger" };
    const tone = signals.urgency === "soon" ? "warn" : "neutral";
    return { text: `Waiting for provider · due in ${durationText(hours)}`, tone };
  }

  if (signals.awaitingParty) {
    const audience = latestClarificationAudience(input.entries);
    if (audience === "client") return { text: "Waiting for client", tone: "info" };
    if (audience === "provider") return { text: "Waiting for provider", tone: "info" };
    if (audience === "both") return { text: "Waiting for both parties", tone: "info" };
    return { text: "Waiting for a reply", tone: "info" };
  }

  return { text: "Ready for your decision", tone: "accent" };
}

/** Who the latest clarification was addressed to, read from its text. Null when it has no address. */
function latestClarificationAudience(entries: CaseEntry[]) {
  let latest: { time: number; body: string } | null = null;
  for (const entry of entries) {
    if (entry.kind !== "clarification") continue;
    const time = Date.parse(entry.created_at);
    if (Number.isNaN(time)) continue;
    if (latest === null || time >= latest.time) latest = { time, body: entry.body };
  }
  return latest ? parseClarificationAddress(latest.body).audience : null;
}
