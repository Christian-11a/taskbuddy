"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Check, X, FileText, Download, AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReviewDrawer, DrawerField, DrawerSection } from "@/components/ui/ReviewDrawer";
import { useToast } from "@/components/ui/Toast";
import { REASON_MAX_LENGTH } from "@/lib/validation";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import clsx from "clsx";

type Filter = "all" | "pending" | "approved" | "rejected";

/**
 * Provider verification is a trust-and-safety decision, not a bulk
 * housekeeping task — no "select all pending" / "approve selected" here on
 * purpose. Every provider gets reviewed one at a time via the drawer before
 * a decision is made. See docs/TaskBuddyCompleteRefinement.md §28.
 */
export function VerificationsPage() {
  const { verifications, approveVerification, rejectVerification, loading } = useApp();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ label: string; url: string } | null>(null);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  // Reject always confirms and always offers a reason — the backend records
  // it on the audit trail (admin_actions), so leaving it blank in the UI
  // meant every rejection reason was silently lost.
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmingExport, setConfirmingExport] = useState(false);

  const filtered = verifications.filter((v) => {
    const matchFilter = filter === "all" || v.status === filter;
    const matchSearch =
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.email.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  function exportCsv() {
    const csv = toCsv(
      ["Name", "Email", "Status", "Submitted", "Documents"],
      filtered.map((v) => [v.name, v.email, v.status, v.date, v.documents.length]),
    );
    downloadCsv(datedFilename("taskbuddy-verification-queue"), csv);
  }

  const counts = {
    all: verifications.length,
    pending: verifications.filter((v) => v.status === "pending").length,
    approved: verifications.filter((v) => v.status === "approved").length,
    rejected: verifications.filter((v) => v.status === "rejected").length,
  };

  async function handleApproveOne(id: string) {
    setApproveBusyId(id);
    try {
      await approveVerification(id);
      showToast("Verification approved.");
      setReviewingId(null);
    } catch {
      showToast("Could not approve that verification. Please try again.", "error");
    } finally {
      setApproveBusyId(null);
    }
  }

  function openRejectPrompt(id: string) {
    setRejectReason("");
    setRejectTargetId(id);
  }

  async function confirmReject() {
    if (!rejectTargetId) return;
    setRejectBusy(true);
    try {
      await rejectVerification(rejectTargetId, rejectReason.trim() || undefined);
      showToast("Verification rejected.");
      setRejectTargetId(null);
      setReviewingId(null);
    } catch {
      showToast("Could not reject. Please try again.", "error");
    } finally {
      setRejectBusy(false);
    }
  }

  const rejectReasonTooLong = rejectReason.length > REASON_MAX_LENGTH;
  const reviewing = verifications.find((v) => v.id === reviewingId) ?? null;

  // Same treatment ConfirmDialog gets: Escape to close, Tab kept inside the
  // dialog, and focus handed back to whatever opened it.
  const lightboxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!preview) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPreview(null);
        return;
      }
      if (e.key !== "Tab") return;
      const root = lightboxRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    lightboxRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
  }, [preview]);

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-white font-bold" style={{ fontSize: "var(--fs-2xl)", letterSpacing: "-0.025em" }}>Provider Verification Queue</h1>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Review submitted government IDs and service certificates</div>
        </div>
        {/* Amber is a call to act. An empty queue is good news, so it reads
            as a plain confirmation rather than a warning about nothing. */}
        {counts.pending > 0 ? (
          <div className="flex items-center gap-1.5 font-semibold" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--r-md)", padding: "7px 11px", fontSize: "var(--fs-xs)", color: "var(--warning-text)" }}>
            <AlertTriangle size={12} /> {counts.pending} pending
          </div>
        ) : (
          <div className="flex items-center gap-1.5" style={{ borderRadius: "var(--r-md)", padding: "7px 11px", fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
            <Check size={12} style={{ color: "var(--success-text)" }} /> Queue clear
          </div>
        )}
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <div className="relative" style={{ flex: "1 1 200px", maxWidth: 360 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="currentColor" style={{ color: "var(--text-white)" }} />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by name or email…"
            aria-label="Search verifications by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: "var(--r-md)", padding: "0 13px 0 36px", fontSize: "var(--fs-sm)", fontFamily: "inherit", color: "var(--text-white)" }}
          />
        </div>
        <div className="inline-flex flex-wrap" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: "var(--r-md)", gap: 2 }}>
          {(["all", "pending", "approved", "rejected"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx("flex items-center gap-1 rounded-lg font-medium cursor-pointer transition-all", filter !== f && "text-gray-500 hover:text-gray-300")}
              style={{ padding: "7px 11px", fontSize: "var(--fs-xs)", background: filter === f ? "var(--indigo-dark)" : "transparent", color: filter === f ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit" }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)} <span style={{ fontSize: "var(--fs-3xs)", opacity: 0.7 }}>({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
          Review each submission before approving or rejecting provider access.
        </span>
        <button
          onClick={() => setConfirmingExport(true)}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "7px 13px", fontSize: "var(--fs-xs)", color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> Export queue
        </button>
      </div>

      <div>
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: "var(--fs-md)" }}>
            {loading
              ? "Loading verifications…"
              : verifications.length === 0
                ? "No verifications submitted yet."
                : "No verifications match this search or filter."}
          </div>
        )}
        {filtered.map((v) => (
          <div key={v.id} className="rounded-xl mb-2.5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div className="flex items-center gap-3 flex-wrap" style={{ padding: 13 }}>
              <div className="flex items-center justify-center flex-shrink-0 font-bold" style={{ width: 38, height: 38, borderRadius: "var(--r-lg)", background: "var(--indigo-dark)", color: "var(--indigo-light)", fontSize: "var(--fs-xs)" }}>{v.initials}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 font-semibold flex-wrap" style={{ fontSize: "var(--fs-md)" }}>
                  {v.name}
                  <span className={clsx("badge", `badge-${v.status}`)}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</span>
                </div>
                <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-muted)", marginTop: 2 }}>{v.email} · Submitted {v.date} · {v.documents.length} document{v.documents.length === 1 ? "" : "s"}</div>
              </div>
              <button
                onClick={() => setReviewingId(v.id)}
                className="flex items-center gap-1.5 font-semibold transition-colors flex-shrink-0"
                style={{ background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.3)", borderRadius: "var(--r-md)", padding: "8px 16px", fontSize: "var(--fs-xs)", color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
              >
                Review submission
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Review drawer — replaces the old inline row expand. */}
      <ReviewDrawer
        open={reviewing !== null}
        onClose={() => setReviewingId(null)}
        title={reviewing?.name ?? ""}
        subtitle={reviewing ? `Provider verification · Submitted ${reviewing.date}` : undefined}
        footer={
          reviewing?.status === "pending" ? (
            <>
              <button
                onClick={() => reviewing && openRejectPrompt(reviewing.id)}
                className="flex-1 flex items-center justify-center gap-1.5 font-semibold transition-colors"
                style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--r-md)", padding: "9px 14px", fontSize: "var(--fs-sm)", color: "var(--danger-text)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <X size={13} /> Reject
              </button>
              <button
                onClick={() => reviewing && handleApproveOne(reviewing.id)}
                disabled={approveBusyId === reviewing?.id}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                style={{ borderRadius: "var(--r-md)", padding: "9px 14px", fontSize: "var(--fs-sm)" }}
              >
                <Check size={13} /> {approveBusyId === reviewing?.id ? "Approving…" : "Approve Provider"}
              </button>
            </>
          ) : (
            <button
              onClick={() => setReviewingId(null)}
              className="flex-1 font-semibold transition-colors"
              style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "9px 14px", fontSize: "var(--fs-sm)", color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
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
                <DrawerField label="Email" value={reviewing.email} />
                <DrawerField label="Status" value={<span className={clsx("badge", `badge-${reviewing.status}`)}>{reviewing.status.charAt(0).toUpperCase() + reviewing.status.slice(1)}</span>} />
                <DrawerField label="Submitted" value={reviewing.date} />
                <DrawerField label="Documents" value={`${reviewing.documents.length} submitted`} />
              </div>
            </DrawerSection>
            <DrawerSection>
              <div style={{ fontSize: "var(--fs-3xs)", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Submitted documents</div>
              <div className="grid grid-cols-2 gap-2">
                {reviewing.documents.length === 0 && (
                  <span style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>No documents available</span>
                )}
                {reviewing.documents.map((doc) => (
                  <button
                    key={doc.label}
                    onClick={() => setPreview(doc)}
                    className="flex items-center gap-1.5 font-medium transition-opacity hover:opacity-80"
                    style={{ background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.2)", borderRadius: "var(--r-sm)", padding: "6px 10px", fontSize: "var(--fs-2xs)", color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <FileText size={12} /> {doc.label}
                  </button>
                ))}
              </div>
            </DrawerSection>
          </>
        )}
      </ReviewDrawer>

      {/* Document lightbox */}
      {preview && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", zIndex: 200 }}
          onClick={() => setPreview(null)}
        >
          <div
            ref={lightboxRef}
            role="dialog"
            aria-modal="true"
            aria-label={preview.label}
            tabIndex={-1}
            className="rounded-xl overflow-hidden outline-none"
            style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", maxWidth: "min(600px, 90vw)", maxHeight: "85vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-white font-semibold" style={{ fontSize: "var(--fs-md)" }}>{preview.label}</span>
              <button onClick={() => setPreview(null)} aria-label="Close document preview" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
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

      <ConfirmDialog
        open={rejectTargetId !== null}
        title="Reject this verification?"
        message="The provider will need to resubmit their documents. Add a reason so it's on the record."
        confirmLabel="Reject"
        busy={rejectBusy}
        confirmDisabled={rejectReasonTooLong}
        onConfirm={confirmReject}
        onCancel={() => setRejectTargetId(null)}
      >
        <textarea
          autoFocus
          placeholder="Reason (optional, shown in the audit log)"
          aria-label="Rejection reason (optional)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          className="w-full text-white outline-none"
          style={{ background: "var(--input-bg)", border: `1px solid ${rejectReasonTooLong ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: "var(--r-md)", padding: "8px 11px", fontSize: "var(--fs-xs)", fontFamily: "inherit", resize: "vertical" }}
        />
        <div
          className="mt-1 text-right"
          style={{ fontSize: "var(--fs-2xs)", color: rejectReasonTooLong ? "var(--danger-text)" : "var(--text-muted)" }}
        >
          {rejectReason.length}/{REASON_MAX_LENGTH}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message={`This downloads ${filtered.length} row${filtered.length === 1 ? "" : "s"} as a .csv file to your device.`}
        confirmLabel="Export"
        onConfirm={() => {
          setConfirmingExport(false);
          exportCsv();
        }}
        onCancel={() => setConfirmingExport(false)}
      />
    </div>
  );
}
