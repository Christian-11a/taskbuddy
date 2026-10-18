"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import * as services from "@/lib/services";
import { payoutHeadline, formatCurrency, formatDate } from "@/lib/adapters";
import type { AdminWithdrawal } from "@/lib/domain";
import type { PayoutFailures } from "@/lib/services";
import { useLiveTick } from "@/hooks/useLiveTick";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/Panel";
import { DataTable, LoadFailedState, RefreshFailedBanner, SummaryStrip, TableCard, TableEmpty, type Column } from "@/components/admin/table";

/** The payment provider's refusal note without its "Xendit:" prefix. */
function payoutReason(w: AdminWithdrawal): string {
  const text = (w.reviewNote ?? "").replace(/^\s*Xendit:\s*/i, "").trim();
  return text || "No reason given";
}

export function WithdrawalsPage() {
  const [split, setSplit] = useState<PayoutFailures>({ unresolved: [], resolved: [], providers: [], owed: [] });
  const items = split.unresolved;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  // Only the newest request may write state (a live tick can overlap a slow one).
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await services.getPayoutFailures();
      if (seq !== requestSeq.current) return;
      setSplit(result);
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

  const headline = payoutHeadline(split.owed);

  const columns: Column<AdminWithdrawal>[] = [
    { id: "provider", header: "Provider", cell: (w) => <span className="font-medium">{w.profileName}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (w) => <span className="tabular font-semibold">{formatCurrency(w.amount)}</span> },
    { id: "date", header: "Date", hideBelow: "md", cell: (w) => <span className="tabular text-muted-foreground">{formatDate(w.createdAt)}</span> },
    { id: "reason", header: "Why it failed", cell: (w) => <span className="block max-w-[360px] text-[12.5px] text-muted-foreground">{payoutReason(w)}</span> },
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

      {split.providers.length > 0 && (
        <p className="-mt-2 mb-4 text-[12px] text-muted-foreground">
          Each automatic payout sends the provider&apos;s whole wallet balance, so the amount waiting is each provider&apos;s current balance, not the failed amounts.
          {split.providers.length > split.owed.length && " Providers with nothing left to send are listed below but not counted."}
        </p>
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

    </div>
  );
}
