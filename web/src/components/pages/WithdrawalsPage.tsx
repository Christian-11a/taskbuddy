"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import * as services from "@/lib/services";
import { ApiError } from "@/lib/api/client";
import { RETRY_OUTCOME_MESSAGE, isXenditPayoutFailure, payoutHeadline, TRANSFER_STATUS_DISPLAY, formatCurrency, formatDate } from "@/lib/adapters";
import type { AdminWithdrawal, Transaction } from "@/lib/domain";
import type { PayoutFailures } from "@/lib/services";
import { useApp } from "@/context/AppContext";
import { useLiveTick } from "@/hooks/useLiveTick";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/Panel";
import { toneFromBadgeClass } from "@/components/admin/tones";
import { DataTable, LoadFailedState, RefreshFailedBanner, SummaryStrip, TableCard, TableEmpty, type Column } from "@/components/admin/table";

const OLD_STATUS: Record<string, { label: string; tone: "warn" | "ok" | "danger" | "neutral" }> = {
  pending: { label: "Was waiting", tone: "warn" },
  completed: { label: "Paid", tone: "ok" },
  failed: { label: "Not paid", tone: "danger" },
};

/** Why an older card payout did not go out, in plain words. The payment service's own error comes first when there is one. */
function cardFailureReason(t: Transaction): string {
  if (t.transferError) return t.transferError;
  if (t.transferStatus === "not_eligible") return "The provider has not finished setting up a payout account.";
  if (t.transferStatus === "abandoned") return "Automatic retries ran out.";
  return "The payout was refused.";
}

/** The payment provider's refusal note without its "Xendit:" prefix. */
function payoutReason(w: AdminWithdrawal): string {
  const text = (w.reviewNote ?? "").replace(/^\s*Xendit:\s*/i, "").trim();
  return text || "No reason given";
}

