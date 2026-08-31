"use client";

import { useState } from "react";
import { Search, Check, RotateCcw, MessagesSquare, AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import type { ConversationMessage } from "@/lib/domain";
import { NOTE_MAX_LENGTH } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReviewDrawer, DrawerField, DrawerSection } from "@/components/ui/ReviewDrawer";
import { useToast } from "@/components/ui/Toast";
import clsx from "clsx";

type Filter = "all" | "open" | "resolved" | "cancelled";

export function DisputesPage() {
  const { disputes, resolveDispute, loading } = useApp();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; resolution: "RELEASED_TO_PROVIDER" | "REFUNDED_TO_CLIENT" } | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // GET /admin/jobs/:jobId/conversation (migration 0014) — read-only, fetched
  // on demand per dispute and cached by job id.
  const [conversationOpen, setConversationOpen] = useState(false);
  const [conversations, setConversations] = useState<Record<string, ConversationMessage[] | "loading" | "error">>({});

  function toggleConversation(jobId: string) {
    setConversationOpen((v) => !v);
    if (!(jobId in conversations)) {
      setConversations((prev) => ({ ...prev, [jobId]: "loading" }));
      services
        .getJobConversation(jobId)
        .then((messages) => setConversations((prev) => ({ ...prev, [jobId]: messages })))
        .catch(() => setConversations((prev) => ({ ...prev, [jobId]: "error" })));
    }
  }

  const filtered = disputes.filter((d) => {
    const matchFilter = filter === "all" || d.status.toLowerCase() === filter;
    const q = search.toLowerCase();
    const matchSearch =
      d.jobTitle.toLowerCase().includes(q) ||
      d.clientName.toLowerCase().includes(q) ||
      d.providerName.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const counts = {
    all: disputes.length,
    open: disputes.filter((d) => d.isOpen).length,
    resolved: disputes.filter((d) => d.status === "Resolved").length,
    cancelled: disputes.filter((d) => d.status === "Cancelled").length,
  };

  async function handleResolve(id: string, resolution: "RELEASED_TO_PROVIDER" | "REFUNDED_TO_CLIENT") {
    setResolvingId(id);
    setConfirming(null);
    try {
      await resolveDispute(id, resolution, resolveNote.trim() || undefined);
      setResolveNote("");
      setReviewingId(null);
      showToast(
        resolution === "RELEASED_TO_PROVIDER"
          ? "Escrow released to the provider."
          : "Escrow refunded to the homeowner.",
      );
    } catch {
      showToast("Could not resolve that dispute. Please try again.", "error");
    } finally {
      setResolvingId(null);
    }
  }

  function openConfirm(id: string, resolution: "RELEASED_TO_PROVIDER" | "REFUNDED_TO_CLIENT") {
    setResolveNote("");
    setConfirming({ id, resolution });
  }

  const resolveNoteTooLong = resolveNote.length > NOTE_MAX_LENGTH;
  const reviewing = disputes.find((d) => d.id === reviewingId) ?? null;

  function openReview(id: string) {
    setConversationOpen(false);
    setReviewingId(id);
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-white font-bold" style={{ fontSize: 22, letterSpacing: "-0.025em" }}>Disputes</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Review and resolve payment disputes raised by homeowners</div>
        </div>
        {/* Red means someone's money is in contention. With nothing open it
            would be an alarm about nothing, so it drops to a plain note. */}
        {counts.open > 0 ? (
          <div className="flex items-center gap-1.5 font-semibold" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 11, padding: "7px 11px", fontSize: 11.4, color: "var(--danger-text)" }}>
            <AlertTriangle size={12} /> {counts.open} open
          </div>
        ) : (
          <div className="flex items-center gap-1.5" style={{ borderRadius: 11, padding: "7px 11px", fontSize: 11.4, color: "var(--text-muted)" }}>
            <Check size={12} style={{ color: "var(--success-text)" }} /> No open disputes
          </div>
        )}
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <div className="relative" style={{ flex: "1 1 200px", maxWidth: 360 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" style={{ color: "var(--text-white)" }} />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by job, homeowner, or provider…"
            aria-label="Search disputes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: 9, padding: "0 13px 0 36px", fontSize: 12, fontFamily: "inherit", color: "var(--text-white)" }}
          />
        </div>
        <div className="inline-flex flex-wrap" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: 9, gap: 2 }}>
          {(["all", "open", "resolved", "cancelled"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx("flex items-center gap-1 rounded-lg font-medium cursor-pointer transition-all", filter !== f && "text-gray-500 hover:text-gray-300")}
              style={{ padding: "7px 11px", fontSize: 11, background: filter === f ? "var(--indigo-dark)" : "transparent", color: filter === f ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit" }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} <span style={{ fontSize: 9.8, opacity: 0.7 }}>({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {loading
              ? "Loading disputes…"
              : disputes.length === 0
                ? "No disputes raised yet."
                : "No disputes match this search or filter."}
          </div>
        )}
        {filtered.map((d) => (
          <div key={d.id} className="rounded-xl mb-2.5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-3 flex-wrap" style={{ padding: 13 }}>
              <div
                className="flex items-center justify-center flex-shrink-0 rounded-xl"
                style={{ width: 38, height: 38, background: d.isOpen ? "rgba(239,68,68,0.09)" : "rgba(34,197,94,0.09)", color: d.isOpen ? "var(--danger-text)" : "var(--success-text)" }}
              >
                <AlertTriangle size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 font-semibold flex-wrap" style={{ fontSize: 13 }}>
                  {d.jobTitle}
                  <span className={clsx("badge", d.statusClass)}>{d.status}</span>
                </div>
                <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 2 }}>
                  {d.clientName} vs {d.providerName} · {d.amount} · {d.createdAt}
                </div>
              </div>
              <button
                onClick={() => openReview(d.id)}
                className="flex items-center gap-1.5 font-semibold transition-colors flex-shrink-0"
                style={{ background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.3)", borderRadius: 9, padding: "8px 16px", fontSize: 11, color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
              >
                Review case
              </button>
            </div>
          </div>
        ))}
      </div>

      <ReviewDrawer
        open={reviewing !== null}
        onClose={() => setReviewingId(null)}
        title={reviewing ? `Dispute · ${reviewing.jobTitle}` : ""}
        subtitle={reviewing ? `${reviewing.clientName} vs ${reviewing.providerName}` : undefined}
        footer={
          reviewing?.isOpen ? (
            <>
              <button
                onClick={() => reviewing && openConfirm(reviewing.id, "REFUNDED_TO_CLIENT")}
                disabled={resolvingId === reviewing?.id}
                className="flex-1 flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:opacity-50"
                style={{ background: "transparent", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "#f59e0b", cursor: "pointer", fontFamily: "inherit" }}
              >
                <RotateCcw size={13} /> Refund Homeowner
              </button>
              <button
                onClick={() => reviewing && openConfirm(reviewing.id, "RELEASED_TO_PROVIDER")}
                disabled={resolvingId === reviewing?.id}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                style={{ borderRadius: 9, padding: "9px 14px", fontSize: 12 }}
              >
                <Check size={13} /> Release to Provider
              </button>
            </>
          ) : (
            <button
              onClick={() => setReviewingId(null)}
              className="flex-1 font-semibold transition-colors"
              style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
            >
              Close
            </button>
          )
        }
      >
        {reviewing && (
          <>
            <DrawerSection>
              <div className="grid grid-cols-2 gap-3">
                <DrawerField label="Homeowner" value={reviewing.clientName} />
                <DrawerField label="Provider" value={reviewing.providerName} />
                <DrawerField label="Escrow amount" value={<span className="font-semibold text-white">{reviewing.amount}</span>} />
                <DrawerField label="Opened" value={reviewing.createdAt} />
              </div>
            </DrawerSection>
            <DrawerSection>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Reason for dispute</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-light)" }}>{reviewing.reason}</div>
              {reviewing.details && (
                <div className="mt-3">
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Details</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-light)" }}>{reviewing.details}</div>
                </div>
              )}
              {reviewing.resolution && (
                <div className="mt-3">
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Resolution</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-light)" }}>
                    {reviewing.resolution} · {reviewing.resolvedAt}
                    {reviewing.resolutionNote && ` — ${reviewing.resolutionNote}`}
                  </div>
                </div>
              )}
            </DrawerSection>
            <DrawerSection>
              <button
                onClick={() => toggleConversation(reviewing.jobId)}
                className="flex items-center gap-1.5 font-semibold transition-colors"
                style={{ background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.25)", borderRadius: 9, padding: "6px 12px", fontSize: 11, color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <MessagesSquare size={11} /> {conversationOpen ? "Hide conversation" : "View conversation"}
              </button>

              {conversationOpen && (
                <div className="mt-2 rounded-lg" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: 10, maxHeight: 240, overflowY: "auto" }}>
                  {conversations[reviewing.jobId] === "loading" && (
                    <div style={{ fontSize: 10.8, color: "var(--text-muted)" }}>Loading conversation…</div>
                  )}
                  {conversations[reviewing.jobId] === "error" && (
                    <div style={{ fontSize: 10.8, color: "var(--danger-text)" }}>Could not load the conversation.</div>
                  )}
                  {Array.isArray(conversations[reviewing.jobId]) && (conversations[reviewing.jobId] as ConversationMessage[]).length === 0 && (
                    <div style={{ fontSize: 10.8, color: "var(--text-muted)" }}>No messages in this job&apos;s chat.</div>
                  )}
                  {Array.isArray(conversations[reviewing.jobId]) &&
                    (conversations[reviewing.jobId] as ConversationMessage[]).map((m) => (
                      <div key={m.id} className="mb-2 last:mb-0" style={{ fontSize: 11 }}>
                        <div className="text-white font-medium">
                          {m.senderName} <span style={{ fontSize: 9.8, color: "var(--text-muted)", fontWeight: 400 }}>{new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ color: "var(--text-light)" }}>{m.body}</div>
                      </div>
                    ))}
                </div>
              )}
            </DrawerSection>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 9 }}>Admin resolution note</div>
              <textarea
                placeholder="Document the reason for the final decision…"
                aria-label="Resolution note (optional)"
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                rows={3}
                className="w-full text-white outline-none"
                style={{ background: "var(--input-bg)", border: `1px solid ${resolveNoteTooLong ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: 9, padding: "10px 12px", fontSize: 12, fontFamily: "inherit", resize: "vertical" }}
              />
              <div className="mt-1 text-right" style={{ fontSize: 10, color: resolveNoteTooLong ? "var(--danger-text)" : "var(--text-muted)" }}>
                {resolveNote.length}/{NOTE_MAX_LENGTH}
              </div>
            </div>
          </>
        )}
      </ReviewDrawer>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.resolution === "RELEASED_TO_PROVIDER" ? "Release escrow to the provider?" : "Refund escrow to the homeowner?"}
        message={(() => {
          const d = disputes.find((row) => row.id === confirming?.id);
          if (!d || !confirming) return "";
          return confirming.resolution === "RELEASED_TO_PROVIDER"
            ? `Pay ${d.amount} to ${d.providerName}. This can't be undone.`
            : `Refund ${d.amount} to ${d.clientName}. This can't be undone.`;
        })()}
        confirmLabel="Confirm"
        danger={false}
        busy={resolvingId !== null}
        confirmDisabled={resolveNoteTooLong}
        onConfirm={() => confirming && handleResolve(confirming.id, confirming.resolution)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
