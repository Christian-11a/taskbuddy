"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Wrench, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { approveSkillRequest, getSkillRequests, rejectSkillRequest } from "@/lib/services";
import type { SkillRequest, SkillRequestStatus } from "@/lib/domain";
import { formatDate } from "@/lib/adapters";

type QueueStatus = Exclude<SkillRequestStatus, "cancelled">;

const inputStyle = {
  background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)",
  padding: "8px 11px", fontSize: "var(--fs-sm)", color: "var(--text-white)", fontFamily: "inherit",
};

const TYPE_LABEL: Record<SkillRequest["type"], string> = {
  change_primary: "Change main service",
  add_secondary: "Add a service",
};

/**
 * Providers can no longer change their own service (QA, Sep 2026): they ask
 * from the app's My Services screen, and an admin decides here. Approving a
 * main-service change swaps it on their profile; approving an extra service
 * adds it. Either way the provider is notified.
 */
export function SkillRequestsPage() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [items, setItems] = useState<SkillRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState<SkillRequest | null>(null);
  const [rejecting, setRejecting] = useState<SkillRequest | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      setItems(await getSkillRequests(status));
    } catch {
      setError("Could not load service requests. The backend may still be deploying.");
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
      await load(true);
    } catch {
      showToast("Could not update this request. It may already have been decided.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "var(--fs-2xl)", letterSpacing: "-0.025em" }}>Service requests</div>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>
            Providers asking to change their main service or add another one.
          </div>
        </div>
        <button
          onClick={() => { setRefreshing(true); void load(true); }}
          disabled={refreshing}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: "var(--fs-xs)", color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: "12px 14px", borderBottom: "1px solid var(--card-border)" }}>
          <div className="inline-flex" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: "var(--r-md)", gap: 2 }}>
            {(["pending", "approved", "rejected"] as QueueStatus[]).map((value) => (
              <button key={value} onClick={() => setStatus(value)} className="rounded-lg font-medium cursor-pointer" style={{ padding: "7px 11px", fontSize: "var(--fs-xs)", background: status === value ? "var(--indigo-dark)" : "transparent", color: status === value ? "var(--indigo-light)" : "var(--text-muted)", border: "none", fontFamily: "inherit" }}>
                {value === "pending" ? "Needs review" : value === "approved" ? "Approved" : "Rejected"}
              </button>
            ))}
          </div>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>{items.length.toLocaleString()} request{items.length === 1 ? "" : "s"}</span>
        </div>

        {error && <div role="alert" style={{ padding: "12px 14px", color: "var(--danger-text)", fontSize: "var(--fs-xs)", borderBottom: "1px solid var(--card-border)" }}>{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center" style={{ height: 220, color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>Loading service requests…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2" style={{ height: 220, color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
            <Wrench size={20} /> No {status === "pending" ? "requests waiting for review" : `${status} requests`}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Provider</th><th>Request</th><th>Why they qualify</th><th>Sent</th><th style={{ width: 170 }}>{status === "pending" ? "Actions" : "Note"}</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="text-white font-medium" style={{ fontSize: "var(--fs-xs)" }}>{item.providerName}</td>
                    <td style={{ fontSize: "var(--fs-xs)" }}>
                      <div style={{ color: "var(--text-muted)" }}>{TYPE_LABEL[item.type]}</div>
                      <div className="text-white font-semibold" style={{ marginTop: 2 }}>{item.categoryName}</div>
                    </td>
                    <td style={{ color: "var(--text-light)", fontSize: "var(--fs-xs)", maxWidth: 320, whiteSpace: "normal" }}>{item.reason}</td>
                    <td style={{ color: "var(--text-light)", fontSize: "var(--fs-xs)" }}>{formatDate(item.createdAt)}</td>
                    <td>
                      {item.status === "pending" ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => { setApproving(item); setNote(""); }} className="flex items-center gap-1 font-semibold" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "var(--r-sm)", padding: "6px 9px", color: "var(--success-text)", fontSize: "var(--fs-2xs)", cursor: "pointer", fontFamily: "inherit" }}><CheckCircle2 size={11} /> Approve</button>
                          <button onClick={() => { setRejecting(item); setNote(""); }} className="flex items-center gap-1 font-semibold" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--r-sm)", padding: "6px 9px", color: "var(--danger-text)", fontSize: "var(--fs-2xs)", cursor: "pointer", fontFamily: "inherit" }}><XCircle size={11} /> Reject</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>{item.reviewNote ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!approving}
        title="Approve this request?"
        message={approving ? (approving.type === "change_primary"
          ? `${approving.providerName}'s main service becomes ${approving.categoryName}.`
          : `${approving.categoryName} is added to ${approving.providerName}'s services.`) : ""}
        confirmLabel="Approve"
        danger={false}
        busy={busy}
        onConfirm={() => void decide("approve")}
        onCancel={() => !busy && setApproving(null)}
      >
        <label className="block" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
          Note to the provider <span style={{ opacity: .7 }}>(optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} style={{ ...inputStyle, width: "100%", marginTop: 6 }} />
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!rejecting}
        title="Reject this request?"
        message="The provider will be notified and can send a new request."
        confirmLabel="Reject request"
        busy={busy}
        confirmDisabled={!note.trim()}
        onConfirm={() => void decide("reject")}
        onCancel={() => !busy && setRejecting(null)}
      >
        <label className="block" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
          Reason
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="Tell the provider what's missing" style={{ ...inputStyle, width: "100%", marginTop: 6, resize: "vertical" }} />
          <span style={{ display: "block", textAlign: "right", marginTop: 3, fontSize: "var(--fs-3xs)" }}>{note.length}/500</span>
        </label>
      </ConfirmDialog>
    </div>
  );
}
