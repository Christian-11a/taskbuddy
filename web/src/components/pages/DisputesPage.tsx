"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { ArrowRight, Check, Gavel, MessagesSquare, RotateCcw, Scale, ShieldAlert } from "lucide-react";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import type { ConversationMessage } from "@/lib/domain";
import type { DisputeRow } from "@/lib/adapters";
import { NOTE_MAX_LENGTH } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReasonField } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/Panel";
import { CaseTimeline } from "@/components/admin/CaseTimeline";
import {
  Avatar,
  DetailCard,
  DetailEmpty,
  DetailSection,
  Field,
  FieldGrid,
  FilterTabs,
  KeyHints,
  QueueItem,
  QueueList,
  QueueListSkeleton,
  QueueListState,
  QueueProgress,
  QueueShell,
  SearchField,
  initialsOf,
  neighborAfterRemoval,
  useIsWide,
  useQueueKeys,
} from "@/components/admin/queue";
import { useLiveTick } from "@/hooks/useLiveTick";
import { useBookingDetailCache } from "@/hooks/useBookingDetailCache";
import { byUrgency, caseSignals, type CaseKind, type CaseSignals } from "@/lib/caseSignals";
import { formatHoursLeft, warrantyStatus } from "@/lib/warranty";
import { cn } from "@/lib/utils";

type Filter = "needs-decision" | "waiting" | "cancellations" | "appeals" | "resolved" | "all";
type Resolution = "RELEASED_TO_PROVIDER" | "REFUNDED_TO_CLIENT" | "REVIEWED";
type ConversationState = ConversationMessage[] | "error";
type Signalled = { row: DisputeRow; signals: CaseSignals };

const KIND_LABEL: Record<CaseKind, string> = {
  complaint: "Complaint",
  appeal: "Appeal",
  cancellation: "Cancellation review",
};
const KIND_TONE: Record<CaseKind, "neutral" | "accent" | "info"> = {
  complaint: "neutral",
  appeal: "accent",
  cancellation: "info",
};
const CANCELLATION_STATE_LABEL: Record<string, string> = {
  pending: "Waiting for the other side",
  contested: "Contested",
  accepted: "Accepted",
  expired: "Expired",
};
const FILTER_EMPTY: Partial<Record<Filter, { title: string; description: string; tone?: "ok"; icon?: ComponentType<{ className?: string }> }>> = {
  "needs-decision": { title: "No cases need a decision", description: "Every open case is waiting on someone or already decided.", tone: "ok", icon: Check },
  waiting: { title: "Nobody is being waited on", description: "No case is waiting for a client or provider to answer a clarification request." },
  cancellations: { title: "No cancellation reviews open", description: "Cancellation reviews appear here when a job cancellation needs an admin decision." },
  appeals: { title: "No appeals open", description: "Provider appeals appear here when a complaint is answered and reopened." },
  resolved: { title: "Nothing resolved yet", description: "Decided and cancelled cases collect here." },
};

function matchesFilter(filter: Filter, { row, signals }: Signalled): boolean {
  switch (filter) {
    case "needs-decision":
      return row.isOpen && !signals.awaitingParty;
    case "waiting":
      return row.isOpen && signals.awaitingParty;
    case "cancellations":
      return row.isOpen && signals.kind === "cancellation";
    case "appeals":
      return row.isOpen && signals.kind === "appeal";
    case "resolved":
      return !row.isOpen;
    case "all":
      return true;
  }
}

function statusTone(d: DisputeRow) {
  if (d.isOpen) return "warn" as const;
  if (d.status === "Resolved") return "ok" as const;
  return "neutral" as const;
}

