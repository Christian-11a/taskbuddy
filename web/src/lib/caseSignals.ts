// Complaint-queue signals for one case: what kind of case it is, how urgent it
// is, and whether the admin is waiting on a party. Pure: "now" is passed in so
// the queue can re-evaluate deadlines on its live tick.

export type CaseKind = "complaint" | "appeal" | "cancellation";
export type Urgency = "overdue" | "soon" | "waiting" | "normal";

export interface CaseSignalInput {
  isOpen: boolean;
  cancellationState: string | null;
  cancellationDeadline: string | null;
  entries: { kind: string; created_at: string }[];
}

export interface CaseSignals {
  kind: CaseKind;
  urgency: Urgency;
  /** Negative once the deadline has passed; null when there is no usable deadline. */
  hoursToDeadline: number | null;
  /** Open, and the latest entry is an admin's request for clarification. */
  awaitingParty: boolean;
}

const SOON_HOURS = 24;
const MS_PER_HOUR = 3_600_000;

/** Lower sorts first in the queue. */
const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, soon: 1, normal: 2, waiting: 3 };

export function caseSignals(d: CaseSignalInput, now: Date): CaseSignals {
  const kind: CaseKind =
    typeof d.cancellationState === "string"
      ? "cancellation"
      : d.entries.some((e) => e.kind === "appeal")
        ? "appeal"
        : "complaint";

  const awaitingParty = d.isOpen && latestEntryKind(d.entries) === "clarification";
  const hoursToDeadline = hoursUntil(d.cancellationDeadline, now);

  let urgency: Urgency = "normal";
  if (d.isOpen && d.cancellationState === "pending" && hoursToDeadline !== null) {
    if (hoursToDeadline < 0) urgency = "overdue";
    else if (hoursToDeadline <= SOON_HOURS) urgency = "soon";
  }
  if (urgency === "normal" && awaitingParty) urgency = "waiting";

  return { kind, urgency, hoursToDeadline, awaitingParty };
}

/** Comparator for `Array.prototype.sort`: overdue, soon, normal, waiting. Ties keep their order. */
export function byUrgency<T extends { signals: CaseSignals }>(a: T, b: T): number {
  return URGENCY_RANK[a.signals.urgency] - URGENCY_RANK[b.signals.urgency];
}

function latestEntryKind(entries: CaseSignalInput["entries"]): string | null {
  let latest: { kind: string; time: number } | null = null;
  for (const entry of entries) {
    const time = Date.parse(entry.created_at);
    if (Number.isNaN(time)) continue;
    if (latest === null || time >= latest.time) latest = { kind: entry.kind, time };
  }
  return latest?.kind ?? null;
}

function hoursUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return (time - now.getTime()) / MS_PER_HOUR;
}
