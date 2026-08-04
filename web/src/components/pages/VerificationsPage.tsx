"use client";

import { useState } from "react";
import { Search, Check, X, ChevronDown } from "lucide-react";
import { useApp } from "@/context/AppContext";
import clsx from "clsx";

type Filter = "all" | "pending" | "approved" | "rejected";

export function VerificationsPage() {
  const { verifications, approveVerification, rejectVerification, bulkApproveVerifications, bulkRejectVerifications } = useApp();
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ label: string; url: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtered = verifications.filter((v) => {
    const matchFilter = filter === "all" || v.status === filter;
    const matchSearch =
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.email.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const counts = {
    all: verifications.length,
    pending: verifications.filter((v) => v.status === "pending").length,
    approved: verifications.filter((v) => v.status === "approved").length,
    rejected: verifications.filter((v) => v.status === "rejected").length,
  };

  const pendingInView = filtered.filter((v) => v.status === "pending");
  const selectedPending = pendingInView.filter((v) => selected.has(v.id));
  const allPendingSelected = pendingInView.length > 0 && selectedPending.length === pendingInView.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPending() {
    setSelected(allPendingSelected ? new Set() : new Set(pendingInView.map((v) => v.id)));
  }

  async function runBulk(action: "approve" | "reject") {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      if (action === "approve") await bulkApproveVerifications(ids);
      else await bulkRejectVerifications(ids);
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Provider Verification Queue</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Review submitted government IDs and service certificates</div>
        </div>
        <div className="flex items-center gap-1.5 font-semibold" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 11, padding: "7px 11px", fontSize: 11.4, color: "#f59e0b" }}>
          ⚠️ {counts.pending} pending
        </div>
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <div className="relative" style={{ flex: "1 1 200px", maxWidth: 313 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="currentColor" style={{ color: "var(--text-white)" }} />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "8px 13px 8px 32px", fontSize: 11.4, fontFamily: "inherit", color: "var(--text-white)" }}
          />
        </div>
        <div className="inline-flex rounded-xl p-1 gap-1 flex-wrap" style={{ background: "var(--chip-bg)" }}>
          {(["all", "pending", "approved", "rejected"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx("flex items-center gap-1 rounded-lg font-medium cursor-pointer transition-all", filter === f ? "text-indigo-300" : "text-gray-500 hover:text-gray-300")}
              style={{ padding: "5px 12px", fontSize: 11.4, background: filter === f ? "rgba(99,102,241,0.25)" : "transparent", border: "none", fontFamily: "inherit" }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} <span style={{ fontSize: 9.8, opacity: 0.7 }}>({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {pendingInView.length > 0 && (
        <div className="flex items-center gap-3 mb-3 flex-wrap" style={{ fontSize: 11.4 }}>
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-muted)" }}>
            <input type="checkbox" checked={allPendingSelected} onChange={toggleAllPending} />
            Select all pending ({pendingInView.length})
          </label>
          {selected.size > 0 && (
            <>
              <span style={{ color: "var(--text-muted)" }}>{selected.size} selected</span>
              <button
                onClick={() => runBulk("approve")}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
                style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 9, padding: "4px 12px", fontSize: 11, color: "var(--success-text)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <Check size={11} /> Approve selected
              </button>
              <button
                onClick={() => runBulk("reject")}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 9, padding: "4px 12px", fontSize: 11, color: "var(--danger-text)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <X size={11} /> Reject selected
              </button>
            </>
          )}
        </div>
      )}

      <div>
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>No records found.</div>
        )}
        {filtered.map((v) => {
          const isExpanded = expandedId === v.id;
          return (
            <div key={v.id} className="rounded-xl mb-2.5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <div className="flex items-center gap-3 flex-wrap" style={{ padding: 13 }}>
                {v.status === "pending" && (
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleOne(v.id)}
                    className="flex-shrink-0"
                  />
                )}
                <div className="flex items-center justify-center flex-shrink-0 font-bold" style={{ width: 36, height: 36, borderRadius: 13, background: "rgba(99,102,241,0.2)", color: "var(--indigo-light)", fontSize: 11.4 }}>{v.initials}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-semibold flex-wrap" style={{ fontSize: 13 }}>
                    {v.name}
                    <span className={clsx("badge", `badge-${v.status}`)}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</span>
                  </div>
                  <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 2 }}>{v.email} · Submitted {v.date}</div>
                </div>
                <div className="flex gap-2 items-center flex-shrink-0">
                  {v.status === "pending" && (
                    <>
                      <button onClick={() => approveVerification(v.id)} className="flex items-center gap-1.5 font-semibold transition-colors" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 11, padding: "5px 14px", fontSize: 11.4, color: "var(--success-text)", cursor: "pointer", fontFamily: "inherit" }}>
                        <Check size={12} /> Approve
                      </button>
                      <button onClick={() => rejectVerification(v.id)} className="flex items-center gap-1.5 font-semibold transition-colors" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 11, padding: "5px 14px", fontSize: 11.4, color: "var(--danger-text)", cursor: "pointer", fontFamily: "inherit" }}>
                        <X size={12} /> Reject
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : v.id)}
                    className="flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
                    style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", transform: isExpanded ? "rotate(180deg)" : "none" }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--card-border)", padding: "12px 13px 13px", background: "var(--chip-bg)" }}>
                  <div className="grid grid-cols-2 gap-3" style={{ fontSize: 11.4 }}>
                    <div>
                      <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>EMAIL</div>
                      <div className="text-white">{v.email}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>SUBMITTED</div>
                      <div className="text-white">{v.date}</div>
                    </div>
                    <div className="col-span-2">
                      <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 6 }}>SUBMITTED DOCUMENTS</div>
                      <div className="flex gap-2 flex-wrap">
                        {v.documents.length === 0 && (
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>No documents available</span>
                        )}
                        {v.documents.map((doc) => (
                          <button
                            key={doc.label}
                            onClick={() => setPreview(doc)}
                            className="flex items-center gap-1.5 font-medium transition-opacity hover:opacity-80"
                            style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: "4px 10px", fontSize: 10.5, color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
                          >
                            {doc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Document lightbox */}
      {preview && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", zIndex: 100 }}
          onClick={() => setPreview(null)}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", maxWidth: "min(600px, 90vw)", maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-white font-semibold" style={{ fontSize: 13 }}>{preview.label}</span>
              <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={16} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not an optimizable static asset */}
            <img
              src={preview.url}
              alt={preview.label}
              style={{ display: "block", maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", margin: "0 auto" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
