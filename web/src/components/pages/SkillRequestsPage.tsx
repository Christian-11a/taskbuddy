"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CheckCircle2, PlusCircle, RefreshCw, Wrench, XCircle } from "lucide-react";
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
import { approveSkillRequest, getSkillRequests, rejectSkillRequest } from "@/lib/services";
import type { SkillRequest, SkillRequestStatus } from "@/lib/domain";
import { formatDate } from "@/lib/adapters";

type QueueStatus = Exclude<SkillRequestStatus, "cancelled">;

const NOTE_MAX = 500;

const TYPE_LABEL: Record<SkillRequest["type"], string> = {
  change_primary: "Change main service",
  add_secondary: "Add a service",
};

const STATUS_META: Record<QueueStatus, { label: string; tone: "warn" | "ok" | "danger" }> = {
  pending: { label: "Needs review", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
};

/**
 * Providers can no longer change their own service (QA, Sep 2026): they ask
 * from the app's My Services screen, and an admin decides here. Approving a
 * main-service change swaps it on their profile; approving an extra service
 * adds it. Either way the provider is notified.
 */
export function SkillRequestsPage() {
  const { showToast } = useToast();
  const isWide = useIsWide();
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [items, setItems] = useState<SkillRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approving, setApproving] = useState<SkillRequest | null>(null);
  const [rejecting, setRejecting] = useState<SkillRequest | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneThisSession, setDoneThisSession] = useState(0);

  // Only the newest request may write state (see WithdrawalsPage).
  const requestSeq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const seq = ++requestSeq.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const rows = await getSkillRequests(status);
      if (seq !== requestSeq.current) return;
      setItems(rows);
    } catch {
      if (seq !== requestSeq.current) return;
      setError("Could not load service requests. The backend may still be deploying.");
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [status]);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch is an
     external-system synchronization; the state updates happen in its async
     continuation. */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useLiveTick(() => void load(true));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.providerName.toLowerCase().includes(q) || i.categoryName.toLowerCase().includes(q));
  }, [items, search]);
  const ids = useMemo(() => filtered.map((i) => i.id), [filtered]);
  const selected = filtered.find((i) => i.id === selectedId) ?? (isWide ? filtered[0] : undefined);
  const effectiveId = selected?.id ?? null;

  async function decide(kind: "approve" | "reject") {
    const target = kind === "approve" ? approving : rejecting;
    if (!target) return;
    setBusy(true);
    try {
      if (kind === "approve") await approveSkillRequest(target.id, note.trim() || undefined);
      else await rejectSkillRequest(target.id, note.trim() || undefined);
      showToast(kind === "approve" ? "Request approved." : "Request rejected.");
      setApproving(null);
      setRejecting(null);
      setNote("");
      setSelectedId(neighborAfterRemoval(ids, target.id));
      setItems((prev) => prev.filter((i) => i.id !== target.id));
      setDoneThisSession((n) => n + 1);
      await load(true);
    } catch {
      showToast("Could not update this request. It may already have been decided.", "error");
    } finally {
      setBusy(false);
    }
  }

  function openApprove(item: SkillRequest) { setApproving(item); setNote(""); }
  function openReject(item: SkillRequest) { setRejecting(item); setNote(""); }

  const pending = selected?.status === "pending";
  useQueueKeys({
    ids,
    selectedId: effectiveId,
    onSelect: setSelectedId,
    onApprove: pending && !busy ? () => openApprove(selected!) : undefined,
    onReject: pending && !busy ? () => openReject(selected!) : undefined,
  });

  const listBody = loading ? (
    <QueueListSkeleton />
  ) : error ? (
    <QueueListState icon={AlertTriangle} tone="danger" title="Couldn't load service requests" description={error} action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>} />
  ) : filtered.length === 0 ? (
    items.length > 0 ? (
      <QueueListState title="Nothing matches" description="Try a different search." />
    ) : (
      <QueueListState
        icon={status === "pending" ? CheckCircle2 : Wrench}
        tone={status === "pending" ? "ok" : "neutral"}
        title={status === "pending" ? "No requests waiting for review" : `No ${status} requests`}
      />
    )
  ) : (
    <QueueList label="Service requests">
      {filtered.map((item) => (
        <QueueItem
          key={item.id}
          id={item.id}
          selected={item.id === effectiveId}
          onSelect={setSelectedId}
          leading={<Avatar initials={initialsOf(item.providerName)} tone={item.status === "pending" ? "accent" : "neutral"} />}
          title={item.providerName}
          trailing={<span className="text-[11.5px] text-subtle">{formatDate(item.createdAt)}</span>}
          meta={`${TYPE_LABEL[item.type]} → ${item.categoryName}`}
          aside={<Badge tone={STATUS_META[item.status as QueueStatus]?.tone ?? "neutral"} dot>{STATUS_META[item.status as QueueStatus]?.label ?? item.status}</Badge>}
        />
      ))}
    </QueueList>
  );

  const TypeIcon = selected?.type === "change_primary" ? ArrowRightLeft : PlusCircle;

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Service requests"
        description="Providers asking to change their main service or add another one."
        actions={
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); void load(true); }} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <QueueShell
        showDetailOnNarrow={!!selectedId && !!selected}
        onBack={() => setSelectedId(null)}
        toolbar={
          <>
            <FilterTabs
              id="skill-requests"
              label="Filter service requests by status"
              value={status}
              onChange={(s) => { setStatus(s); setSelectedId(null); }}
              options={[
                { value: "pending", label: "Needs review" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
            <SearchField value={search} onChange={setSearch} placeholder="Search by provider or service…" label="Search service requests" />
            {status === "pending" ? (
              <QueueProgress remaining={items.length} done={doneThisSession} noun={items.length === 1 ? "request" : "requests"} />
            ) : (
              <span className="tabular text-[12px] text-muted-foreground">{items.length.toLocaleString()} request{items.length === 1 ? "" : "s"}</span>
            )}
          </>
        }
        list={
          <>
            {listBody}
            {/* GET /admin/skill-requests caps at 100 rows and has no paging
                (backend-owned; see README). Say so rather than imply "all". */}
            {items.length >= 100 && (
              <p className="border-t border-border bg-warn-soft px-3.5 py-2 text-[12px] text-warn">
                Showing the first 100 requests — the server doesn&apos;t return more yet.
              </p>
            )}
            <KeyHints approve="approve" reject="reject" />
          </>
        }
        detail={
          selected ? (
            <DetailCard
              key={selected.id}
              header={
                <div className="flex items-start gap-3.5">
                  <Avatar initials={initialsOf(selected.providerName)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[17px] font-semibold tracking-tight">{selected.providerName}</h2>
                      <Badge tone={STATUS_META[selected.status as QueueStatus]?.tone ?? "neutral"} dot>
                        {STATUS_META[selected.status as QueueStatus]?.label ?? selected.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">Sent {formatDate(selected.createdAt)}</p>
                  </div>
                </div>
              }
              footer={
                selected.status === "pending" ? (
                  <>
                    <Button variant="destructive-outline" onClick={() => openReject(selected)} disabled={busy}>
                      <XCircle /> Reject
                    </Button>
                    <Button onClick={() => openApprove(selected)} disabled={busy}>
                      <CheckCircle2 /> Approve
                    </Button>
                  </>
                ) : undefined
              }
            >
              <div className="mb-6 flex items-center gap-3.5 rounded-[12px] border border-border bg-surface-2/60 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary-soft text-primary">
                  <TypeIcon className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] text-muted-foreground">{TYPE_LABEL[selected.type]}</div>
                  <div className="text-[16px] font-semibold tracking-tight">{selected.categoryName}</div>
                </div>
              </div>
              <DetailSection title="Why they qualify">
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed">{selected.reason}</p>
              </DetailSection>
              {selected.status !== "pending" && (
                <DetailSection title="Decision">
                  <FieldGrid>
                    <Field label="Outcome">{STATUS_META[selected.status as QueueStatus]?.label ?? selected.status}</Field>
                    <Field label="Note to provider">{selected.reviewNote ?? "—"}</Field>
                  </FieldGrid>
                </DetailSection>
              )}
            </DetailCard>
          ) : (
            <DetailEmpty queueEmpty={filtered.length === 0} title="Pick a request" description="Select a request on the left to read why the provider qualifies." />
          )
        }
      />

      <ConfirmDialog
        open={!!approving}
        title="Approve this request?"
        message={approving ? (approving.type === "change_primary"
          ? `${approving.providerName}'s main service becomes ${approving.categoryName}.`
          : `${approving.categoryName} is added to ${approving.providerName}'s services.`) : ""}
        confirmLabel="Approve"
        danger={false}
        busy={busy}
        confirmDisabled={note.length > NOTE_MAX}
        onConfirm={() => void decide("approve")}
        onCancel={() => !busy && setApproving(null)}
      >
        <ReasonField value={note} onChange={setNote} max={NOTE_MAX} label="Note to the provider (optional)" placeholder="Note to the provider (optional)" />
      </ConfirmDialog>
      <ConfirmDialog
        open={!!rejecting}
        title="Reject this request?"
        message="The provider will be notified and can send a new request."
        confirmLabel="Reject request"
        busy={busy}
        confirmDisabled={!note.trim() || note.length > NOTE_MAX}
        onConfirm={() => void decide("reject")}
        onCancel={() => !busy && setRejecting(null)}
      >
        <ReasonField autoFocus required value={note} onChange={setNote} max={NOTE_MAX} label="Reason" placeholder="Tell the provider what's missing" />
      </ConfirmDialog>
    </div>
  );
}