export function WithdrawalsPage() {
  const { showToast } = useToast();
  const { refreshCounts } = useApp();
  const [split, setSplit] = useState<PayoutFailures>({ unresolved: [], resolved: [], providers: [], owed: [] });
  const items = split.unresolved;
  const [cardItems, setCardItems] = useState<Transaction[]>([]);
  const [cardFailed, setCardFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Only the newest request may write state (a live tick can overlap a slow one).
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    // The older card list is secondary: if it cannot load, the main list still shows.
    const cardRead = services.getFailedCardPayouts().catch(() => null);
    try {
      const result = await services.getPayoutFailures();
      const card = await cardRead;
      if (seq !== requestSeq.current) return;
      setSplit(result);
      if (card) setCardItems(card);
      setCardFailed(!card);
      setLoadFailed(false);
    } catch {
      if (seq !== requestSeq.current) return;
      setLoadFailed(true);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch; state is set in its async continuation. */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useLiveTick(() => void load());

  async function retry(t: Transaction) {
    setRetryingId(t.id);
    try {
      const outcome = await services.retryEscrowTransfer(t.id);
      showToast(RETRY_OUTCOME_MESSAGE[outcome], outcome === "transferred" ? "success" : "error");
      await load();
      void refreshCounts();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not retry the payout.", "error");
    } finally {
      setRetryingId(null);
    }
  }

  const headline = payoutHeadline(split.owed, cardItems);

  const columns: Column<AdminWithdrawal>[] = [
    { id: "provider", header: "Provider", cell: (w) => <span className="font-medium">{w.profileName}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (w) => <span className="tabular font-semibold">{formatCurrency(w.amount)}</span> },
    { id: "date", header: "Date", hideBelow: "md", cell: (w) => <span className="tabular text-muted-foreground">{formatDate(w.createdAt)}</span> },
    { id: "reason", header: "Why it failed", cell: (w) => <span className="block max-w-[360px] text-[12.5px] text-muted-foreground">{payoutReason(w)}</span> },
  ];

  const cardColumns: Column<Transaction>[] = [
    { id: "provider", header: "Provider", cell: (t) => <span className="font-medium">{t.providerName}</span> },
    {
      id: "job",
      header: "Job",
      hideBelow: "md",
      cell: (t) => (
        <span className="text-muted-foreground">
          {t.service} <span className="font-mono text-[11.5px]" title={t.jobId}>{t.jobId.slice(0, 8)}</span>
        </span>
      ),
    },
    { id: "amount", header: "Amount", align: "right", cell: (t) => <span className="tabular font-semibold">{formatCurrency(t.amount)}</span> },
    {
      id: "reason",
      header: "Why it failed",
      cell: (t) => (
        <div className="max-w-[320px]">
          <Badge tone={toneFromBadgeClass(TRANSFER_STATUS_DISPLAY[t.transferStatus].badgeClass)}>{TRANSFER_STATUS_DISPLAY[t.transferStatus].label}</Badge>
          <div className="mt-1 text-[12px] text-muted-foreground">{cardFailureReason(t)}</div>
        </div>
      ),
    },
    { id: "date", header: "When", hideBelow: "lg", cell: (t) => <span className="tabular text-muted-foreground">{formatDate(t.date)}</span> },
    {
      id: "retry",
      header: "",
      align: "right",
      cell: (t) => (
        <Button size="sm" variant="outline" onClick={() => void retry(t)} disabled={retryingId !== null} aria-label={`Retry payout for ${t.providerName}, ${formatCurrency(t.amount)}`}>
          <RefreshCw className={retryingId === t.id ? "animate-spin" : ""} /> {retryingId === t.id ? "Retrying…" : "Retry"}
        </Button>
      ),
    },
  ];

  const historyColumns: Column<{ withdrawal: AdminWithdrawal; paidAt: string }>[] = [
    { id: "provider", header: "Provider", cell: (r) => <span className="font-medium">{r.withdrawal.profileName}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (r) => <span className="tabular font-semibold">{formatCurrency(r.withdrawal.amount)}</span> },
    { id: "date", header: "Failed on", hideBelow: "md", cell: (r) => <span className="tabular text-muted-foreground">{formatDate(r.withdrawal.createdAt)}</span> },
    { id: "reason", header: "Why it failed", cell: (r) => <span className="block max-w-[360px] text-[12.5px] text-muted-foreground">{payoutReason(r.withdrawal)}</span> },
    { id: "paid", header: "Later", cell: (r) => <span className="text-[12.5px] text-ok">Paid later, {formatDate(r.paidAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Failed payouts"
        description="When a client confirms a job, the provider is paid automatically to their linked payout account. Payouts the payment provider refused show here."
        actions={
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <SummaryStrip
        items={[
          { label: headline.count === 1 ? "provider not yet paid" : "providers not yet paid", value: headline.count.toLocaleString() },
          {
            label: "waiting to be paid",
            value: formatCurrency(headline.total),
          },
        ]}
      />

      {(split.providers.length > 0 || cardItems.length > 0) && (
        <p className="-mt-2 mb-4 text-[12px] text-muted-foreground">
          Each automatic payout sends the provider&apos;s whole wallet balance, so the amount waiting is each provider&apos;s current balance, not the failed amounts.
          {cardItems.length > 0 && " Older card payouts add the amount shown for each."}
          {split.providers.length > split.owed.length && " Providers with nothing left to send are listed below but not counted."}
        </p>
      )}

      {cardFailed && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 text-[13px]">
          <span>Couldn&apos;t load older card payouts. The totals above leave them out.</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}

      <TableCard>
        {loadFailed && items.length > 0 && <RefreshFailedBanner noun="failed payouts" onRetry={() => void load()} />}
        <DataTable
          label="Failed payouts table"
          columns={columns}
          rows={items}
          getRowId={(w) => w.id}
          minWidth={560}
          empty={
            loadFailed && !loading ? (
              <LoadFailedState noun="failed payouts" onRetry={() => void load()} />
            ) : (
              <TableEmpty>
                {loading ? (
                  "Loading failed payouts…"
                ) : (
                  <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-ok" aria-hidden /> No failed payouts. Providers are being paid automatically.</span>
                )}
              </TableEmpty>
            )
          }
        />
      </TableCard>

      {split.resolved.length > 0 && (
        <section className="mt-6" aria-label="Earlier failed attempts">
          <h2 className="mb-1 text-[13px] font-medium">Earlier failed attempts</h2>
          <p className="mb-2 text-[12px] text-muted-foreground">Read-only. These providers were paid by a later payout, so nothing is owed.</p>
          <TableCard>
            <DataTable label="Earlier failed attempts table" columns={historyColumns} rows={split.resolved} getRowId={(r) => r.withdrawal.id} minWidth={640} empty={null} />
          </TableCard>
        </section>
      )}

      {cardItems.length > 0 && (
        <section className="mt-6" aria-label="Older card payouts that failed">
          <h2 className="mb-2 text-[13px] font-medium">Older card payouts that failed</h2>
          <TableCard>
            <DataTable label="Older card payouts table" columns={cardColumns} rows={cardItems} getRowId={(t) => t.id} minWidth={720} empty={null} />
          </TableCard>
        </section>
      )}

      <OldWithdrawals />
    </div>
  );
}

/** Read-only history of withdrawal requests made before automatic payouts. Refused Xendit payouts are listed above, so they are not repeated. Fetched only when opened. */
function OldWithdrawals() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [rows, setRows] = useState<AdminWithdrawal[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const results = await Promise.all((["pending", "completed", "failed"] as const).map((s) => services.getWithdrawals(s)));
      setRows(results.flatMap((r) => r.items).filter((w) => !isXenditPayoutFailure(w)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  const columns: Column<AdminWithdrawal>[] = [
    { id: "name", header: "Provider", cell: (w) => <span className="font-medium">{w.profileName}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (w) => <span className="tabular font-semibold">{formatCurrency(w.amount)}</span> },
    { id: "dest", header: "Sent to", hideBelow: "md", cell: (w) => <span className="text-muted-foreground">{w.destination ?? "Not provided"}</span> },
    { id: "status", header: "Status", cell: (w) => <Badge tone={OLD_STATUS[w.status]?.tone ?? "neutral"} dot>{OLD_STATUS[w.status]?.label ?? w.status}</Badge> },
    { id: "date", header: "Requested", hideBelow: "lg", cell: (w) => <span className="tabular text-muted-foreground">{formatDate(w.createdAt)}</span> },
    { id: "note", header: "Note", hideBelow: "lg", cell: (w) => <span className="text-muted-foreground">{w.status === "failed" ? (w.reviewNote?.trim() || "No reason given") : ""}</span> },
  ];

  return (
    <details
      className="mt-6 rounded-[12px] border border-border bg-surface shadow-ui-sm"
      onToggle={(e) => {
        const nowOpen = e.currentTarget.open;
        setOpen(nowOpen);
        if (nowOpen && state === "idle") void load();
      }}
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-[13px] font-medium">Old withdrawal requests (before automatic payouts)</summary>
      {open && (
        <div className="border-t border-border">
          <p className="px-4 pt-3 text-[12px] text-muted-foreground">Read-only history. Nothing here can be approved or rejected any more.</p>
          {state === "loading" && <TableEmpty>Loading old requests…</TableEmpty>}
          {state === "error" && <LoadFailedState noun="old withdrawal requests" onRetry={() => void load()} />}
          {state === "ready" && (
            <DataTable
              label="Old withdrawal requests table"
              columns={columns}
              rows={rows}
              getRowId={(w) => w.id}
              minWidth={640}
              empty={<TableEmpty>No old withdrawal requests.</TableEmpty>}
            />
          )}
        </div>
      )}
    </details>
  );
}