/** "under 1 h", "3 h", "2 d", "2 d 4 h": how long a stretch of time is, for "overdue by". */
function durationText(hours: number): string {
  if (hours < 1) return "under 1 h";
  if (hours < 24) return `${Math.floor(hours)} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

function dueLabel(hours: number | null): string {
  if (hours === null) return "Due soon";
  return hours < 1 ? "Due in under 1 h" : `Due in ${Math.floor(hours)} h`;
}

function cancellationStateLabel(state: string): string {
  return Object.prototype.hasOwnProperty.call(CANCELLATION_STATE_LABEL, state) ? CANCELLATION_STATE_LABEL[state] : state;
}

export function DisputesPage() {
  const { disputes, resolveDispute, refreshData, loading } = useApp();
  const { showToast } = useToast();
  const isWide = useIsWide();
  const [filter, setFilter] = useState<Filter>("needs-decision");
  const [search, setSearch] = useState("");
  // Held in state and refreshed on the live tick, so "overdue" turns on without a reload.
  const [now, setNow] = useState(() => new Date());
  useLiveTick(() => setNow(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; resolution: Resolution } | null>(null);
  // Counts each time a open confirmation went stale; the toast effect keys off it so it fires once per transition.
  const [staleCount, setStaleCount] = useState(0);
  // Notes are kept per dispute, so moving between cases never loses a draft
  // and opening the confirm step never wipes what was typed.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [doneThisSession, setDoneThisSession] = useState(0);
  // GET /admin/jobs/:jobId/conversation (migration 0014) — read-only, fetched
  // when a case is opened and cached by job id.
  const [conversations, setConversations] = useState<Record<string, ConversationState>>({});

  const signalled = useMemo<Signalled[]>(
    () =>
      disputes.map((row) => ({
        row,
        signals: caseSignals(
          { isOpen: row.isOpen, cancellationState: row.cancellationState, cancellationDeadline: row.cancellationDeadline, entries: row.entries ?? [] },
          now,
        ),
      })),
    [disputes, now],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return signalled
      .filter((item) => {
        const { row } = item;
        const matchSearch =
          !q ||
          row.jobTitle.toLowerCase().includes(q) ||
          row.clientName.toLowerCase().includes(q) ||
          row.providerName.toLowerCase().includes(q);
        return matchesFilter(filter, item) && matchSearch;
      })
      // Open cases first, most urgent first. The sort is stable, so ties keep the API order.
      .sort((a, b) => Number(b.row.isOpen) - Number(a.row.isOpen) || byUrgency(a, b));
  }, [signalled, filter, search]);
  const ids = useMemo(() => rows.map((item) => item.row.id), [rows]);

  const count = (f: Filter) => signalled.filter((item) => matchesFilter(f, item)).length;
  const openCount = disputes.filter((d) => d.isOpen).length;

  const selectedItem = rows.find((item) => item.row.id === selectedId) ?? (isWide ? rows[0] : undefined);
  const selected = selectedItem?.row;
  const signals = selectedItem?.signals;
  const effectiveId = selected?.id ?? null;
  const note = selected ? (notes[selected.id] ?? "") : "";
  const noPayment = selected?.hasPayment === false;
  // Settled and no-payment cases only take a recorded decision; held escrow takes release or refund.
  const recordOnly = !!selected && (noPayment || selected.paymentSettled);

  // Each job's chat is requested once; undefined in the cache means "loading".
  const requested = useRef(new Set<string>());
  const [retryTick, setRetryTick] = useState(0);
  const selectedJobId = selected?.jobId;
  useEffect(() => {
    if (!selectedJobId || requested.current.has(selectedJobId)) return;
    requested.current.add(selectedJobId);
    services
      .getJobConversation(selectedJobId)
      .then((messages) => setConversations((prev) => ({ ...prev, [selectedJobId]: messages })))
      .catch(() => setConversations((prev) => ({ ...prev, [selectedJobId]: "error" })));
  }, [selectedJobId, retryTick]);

  function retryConversation(jobId: string) {
    requested.current.delete(jobId);
    setConversations((prev) => omit(prev, jobId));
    setRetryTick((n) => n + 1);
  }

  // Payment protection only applies where there is a payment to hold. Job detail
  // (for the warranty window) is refreshed on live ticks; see useBookingDetailCache.
  const bookingJobId = selected && selected.hasPayment !== false ? selected.jobId : undefined;
  const booking = useBookingDetailCache(bookingJobId);
  const warranty = booking && booking !== "error" ? warrantyStatus(booking.completedAt, now) : null;

  async function handleResolve(id: string, resolution: Resolution) {
    setResolvingId(id);
    setConfirming(null);
    try {
      await resolveDispute(id, resolution, notes[id]?.trim() || undefined);
      setNotes((prev) => omit(prev, id));
      setDoneThisSession((n) => n + 1);
      setSelectedId(neighborAfterRemoval(ids, id));
      showToast(
        resolution === "REVIEWED" ? "Admin decision recorded. No money was moved." : resolution === "RELEASED_TO_PROVIDER" ? "Escrow released to the provider." : "Escrow refunded to the client.",
      );
    } catch {
      showToast("Could not resolve that dispute. Please try again.", "error");
    } finally {
      setResolvingId(null);
    }
  }

  async function requestClarification(id: string) {
    setResolvingId(id);
    try {
      await services.requestDisputeClarification(id, notes[id].trim());
      await refreshData();
      setNotes((prev) => omit(prev, id));
      showToast("Clarification requested from both participants.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not request clarification.", "error");
    } finally { setResolvingId(null); }
  }

  const noteTooLong = note.length > NOTE_MAX_LENGTH;
  const canDecide = !!selected?.isOpen && resolvingId === null && !noteTooLong && !!note.trim();

  useQueueKeys({
    ids,
    selectedId: effectiveId,
    onSelect: setSelectedId,
    onApprove: canDecide ? () => setConfirming({ id: selected!.id, resolution: recordOnly ? "REVIEWED" : "RELEASED_TO_PROVIDER" }) : undefined,
    onReject: canDecide && !recordOnly ? () => setConfirming({ id: selected!.id, resolution: "REFUNDED_TO_CLIENT" }) : undefined,
  });

  const confirmTarget = disputes.find((row) => row.id === confirming?.id);
  // Re-checked on every live refresh: release/refund only while a payment is held, a recorded decision only while open.
  const confirmValid =
    !!confirmTarget &&
    confirmTarget.isOpen &&
    (confirming?.resolution === "REVIEWED" || (confirmTarget.hasPayment !== false && !confirmTarget.paymentSettled));
  // A decision that is already in flight is never interrupted by a refresh.
  const confirmOpen = confirming !== null && (confirmValid || resolvingId !== null);
  const confirmStale = confirming !== null && !confirmValid && resolvingId === null;
  // A stale confirmation is dropped while rendering (React's "adjust state" pattern), so a
  // case that is reopened later never brings the old money dialog back.
  if (confirmStale) {
    setConfirming(null);
    setStaleCount((n) => n + 1);
  }
  useEffect(() => {
    if (staleCount > 0) showToast("This case was already resolved.", "error");
  }, [staleCount, showToast]);

  const emptyCopy = FILTER_EMPTY[filter];
  const emptyState = loading ? (
    <QueueListSkeleton />
  ) : disputes.length === 0 ? (
    <QueueListState icon={Scale} title="No disputes raised yet" description="Client complaints and provider appeals land here for review." />
  ) : emptyCopy && !search.trim() ? (
    <QueueListState icon={emptyCopy.icon} tone={emptyCopy.tone} title={emptyCopy.title} description={emptyCopy.description} />
  ) : (
    <QueueListState title="Nothing matches" description="Try a different search or filter." />
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Disputes"
        description="Review both sides and the job chat. Decide held escrow cases or record a decision for payments already settled."
      />

      <QueueShell
        showDetailOnNarrow={!!selectedId && !!selected}
        onBack={() => setSelectedId(null)}
        toolbar={
          <>
            <FilterTabs
              id="disputes"
              label="Filter disputes by queue"
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setSelectedId(null);
              }}
              options={[
                { value: "needs-decision", label: "Needs decision", count: count("needs-decision") },
                { value: "waiting", label: "Waiting on a party", count: count("waiting") },
                { value: "cancellations", label: "Cancellations", count: count("cancellations") },
                { value: "appeals", label: "Appeals", count: count("appeals") },
                { value: "resolved", label: "Resolved", count: count("resolved") },
                { value: "all", label: "All", count: count("all") },
              ]}
            />
            <SearchField value={search} onChange={setSearch} placeholder="Search by job, client, or provider…" label="Search disputes" />
            <QueueProgress remaining={openCount} done={doneThisSession} noun={openCount === 1 ? "case" : "cases"} />
          </>
        }
        list={
          <>
            {rows.length === 0 ? (
              emptyState
            ) : (
              <QueueList label="Disputes">
                {rows.map(({ row: d, signals: s }) => (
                  <QueueItem
                    key={d.id}
                    id={d.id}
                    selected={d.id === effectiveId}
                    onSelect={setSelectedId}
                    leading={
                      <span className={cn("grid size-9 place-items-center rounded-full", d.isOpen ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted-foreground")}>
                        <ShieldAlert className="size-4" />
                      </span>
                    }
                    title={d.jobTitle}
                    trailing={d.hasPayment !== false ? <span className="tabular text-[12px] font-semibold">{d.amount}</span> : undefined}
                    meta={`${d.clientName} vs ${d.providerName}`}
                    aside={
                      <span className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={KIND_TONE[s.kind]}>{KIND_LABEL[s.kind]}</Badge>
                          <UrgencyChip signals={s} />
                          <Badge tone={statusTone(d)} dot>{d.status}</Badge>
                        </span>
                        <span className="truncate text-[11.5px] text-muted-foreground">{d.reason} · {d.createdAt}</span>
                      </span>
                    }
                  />
                ))}
              </QueueList>
            )}
            <KeyHints approve={recordOnly ? "record" : "release"} reject={recordOnly ? undefined : "refund"} />
          </>
        }
        detail={
          selected && signals ? (
            <DetailCard
              key={selected.id}
              header={
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-semibold tracking-tight">{selected.jobTitle}</h2>
                    <Badge tone={KIND_TONE[signals.kind]}>{KIND_LABEL[signals.kind]}</Badge>
                    <Badge tone={statusTone(selected)} dot>{selected.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {selected.service} · Opened {selected.createdAt}
                  </p>
                </div>
              }
              footer={
                selected.isOpen ? (
                  <>
                    {!recordOnly && <Button
                      variant="outline"
                      className="border-warn/40 text-warn hover:bg-warn-soft"
                      onClick={() => setConfirming({ id: selected.id, resolution: "REFUNDED_TO_CLIENT" })}
                      disabled={!canDecide}
                    >
                      <RotateCcw /> Refund client
                    </Button>}
                    <Button
                      onClick={() => setConfirming({ id: selected.id, resolution: recordOnly ? "REVIEWED" : "RELEASED_TO_PROVIDER" })}
                      disabled={!canDecide}
                    >
                      <Check /> {noPayment ? "Record decision" : selected.paymentSettled ? "Record admin decision" : "Release to provider"}
                    </Button>
                  </>
                ) : undefined
              }
            >
              {/* Who's on each side, with the money in the middle. */}
              <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[12px] border border-border bg-surface-2/60 p-4">
                <Party label="Client" name={selected.clientName} />
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="text-[11px] text-subtle">{selected.hasPayment === false ? "No payment to settle" : selected.paymentSettled ? "Payment already settled" : "Payment under review"}</span>
                  {selected.hasPayment !== false && <span className="tabular text-[18px] font-semibold tracking-tight">{selected.amount}</span>}
                  <ArrowRight className="size-3.5 text-subtle" aria-hidden />
                </div>
                <Party label="Provider" name={selected.providerName} align="right" />
              </div>

              <DetailSection title="Reason for dispute">
                <p className="text-[13.5px] font-medium">{selected.reason}</p>
                {selected.details && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{selected.details}</p>}
              </DetailSection>

              {signals.kind === "cancellation" && (
                <DetailSection title="Cancellation request">
                  <FieldGrid>
                    <Field label="State">{cancellationStateLabel(selected.cancellationState ?? "")}</Field>
                    <Field label="Deadline">
                      <DeadlineValue iso={selected.cancellationDeadline} hoursToDeadline={signals.hoursToDeadline} open={selected.isOpen} />
                    </Field>
                  </FieldGrid>
                </DetailSection>
              )}

              {warranty && warranty.state !== "none" && (
                <DetailSection title="Payment protection">
                  {warranty.state === "open" ? (
                    <div className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-3 text-[13px]">
                      <p className="font-medium">Warranty open · {formatHoursLeft(warranty.hoursLeft)}</p>
                      <p className="mt-0.5 text-muted-foreground">A timely complaint blocks the release.</p>
                    </div>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">Warranty window closed</p>
                  )}
                </DetailSection>
              )}

              {selected.resolution && (
                <DetailSection title="Resolution">
                  <div className="flex items-start gap-2.5 rounded-[10px] bg-ok-soft px-3.5 py-3 text-[13px]">
                    <Gavel className="mt-0.5 size-4 shrink-0 text-ok" />
                    <div>
                      <div className="font-medium">
                        {selected.resolution} · {selected.resolvedAt}
                      </div>
                      {selected.resolutionNote && <div className="mt-0.5 text-muted-foreground">{selected.resolutionNote}</div>}
                    </div>
                  </div>
                </DetailSection>
              )}

              <DetailSection title="Statements, appeals and case activity">
                <CaseTimeline entries={selected.entries ?? []} clientName={selected.clientName} providerName={selected.providerName} />
              </DetailSection>

              <DetailSection title="Job conversation">
                <Conversation
                  state={conversations[selected.jobId]}
                  providerName={selected.providerName}
                  onRetry={() => retryConversation(selected.jobId)}
                />
              </DetailSection>

              {selected.isOpen && (
                <DetailSection title="Admin resolution note">
                  {selected.paymentSettled && <p>Payment already settled. Record your decision here; use Transactions → Issue Credit if compensation is approved.</p>}
                  <ReasonField
                    value={note}
                    onChange={(value) => setNotes((prev) => ({ ...prev, [selected.id]: value }))}
                    max={NOTE_MAX_LENGTH}
                    label="Resolution or clarification note (required)"
                    placeholder="Document the reason for the final decision…"
                  />
                  <Button variant="outline" disabled={!canDecide} onClick={() => void requestClarification(selected.id)}>Request clarification</Button>
                </DetailSection>
              )}
            </DetailCard>
          ) : (
            <DetailEmpty queueEmpty={rows.length === 0} title="Pick a case" description="Select a dispute on the left to read both sides and decide." />
          )
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        title={confirming?.resolution === "REVIEWED" ? "Record the admin decision?" : confirming?.resolution === "RELEASED_TO_PROVIDER" ? "Release escrow to the provider?" : "Refund escrow to the client?"}
        message={
          !confirmTarget || !confirming
            ? ""
            : confirming.resolution === "REVIEWED" ? "This case has no unsettled payment. Save the decision note without moving money. Any compensation must use the existing Issue Credit action." : confirming.resolution === "RELEASED_TO_PROVIDER"
              ? `Pay ${confirmTarget.amount} to ${confirmTarget.providerName}. This can't be undone.`
              : `Refund ${confirmTarget.amount} to ${confirmTarget.clientName}. This can't be undone.`
        }
        confirmLabel={confirming?.resolution === "REVIEWED" ? "Save decision" : confirming?.resolution === "RELEASED_TO_PROVIDER" ? "Release payment" : "Refund client"}
        danger={false}
        busy={resolvingId !== null}
        onConfirm={() => confirming && handleResolve(confirming.id, confirming.resolution)}
        onCancel={() => setConfirming(null)}
      >
        {confirming && notes[confirming.id]?.trim() && (
          <div className="rounded-[8px] bg-surface-2 px-3 py-2 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Note:</span> {notes[confirming.id].trim()}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

function UrgencyChip({ signals }: { signals: CaseSignals }) {
  if (signals.urgency === "overdue") return <Badge tone="danger">Overdue</Badge>;
  if (signals.urgency === "soon") return <Badge tone="warn">{dueLabel(signals.hoursToDeadline)}</Badge>;
  if (signals.urgency === "waiting") return <Badge tone="neutral">Waiting on a party</Badge>;
  return null;
}

/** The deadline's date, with how long is left or how long it is overdue while the case is open. */
function DeadlineValue({ iso, hoursToDeadline, open }: { iso: string | null; hoursToDeadline: number | null; open: boolean }) {
  if (!iso) return <span>No deadline set</span>;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return <span>Unknown deadline</span>;
  const countdown = open && hoursToDeadline !== null ? hoursToDeadline : null;
  return (
    <>
      <span>{when.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      {countdown !== null && (
        <span className={cn("ml-2", countdown < 0 ? "text-danger" : "text-muted-foreground")}>
          {countdown < 0 ? `overdue by ${durationText(-countdown)}` : formatHoursLeft(countdown)}
        </span>
      )}
    </>
  );
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function Party({ label, name, align = "left" }: { label: string; name: string; align?: "left" | "right" }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", align === "right" && "flex-row-reverse text-right")}>
      <Avatar initials={initialsOf(name)} tone={align === "right" ? "accent" : "neutral"} />
      <div className="min-w-0">
        <div className="text-[11px] text-subtle">{label}</div>
        <div className="truncate text-[13px] font-medium">{name}</div>
      </div>
    </div>
  );
}

function Conversation({
  state,
  providerName,
  onRetry,
}: {
  state: ConversationState | undefined;
  providerName: string;
  onRetry: () => void;
}) {
  if (state === undefined) {
    return (
      <div className="space-y-2" aria-label="Loading conversation">
        {[60, 44, 70].map((w, i) => (
          <div key={i} className={cn("h-9 rounded-[10px] bg-surface-2 motion-safe:animate-pulse", i % 2 && "ml-auto")} style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
        Could not load the conversation.
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger/10" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (state.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3.5 py-3 text-[12.5px] text-muted-foreground">
        <MessagesSquare className="size-4" /> No messages in this job&apos;s chat.
      </div>
    );
  }
  return (
    <ol className="max-h-[320px] space-y-2.5 overflow-y-auto rounded-[10px] border border-border bg-surface-2/50 p-3">
      {state.map((m) => {
        const fromProvider = m.senderName === providerName;
        return (
          <li key={m.id} className={cn("flex flex-col", fromProvider ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-[12px] px-3 py-2 text-[13px] leading-relaxed",
                fromProvider ? "rounded-br-[4px] bg-primary-soft text-foreground" : "rounded-bl-[4px] border border-border bg-surface",
              )}
            >
              {m.body}
              {m.attachmentUrl && <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="block underline">View job photo</a>}
            </div>
            <span className="mt-0.5 px-1 text-[11px] text-subtle">
              {m.senderName} · {new Date(m.createdAt).toLocaleString()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
