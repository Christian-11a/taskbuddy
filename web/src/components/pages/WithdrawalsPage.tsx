"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, WalletCards, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { getWithdrawals, rejectWithdrawal, settleWithdrawal } from "@/lib/services";
import type { AdminWithdrawal } from "@/lib/domain";
import { formatCurrency, formatDate } from "@/lib/adapters";

type QueueStatus = "pending" | "completed" | "failed";

const inputStyle = {
  background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 9,
  padding: "8px 11px", fontSize: 12, color: "var(--text-white)", fontFamily: "inherit",
};

export function WithdrawalsPage() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [items, setItems] = useState<AdminWithdrawal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState<AdminWithdrawal | null>(null);
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await getWithdrawals(status);
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setError("Could not load withdrawal requests. The backend may still be deploying.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch is an
     external-system synchronization; the state updates happen in its async
     continuation. */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function confirmSettle() {
    if (!settling) return;
    setBusy(true);
    try {
      await settleWithdrawal(settling.id, reference);
      showToast("Withdrawal marked as paid.");
      setSettling(null);
      setReference("");
      await load(true);
    } catch {
      showToast("Could not settle this withdrawal. Check the balance and try again.", "error");
    } finally { setBusy(false); }
  }

  async function confirmReject() {
    if (!rejecting || !reason.trim()) return;
    setBusy(true);
    try {
      await rejectWithdrawal(rejecting.id, reason);
      showToast("Withdrawal rejected.");
      setRejecting(null);
      setReason("");
      await load(true);
    } catch {
      showToast("Could not reject this withdrawal. Please try again.", "error");
    } finally { setBusy(false); }
  }

  const pendingAmount = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: 22, letterSpacing: "-0.025em" }}>Withdrawals</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>
            Review requests and record payouts made outside the platform.
          </div>
        </div>
        <button
          onClick={() => { setRefreshing(true); void load(true); }}
          disabled={refreshing}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 10, padding: "8px 12px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Two real numbers share one card at their natural asymmetric weight;
          the settlement rule is policy text, not a metric, so it reads as a
          caption below rather than forcing a third equal card to hold it. */}
      {(() => {
        const pendingCount = status === "pending" ? total : 0;
        const hasPending = status === "pending" && total > 0;
        return (
          <div className="rounded-xl p-4 mb-3 flex items-center gap-8 flex-wrap" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div>
              <div className="flex items-center gap-2" style={{ color: hasPending ? "var(--warning-text)" : "var(--text-muted)", fontSize: 11 }}><Clock3 size={14} /> Waiting for review</div>
              <div className="font-extrabold mt-2 tabular" style={{ fontSize: 28, color: hasPending ? "var(--text-white)" : "var(--text-muted)" }}>{status === "pending" ? pendingCount : "—"}</div>
            </div>
            <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
            <div>
              <div className="flex items-center gap-2" style={{ color: "var(--text-muted)", fontSize: 11 }}><WalletCards size={14} /> Amount in this view</div>
              <div className="text-white font-extrabold mt-2" style={{ fontSize: 28 }}>{formatCurrency(pendingAmount)}</div>
            </div>
          </div>
        );
      })()}
      <div className="flex items-center gap-2 mb-4" style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
        <AlertTriangle size={12} style={{ flexShrink: 0 }} /> Only mark paid after money has actually moved.
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: "12px 14px", borderBottom: "1px solid var(--card-border)" }}>
          <div className="inline-flex" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: 9, gap: 2 }}>
            {(["pending", "completed", "failed"] as QueueStatus[]).map((value) => (
              <button key={value} onClick={() => setStatus(value)} className="rounded-lg font-medium cursor-pointer" style={{ padding: "7px 11px", fontSize: 11, background: status === value ? "var(--indigo-dark)" : "transparent", color: status === value ? "var(--indigo-light)" : "var(--text-muted)", border: "none", fontFamily: "inherit" }}>
                {value === "pending" ? "Needs review" : value === "completed" ? "Settled" : "Rejected"}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{total.toLocaleString()} request{total === 1 ? "" : "s"}</span>
        </div>

        {error && <div role="alert" style={{ padding: "12px 14px", color: "var(--danger-text)", fontSize: 11.5, borderBottom: "1px solid var(--card-border)" }}>{error}</div>}
        {loading ? <div className="flex items-center justify-center" style={{ height: 220, color: "var(--text-muted)", fontSize: 12 }}>Loading withdrawal queue…</div> : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2" style={{ height: 220, color: "var(--text-muted)", fontSize: 12 }}><CheckCircle2 size={20} style={{ color: "var(--success-text)" }} /> No {status} withdrawals.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table"><thead><tr><th>Account</th><th>Amount</th><th>Destination</th><th>Requested</th><th>Status</th><th style={{ width: 170 }}>Actions</th></tr></thead>
              <tbody>{items.map((item) => <tr key={item.id}>
                <td><div className="text-white font-medium" style={{ fontSize: 11.4 }}>{item.profileName}</div><div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 2 }}>{item.title}</div></td>
                <td className="text-white font-semibold" style={{ fontSize: 12 }}>{formatCurrency(item.amount)}</td>
                <td style={{ color: "var(--text-light)", fontSize: 11.2, maxWidth: 240 }}>{item.destination ?? "Not provided"}</td>
                <td style={{ color: "var(--text-light)", fontSize: 11.2 }}>{formatDate(item.createdAt)}</td>
                <td><span className={`badge ${item.status === "pending" ? "badge-pending" : item.status === "completed" ? "badge-completed" : "badge-rejected"}`}>{item.status}</span></td>
                <td>{item.status === "pending" ? <div className="flex gap-1.5"><button onClick={() => { setSettling(item); setReference(""); }} className="flex items-center gap-1 font-semibold" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "6px 9px", color: "var(--success-text)", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}><CheckCircle2 size={11} /> Settle</button><button onClick={() => { setRejecting(item); setReason(""); }} className="flex items-center gap-1 font-semibold" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "6px 9px", color: "var(--danger-text)", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}><XCircle size={11} /> Reject</button></div> : <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.reviewNote ?? "—"}</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={!!settling} title="Mark withdrawal as paid?" message={settling ? `${settling.profileName} will be told that ${formatCurrency(settling.amount)} was sent.` : ""} confirmLabel="Mark as paid" cancelLabel="Keep pending" danger={false} busy={busy} onConfirm={() => void confirmSettle()} onCancel={() => !busy && setSettling(null)}>
        <label className="block" style={{ fontSize: 11, color: "var(--text-muted)" }}>Payout reference <span style={{ opacity: .7 }}>(optional)</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="GCash / bank reference" style={{ ...inputStyle, width: "100%", marginTop: 6 }} /></label>
      </ConfirmDialog>
      <ConfirmDialog open={!!rejecting} title="Reject withdrawal?" message="The requester will be notified and the reserved amount will return to their available balance." confirmLabel="Reject withdrawal" busy={busy} confirmDisabled={!reason.trim()} onConfirm={() => void confirmReject()} onCancel={() => !busy && setRejecting(null)}>
        <label className="block" style={{ fontSize: 11, color: "var(--text-muted)" }}>Reason <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="Explain why this request cannot be paid" style={{ ...inputStyle, width: "100%", marginTop: 6, resize: "vertical" }} /><span style={{ display: "block", textAlign: "right", marginTop: 3, fontSize: 9 }}>{reason.length}/500</span></label>
      </ConfirmDialog>
    </div>
  );
}
