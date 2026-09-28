"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CircleSlash, RefreshCw, WalletCards, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, ReasonField } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/Panel";
import { AnimatedNumber } from "@/components/admin/AnimatedNumber";
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
import { getWithdrawals, rejectWithdrawal, settleWithdrawal } from "@/lib/services";
import type { AdminWithdrawal } from "@/lib/domain";
import { formatCurrency, formatDate } from "@/lib/adapters";

type QueueStatus = "pending" | "completed" | "failed";

const REASON_MAX = 500;
const STATUS_META: Record<string, { label: string; tone: "warn" | "ok" | "danger" | "neutral" }> = {
  pending: { label: "Needs review", tone: "warn" },
  completed: { label: "Settled", tone: "ok" },
  failed: { label: "Rejected", tone: "danger" },
};

export function WithdrawalsPage() {
  const { showToast } = useToast();
  const isWide = useIsWide();
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [items, setItems] = useState<AdminWithdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settling, setSettling] = useState<AdminWithdrawal | null>(null);
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneThisSession, setDoneThisSession] = useState(0);

  // Only the newest request may write state: switching tabs (or a live tick)
  // while an older request is slow must not fill this tab with another's rows.
  const requestSeq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const seq = ++requestSeq.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await getWithdrawals(status);
      if (seq !== requestSeq.current) return;
      setItems(result.items);
      setTotal(result.total);
    } catch {
      if (seq !== requestSeq.current) return;
      setError("Could not load withdrawal requests. The backend may still be deploying.");
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
    return items.filter(
      (i) => i.profileName.toLowerCase().includes(q) || (i.destination ?? "").toLowerCase().includes(q) || i.title.toLowerCase().includes(q),
    );
  }, [items, search]);
  const ids = useMemo(() => filtered.map((i) => i.id), [filtered]);
  const selected = filtered.find((i) => i.id === selectedId) ?? (isWide ? filtered[0] : undefined);
  const effectiveId = selected?.id ?? null;
  const amountInView = items.reduce((sum, item) => sum + item.amount, 0);

  function afterDecision(id: string) {
    setSelectedId(neighborAfterRemoval(ids, id));
    // Drop it locally right away; the quiet reload then confirms from the server.
    setItems((prev) => prev.filter((i) => i.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    setDoneThisSession((n) => n + 1);
  }

  async function confirmSettle() {
    if (!settling) return;
    const id = settling.id;
    setBusy(true);
    try {
      await settleWithdrawal(id, reference);
      showToast("Withdrawal marked as paid.");
      setSettling(null);
      setReference("");
      afterDecision(id);
      await load(true);
    } catch {
      showToast("Could not settle this withdrawal. Check the balance and try again.", "error");
    } finally { setBusy(false); }
  }

  async function confirmReject() {
    if (!rejecting || !reason.trim()) return;
    const id = rejecting.id;
    setBusy(true);
    try {
      await rejectWithdrawal(id, reason);
      showToast("Withdrawal rejected.");
      setRejecting(null);
      setReason("");
      afterDecision(id);
      await load(true);
    } catch {
      showToast("Could not reject this withdrawal. Please try again.", "error");
    } finally { setBusy(false); }
  }

  function openSettle(item: AdminWithdrawal) { setSettling(item); setReference(""); }
  function openReject(item: AdminWithdrawal) { setRejecting(item); setReason(""); }

  const pending = selected?.status === "pending";
  useQueueKeys({
    ids,
    selectedId: effectiveId,
    onSelect: setSelectedId,
    onApprove: pending && !busy ? () => openSettle(selected!) : undefined,
    onReject: pending && !busy ? () => openReject(selected!) : undefined,
  });

  const listBody = loading ? (
    <QueueListSkeleton />
  ) : error ? (
    <QueueListState icon={AlertTriangle} tone="danger" title="Couldn't load withdrawals" description={error} action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>} />
  ) : filtered.length === 0 ? (
    items.length > 0 ? (
      <QueueListState title="Nothing matches" description="Try a different search." />
    ) : status === "pending" ? (
      <QueueListState icon={CheckCircle2} tone="ok" title="No withdrawals waiting" description="New payout requests from providers will appear here." />
    ) : (
      <QueueListState icon={CircleSlash} title={`No ${STATUS_META[status].label.toLowerCase()} withdrawals`} />
    )
  ) : (
    <QueueList label="Withdrawal requests">
      {filtered.map((item) => (
        <QueueItem
          key={item.id}
          id={item.id}
          selected={item.id === effectiveId}
          onSelect={setSelectedId}
          leading={<Avatar initials={initialsOf(item.profileName)} tone={item.status === "pending" ? "warn" : "neutral"} />}
          title={item.profileName}
          trailing={<span className="tabular text-[13px] font-semibold">{formatCurrency(item.amount)}</span>}
          meta={item.destination ?? "No destination provided"}
          aside={
            <span className="flex items-center gap-2">
              <Badge tone={STATUS_META[item.status]?.tone ?? "neutral"} dot>{STATUS_META[item.status]?.label ?? item.status}</Badge>
              <span className="text-[11.5px] text-muted-foreground">{formatDate(item.createdAt)}</span>
            </span>
          }
        />
      ))}
    </QueueList>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Withdrawals"
        description="Review payout requests and record payouts made outside the platform."
        actions={
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); void load(true); }} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[auto_auto_1fr]">
        <Stat icon={Banknote} label="Waiting for review" tone={status === "pending" && total > 0 ? "warn" : "neutral"}>
          {status === "pending" ? <AnimatedNumber value={total} /> : "—"}
        </Stat>
        <Stat icon={WalletCards} label="Amount in this view">
          <AnimatedNumber value={amountInView} format={formatCurrency} />
        </Stat>
        <div className="flex items-center gap-2.5 rounded-[12px] border border-warn/25 bg-warn-soft px-4 py-3 text-[12.5px] leading-relaxed text-warn">
          <AlertTriangle className="size-4 shrink-0" />
          Only mark a request paid after the money has actually moved.
        </div>
      </div>

      <QueueShell
        showDetailOnNarrow={!!selectedId && !!selected}
        onBack={() => setSelectedId(null)}
        toolbar={
          <>
            <FilterTabs
              id="withdrawals"
              label="Filter withdrawals by status"
              value={status}
              onChange={(s) => { setStatus(s); setSelectedId(null); }}
              options={[
                { value: "pending", label: "Needs review" },
                { value: "completed", label: "Settled" },
                { value: "failed", label: "Rejected" },
              ]}
            />
            <SearchField value={search} onChange={setSearch} placeholder="Search by name or destination…" label="Search withdrawals" />
            {status === "pending" ? (
              <QueueProgress remaining={total} done={doneThisSession} noun={total === 1 ? "request" : "requests"} />
            ) : (
              <span className="text-[12px] text-muted-foreground tabular">{total.toLocaleString()} request{total === 1 ? "" : "s"}</span>
            )}
          </>
        }
        list={<>{listBody}<KeyHints approve="settle" reject="reject" /></>}
        detail={
          selected ? (
            <DetailCard
              key={selected.id}
              header={
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <Avatar initials={initialsOf(selected.profileName)} size="lg" tone="neutral" />
                    <div className="min-w-0">
                      <h2 className="truncate text-[17px] font-semibold tracking-tight">{selected.profileName}</h2>
                      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{selected.title}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-[22px] font-semibold tracking-tight">{formatCurrency(selected.amount)}</div>
                    <Badge tone={STATUS_META[selected.status]?.tone ?? "neutral"} dot className="mt-1">
                      {STATUS_META[selected.status]?.label ?? selected.status}
                    </Badge>
                  </div>
                </div>
              }
              footer={
                selected.status === "pending" ? (
                  <>
                    <Button variant="destructive-outline" onClick={() => openReject(selected)} disabled={busy}>
                      <XCircle /> Reject
                    </Button>
                    <Button onClick={() => openSettle(selected)} disabled={busy}>
                      <CheckCircle2 /> Mark as paid
                    </Button>
                  </>
                ) : undefined
              }
            >
              <DetailSection title="Payout">
                <FieldGrid>
                  <Field label="Send to">{selected.destination ?? "Not provided"}</Field>
                  <Field label="Requested">{formatDate(selected.createdAt)}</Field>
                  {selected.reviewedAt && <Field label="Reviewed">{formatDate(selected.reviewedAt)}</Field>}
                  {selected.status !== "pending" && <Field label="Review note">{selected.reviewNote ?? "—"}</Field>}
                </FieldGrid>
              </DetailSection>
              {selected.status === "pending" && (
                <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  Send the money through GCash or the bank first, then mark it paid with the reference. Rejecting returns the reserved amount to the provider&apos;s available balance.
                </p>
              )}
            </DetailCard>
          ) : (
            <DetailEmpty queueEmpty={filtered.length === 0} title="Pick a request" description="Select a withdrawal on the left to see where the money goes and settle it." />
          )
        }
      />

      <ConfirmDialog open={!!settling} title="Mark withdrawal as paid?" message={settling ? `${settling.profileName} will be told that ${formatCurrency(settling.amount)} was sent.` : ""} confirmLabel="Mark as paid" cancelLabel="Keep pending" danger={false} busy={busy} onConfirm={() => void confirmSettle()} onCancel={() => !busy && setSettling(null)}>
        <label className="block text-[12px] font-medium text-muted-foreground">
          Payout reference <span className="font-normal text-subtle">(optional)</span>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="GCash / bank reference" className="mt-1.5" />
        </label>
      </ConfirmDialog>
      <ConfirmDialog open={!!rejecting} title="Reject withdrawal?" message="The requester will be notified and the reserved amount will return to their available balance." confirmLabel="Reject withdrawal" busy={busy} confirmDisabled={!reason.trim() || reason.length > REASON_MAX} onConfirm={() => void confirmReject()} onCancel={() => !busy && setRejecting(null)}>
        <ReasonField autoFocus required value={reason} onChange={setReason} max={REASON_MAX} label="Reason" placeholder="Explain why this request cannot be paid" />
      </ConfirmDialog>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  tone = "neutral",
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "warn" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[180px] rounded-[12px] border border-border bg-surface px-4 py-3 shadow-ui-sm">
      <div className={`flex items-center gap-1.5 text-[12px] ${tone === "warn" ? "text-warn" : "text-muted-foreground"}`}>
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 tabular text-[22px] font-semibold tracking-tight">{children}</div>
    </div>
  );
}
