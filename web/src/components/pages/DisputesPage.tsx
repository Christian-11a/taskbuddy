"use client";

import { useState } from "react";
import { Search, ChevronDown, Check, RotateCcw, MessagesSquare } from "lucide-react";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import type { ConversationMessage } from "@/lib/domain";
import { NOTE_MAX_LENGTH } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import clsx from "clsx";

type Filter = "all" | "open" | "resolved" | "cancelled";

export function DisputesPage() {
  const { disputes, resolveDispute, loading } = useApp();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; resolution: "RELEASED_TO_PROVIDER" | "REFUNDED_TO_CLIENT" } | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // GET /admin/jobs/:jobId/conversation (migration 0014) — read-only, fetched
  // on demand per dispute and cached by job id.
  const [conversationJobId, setConversationJobId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Record<string, ConversationMessage[] | "loading" | "error">>({});

  function toggleConversation(jobId: string) {
    if (conversationJobId === jobId) {
      setConversationJobId(null);
      return;
    }
    setConversationJobId(jobId);
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
      showToast(
        resolution === "RELEASED_TO_PROVIDER"
          ? "Escrow released to the provider."
          : "Escrow refunded to the client.",
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

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Disputes</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Review and resolve payment disputes raised by clients</div>
        </div>
        <div className="flex items-center gap-1.5 font-semibold" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 11, padding: "7px 11px", fontSize: 11.4, color: "var(--danger-text)" }}>
          ⚠️ {counts.open} open
        </div>
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <div className="relative" style={{ flex: "1 1 200px", maxWidth: 313 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" style={{ color: "var(--text-white)" }} />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by job, client, or provider…"
            aria-label="Search disputes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "8px 13px 8px 32px", fontSize: 11.4, fontFamily: "inherit", color: "var(--text-white)" }}
          />
        </div>
        <div className="inline-flex rounded-xl p-1 gap-1 flex-wrap" style={{ background: "var(--chip-bg)" }}>
          {(["all", "open", "resolved", "cancelled"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx("flex items-center gap-1 rounded-lg font-medium cursor-pointer transition-all", filter === f ? "text-indigo-300" : "text-gray-500 hover:text-gray-300")}
              style={{ padding: "5px 12px", fontSize: 11.4, background: filter === f ? "rgba(99,102,241,0.25)" : "transparent", border: "none", fontFamily: "inherit" }}
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
        {filtered.map((d) => {
          const isExpanded = expandedId === d.id;
          return (
            <div key={d.id} className="rounded-xl mb-2.5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-3 flex-wrap" style={{ padding: 13 }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-semibold flex-wrap" style={{ fontSize: 13 }}>
                    {d.jobTitle}
                    <span className={clsx("badge", d.statusClass)}>{d.status}</span>
                  </div>
                  <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 2 }}>
                    {d.clientName} vs {d.providerName} · {d.amount} · {d.createdAt}
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-shrink-0">
                  {d.isOpen && (
                    <>
                      <button
                        onClick={() => openConfirm(d.id, "RELEASED_TO_PROVIDER")}
                        disabled={resolvingId === d.id}
                        className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
                        style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 11, padding: "5px 14px", fontSize: 11.4, color: "var(--success-text)", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        <Check size={12} /> Release to Provider
                      </button>
                      <button
                        onClick={() => openConfirm(d.id, "REFUNDED_TO_CLIENT")}
                        disabled={resolvingId === d.id}
                        className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
                        style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 11, padding: "5px 14px", fontSize: 11.4, color: "#f59e0b", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        <RotateCcw size={12} /> Refund to Client
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                        aria-label={`${isExpanded ? "Hide" : "Show"} details for ${d.jobTitle}`}
                        aria-expanded={isExpanded}
                    className="flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
                    style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", transform: isExpanded ? "rotate(180deg)" : "none" }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 13px 13px", background: "var(--chip-bg)" }}>
                  <div className="grid grid-cols-2 gap-3" style={{ fontSize: 11.4 }}>
                    <div>
                      <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>SERVICE</div>
                      <div className="text-white">{d.service}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>AMOUNT IN ESCROW</div>
                      <div className="text-white">{d.amount}</div>
                    </div>
                    <div className="col-span-2">
                      <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>REASON</div>
                      <div className="text-white">{d.reason}</div>
                    </div>
                    {d.details && (
                      <div className="col-span-2">
                        <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>DETAILS</div>
                        <div className="text-white">{d.details}</div>
                      </div>
                    )}
                    {d.resolution && (
                      <div className="col-span-2">
                        <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>RESOLUTION</div>
                        <div className="text-white">
                          {d.resolution} · {d.resolvedAt}
                          {d.resolutionNote && ` — ${d.resolutionNote}`}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => toggleConversation(d.jobId)}
                    className="flex items-center gap-1.5 font-semibold transition-colors mt-3"
                    style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 9, padding: "5px 12px", fontSize: 11, color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <MessagesSquare size={11} /> {conversationJobId === d.jobId ? "Hide conversation" : "View conversation"}
                  </button>

                  {conversationJobId === d.jobId && (
                    <div className="mt-2 rounded-lg" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: 10, maxHeight: 240, overflowY: "auto" }}>
                      {conversations[d.jobId] === "loading" && (
                        <div style={{ fontSize: 10.8, color: "var(--text-muted)" }}>Loading conversation…</div>
                      )}
                      {conversations[d.jobId] === "error" && (
                        <div style={{ fontSize: 10.8, color: "var(--danger-text)" }}>Could not load the conversation.</div>
                      )}
                      {Array.isArray(conversations[d.jobId]) && (conversations[d.jobId] as ConversationMessage[]).length === 0 && (
                        <div style={{ fontSize: 10.8, color: "var(--text-muted)" }}>No messages in this job&apos;s chat.</div>
                      )}
                      {Array.isArray(conversations[d.jobId]) &&
                        (conversations[d.jobId] as ConversationMessage[]).map((m) => (
                          <div key={m.id} className="mb-2 last:mb-0" style={{ fontSize: 11 }}>
                            <div className="text-white font-medium">
                              {m.senderName} <span style={{ fontSize: 9.8, color: "var(--text-muted)", fontWeight: 400 }}>{new Date(m.createdAt).toLocaleString()}</span>
                            </div>
                            <div style={{ color: "var(--text-light)" }}>{m.body}</div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.resolution === "RELEASED_TO_PROVIDER" ? "Release escrow to the provider?" : "Refund escrow to the client?"}
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
      >
        <textarea
          autoFocus
          placeholder="Note (optional, shown on the dispute record)"
          aria-label="Resolution note (optional)"
          value={resolveNote}
          onChange={(e) => setResolveNote(e.target.value)}
          rows={3}
          className="w-full text-white outline-none"
          style={{ background: "var(--input-bg)", border: `1px solid ${resolveNoteTooLong ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: 9, padding: "8px 11px", fontSize: 11.4, fontFamily: "inherit", resize: "vertical" }}
        />
        <div
          className="mt-1 text-right"
          style={{ fontSize: 10, color: resolveNoteTooLong ? "var(--danger-text)" : "var(--text-muted)" }}
        >
          {resolveNote.length}/{NOTE_MAX_LENGTH}
        </div>
      </ConfirmDialog>
    </div>
  );
}
