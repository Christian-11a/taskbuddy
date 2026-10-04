"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Avatar,
  DetailCard,
  DetailEmpty,
  DetailSection,
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
import { cn } from "@/lib/utils";

type Filter = "all" | "open" | "resolved" | "cancelled";
type Resolution = "RELEASED_TO_PROVIDER" | "REFUNDED_TO_CLIENT" | "REVIEWED";
type ConversationState = ConversationMessage[] | "error";

function statusTone(d: DisputeRow) {
  if (d.isOpen) return "warn" as const;
  if (d.status === "Resolved") return "ok" as const;
  return "neutral" as const;
}

export function DisputesPage() {
  const { disputes, resolveDispute, refreshData, loading } = useApp();
  const { showToast } = useToast();
  const isWide = useIsWide();
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; resolution: Resolution } | null>(null);
  // Notes are kept per dispute, so moving between cases never loses a draft
  // and opening the confirm step never wipes what was typed.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [doneThisSession, setDoneThisSession] = useState(0);
  // GET /admin/jobs/:jobId/conversation (migration 0014) — read-only, fetched
  // when a case is opened and cached by job id.
  const [conversations, setConversations] = useState<Record<string, ConversationState>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return disputes.filter((d) => {
      const matchFilter = filter === "all" || d.status.toLowerCase() === filter;
      const matchSearch =
        !q ||
        d.jobTitle.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q) ||
        d.providerName.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [disputes, filter, search]);
  const ids = useMemo(() => filtered.map((d) => d.id), [filtered]);

  const counts = {
    all: disputes.length,
    open: disputes.filter((d) => d.isOpen).length,
    resolved: disputes.filter((d) => d.status === "Resolved").length,
    cancelled: disputes.filter((d) => d.status === "Cancelled").length,
  };

  const selected = filtered.find((d) => d.id === selectedId) ?? (isWide ? filtered[0] : undefined);
  const effectiveId = selected?.id ?? null;
  const note = selected ? (notes[selected.id] ?? "") : "";

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
    onApprove: canDecide ? () => setConfirming({ id: selected!.id, resolution: selected!.paymentSettled ? "REVIEWED" : "RELEASED_TO_PROVIDER" }) : undefined,
    onReject: canDecide && !selected?.paymentSettled ? () => setConfirming({ id: selected!.id, resolution: "REFUNDED_TO_CLIENT" }) : undefined,
  });

  const confirmTarget = disputes.find((row) => row.id === confirming?.id);

  const emptyState = loading ? (
    <QueueListSkeleton />
  ) : disputes.length === 0 ? (
    <QueueListState icon={Scale} title="No disputes raised yet" description="Client complaints and provider appeals land here for review." />
  ) : filter === "open" && counts.open === 0 && !search ? (
    <QueueListState icon={Check} tone="ok" title="No open disputes" description="Every case has been decided." />
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
              label="Filter disputes by status"
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setSelectedId(null);
              }}
              options={[
                { value: "open", label: "Open", count: counts.open },
                { value: "resolved", label: "Resolved", count: counts.resolved },
                { value: "cancelled", label: "Cancelled", count: counts.cancelled },
                { value: "all", label: "All", count: counts.all },
              ]}
            />
            <SearchField value={search} onChange={setSearch} placeholder="Search by job, client, or provider…" label="Search disputes" />
            <QueueProgress remaining={counts.open} done={doneThisSession} noun={counts.open === 1 ? "case" : "cases"} />
          </>
        }
        list={
          <>
            {filtered.length === 0 ? (
              emptyState
            ) : (
              <QueueList label="Disputes">
                {filtered.map((d) => (
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
                    trailing={<span className="tabular text-[12px] font-semibold">{d.amount}</span>}
                    meta={`${d.clientName} vs ${d.providerName}`}
                    aside={
                      <span className="flex items-center gap-2">
                        <Badge tone={statusTone(d)} dot>{d.status}</Badge>
                        <span className="truncate text-[11.5px] text-muted-foreground">{d.reason} · {d.createdAt}</span>
                      </span>
                    }
                  />
                ))}
              </QueueList>
            )}
            <KeyHints approve="release" reject="refund" />
          </>
        }
        detail={
          selected ? (
            <DetailCard
              key={selected.id}
              header={
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-semibold tracking-tight">{selected.jobTitle}</h2>
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
                    {!selected.paymentSettled && <Button
                      variant="outline"
                      className="border-warn/40 text-warn hover:bg-warn-soft"
                      onClick={() => setConfirming({ id: selected.id, resolution: "REFUNDED_TO_CLIENT" })}
                      disabled={!canDecide}
                    >
                      <RotateCcw /> Refund client
                    </Button>}
                    <Button
                      onClick={() => setConfirming({ id: selected.id, resolution: selected.paymentSettled ? "REVIEWED" : "RELEASED_TO_PROVIDER" })}
                      disabled={!canDecide}
                    >
                      <Check /> {selected.paymentSettled ? "Record admin decision" : "Release to provider"}
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
                  <span className="tabular text-[18px] font-semibold tracking-tight">{selected.amount}</span>
                  <ArrowRight className="size-3.5 text-subtle" aria-hidden />
                </div>
                <Party label="Provider" name={selected.providerName} align="right" />
              </div>

              <DetailSection title="Reason for dispute">
                <p className="text-[13.5px] font-medium">{selected.reason}</p>
                {selected.details && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{selected.details}</p>}
              </DetailSection>

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
                <ol className="space-y-3">
                  {(selected.entries ?? []).map((entry) => <li key={entry.id} className="rounded border border-border p-3">
                    <p className="text-sm font-medium">{entry.author?.full_name ?? "System"} · {entry.kind}</p>
                    <p className="whitespace-pre-wrap text-sm">{entry.body}</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</p>
                    {entry.message?.body && <p className="text-sm">Job chat evidence: {entry.message.body}</p>}
                    {entry.attachment_url && <a href={entry.attachment_url} target="_blank" rel="noreferrer">View photo evidence</a>}
                  </li>)}
                </ol>
                {!selected.entries?.length && <p className="text-sm text-muted-foreground">No additional case activity recorded.</p>}
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
            <DetailEmpty queueEmpty={filtered.length === 0} title="Pick a case" description="Select a dispute on the left to read both sides and decide." />
          )
        }
      />

      <ConfirmDialog
        open={confirming !== null}
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
