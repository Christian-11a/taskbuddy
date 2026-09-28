"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Check, Download, FileText, Maximize2, ShieldCheck, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReasonField } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  neighborAfterRemoval,
  useIsWide,
  useQueueKeys,
} from "@/components/admin/queue";
import { REASON_MAX_LENGTH } from "@/lib/validation";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import type { VerificationRow } from "@/lib/adapters";

type Filter = "all" | "pending" | "approved" | "rejected";

const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "danger" } as const;
const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected" } as const;

function StatusBadge({ status }: { status: VerificationRow["status"] }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/**
 * Provider verification is a trust-and-safety decision, not a bulk
 * housekeeping task — no "select all pending" / "approve selected" here on
 * purpose. Every provider gets reviewed one at a time before a decision is
 * made. See docs/TaskBuddyCompleteRefinement.md §28.
 */
export function VerificationsPage() {
  const { verifications, approveVerification, rejectVerification, loading } = useApp();
  const { showToast } = useToast();
  const isWide = useIsWide();
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ label: string; url: string } | null>(null);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
  // The A shortcut asks first — a stray key press shouldn't approve a provider.
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  // Reject always confirms and always offers a reason — the backend records
  // it on the audit trail (admin_actions).
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [doneThisSession, setDoneThisSession] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return verifications.filter((v) => {
      const matchFilter = filter === "all" || v.status === filter;
      const matchSearch = !q || v.name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [verifications, filter, search]);
  const ids = useMemo(() => filtered.map((v) => v.id), [filtered]);

  const counts = {
    all: verifications.length,
    pending: verifications.filter((v) => v.status === "pending").length,
    approved: verifications.filter((v) => v.status === "approved").length,
    rejected: verifications.filter((v) => v.status === "rejected").length,
  };

  // Wide screens behave like an inbox: something is always open.
  const selected = filtered.find((v) => v.id === selectedId) ?? (isWide ? filtered[0] : undefined);
  const effectiveId = selected?.id ?? null;

  function exportCsv() {
    const csv = toCsv(
      ["Name", "Email", "Status", "Submitted", "Documents"],
      filtered.map((v) => [v.name, v.email, v.status, v.date, v.documents.length]),
    );
    downloadCsv(datedFilename("taskbuddy-verification-queue"), csv);
  }

  function advanceFrom(id: string) {
    setSelectedId(neighborAfterRemoval(ids, id));
  }

  async function handleApprove(id: string) {
    setConfirmApproveId(null);
    setApproveBusyId(id);
    try {
      await approveVerification(id);
      showToast("Verification approved.");
      setDoneThisSession((n) => n + 1);
      advanceFrom(id);
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
    const id = rejectTargetId;
    setRejectBusy(true);
    try {
      await rejectVerification(id, rejectReason.trim() || undefined);
      showToast("Verification rejected.");
      setRejectTargetId(null);
      setDoneThisSession((n) => n + 1);
      advanceFrom(id);
    } catch {
      showToast("Could not reject. Please try again.", "error");
    } finally {
      setRejectBusy(false);
    }
  }

  useQueueKeys({
    ids,
    selectedId: effectiveId,
    onSelect: setSelectedId,
    onApprove: selected?.status === "pending" && !approveBusyId ? () => setConfirmApproveId(selected.id) : undefined,
    onReject: selected?.status === "pending" ? () => openRejectPrompt(selected.id) : undefined,
  });

  const rejectReasonTooLong = rejectReason.length > REASON_MAX_LENGTH;
  const approveTarget = verifications.find((v) => v.id === confirmApproveId);

  const emptyState = loading ? (
    <QueueListSkeleton />
  ) : verifications.length === 0 ? (
    <QueueListState icon={ShieldCheck} title="No verifications submitted yet" description="New provider submissions will appear here." />
  ) : filter === "pending" && counts.pending === 0 && !search ? (
    <QueueListState icon={BadgeCheck} tone="ok" title="Queue clear" description="Every provider submission has been reviewed." />
  ) : (
    <QueueListState title="Nothing matches" description="Try a different search or filter." />
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Verifications"
        description="Review submitted government IDs and selfies, one provider at a time, before they can take jobs."
        actions={
          <Button variant="outline" size="sm" onClick={() => setConfirmingExport(true)} disabled={filtered.length === 0}>
            <Download /> Export queue
          </Button>
        }
      />

      <QueueShell
        showDetailOnNarrow={!!selectedId && !!selected}
        onBack={() => setSelectedId(null)}
        toolbar={
          <>
            <div className="flex items-center justify-between gap-2">
              <FilterTabs
                id="verifications"
                label="Filter verifications by status"
                value={filter}
                onChange={(f) => {
                  setFilter(f);
                  setSelectedId(null);
                }}
                options={[
                  { value: "pending", label: "Pending", count: counts.pending },
                  { value: "approved", label: "Approved", count: counts.approved },
                  { value: "rejected", label: "Rejected", count: counts.rejected },
                  { value: "all", label: "All", count: counts.all },
                ]}
              />
            </div>
            <SearchField value={search} onChange={setSearch} placeholder="Search by name or email…" label="Search verifications by name or email" />
            <QueueProgress remaining={counts.pending} done={doneThisSession} noun={counts.pending === 1 ? "submission" : "submissions"} />
          </>
        }
        list={
          <>
            {filtered.length === 0 ? (
              emptyState
            ) : (
              <QueueList label="Verification submissions">
                {filtered.map((v) => (
                  <QueueItem
                    key={v.id}
                    id={v.id}
                    selected={v.id === effectiveId}
                    onSelect={setSelectedId}
                    leading={<Avatar initials={v.initials} tone={v.status === "pending" ? "accent" : "neutral"} />}
                    title={v.name}
                    trailing={<span className="text-[11.5px] text-subtle">{v.date}</span>}
                    meta={v.email}
                    aside={
                      <span className="flex items-center gap-2">
                        <StatusBadge status={v.status} />
                        <span className="text-[11.5px] text-muted-foreground">
                          {v.documentType} · {v.documents.length} file{v.documents.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    }
                  />
                ))}
              </QueueList>
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
                  <Avatar initials={selected.initials} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[17px] font-semibold tracking-tight">{selected.name}</h2>
                      <StatusBadge status={selected.status} />
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">Provider verification · Submitted {selected.date}</p>
                  </div>
                </div>
              }
              footer={
                selected.status === "pending" ? (
                  <>
                    <Button variant="destructive-outline" onClick={() => openRejectPrompt(selected.id)} disabled={approveBusyId === selected.id}>
                      <X /> Reject
                    </Button>
                    <Button onClick={() => handleApprove(selected.id)} disabled={approveBusyId === selected.id}>
                      <Check /> {approveBusyId === selected.id ? "Approving…" : "Approve provider"}
                    </Button>
                  </>
                ) : undefined
              }
            >
              <DetailSection title="Applicant">
                <FieldGrid>
                  <Field label="Email">{selected.email}</Field>
                  <Field label="ID type">{selected.documentType}</Field>
                  <Field label="Submitted">{selected.date}</Field>
                  <Field label="Documents">{selected.documents.length} submitted</Field>
                </FieldGrid>
              </DetailSection>
              <DetailSection title="Submitted documents">
                {selected.documents.length === 0 ? (
                  <p className="rounded-[10px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                    No documents available
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {selected.documents.map((doc) => (
                      <button
                        key={doc.label}
                        onClick={() => setPreview(doc)}
                        className="group relative overflow-hidden rounded-[10px] border border-border bg-surface-2 text-left transition-shadow hover:shadow-ui-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Open ${doc.label}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not an optimizable static asset */}
                        <img src={doc.url} alt="" className="h-40 w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]" />
                        <span className="flex items-center gap-1.5 border-t border-border bg-surface px-3 py-2 text-[12px] font-medium">
                          <FileText className="size-3.5 text-muted-foreground" /> {doc.label}
                          <Maximize2 className="ml-auto size-3.5 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </DetailSection>
              {selected.status === "pending" && (
                <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  Check that the name matches the account and the selfie matches the ID photo. Rejections ask the provider to resubmit.
                </p>
              )}
            </DetailCard>
          ) : (
            <DetailEmpty queueEmpty={filtered.length === 0} title="Pick a submission" description="Select a provider on the left to see their documents and decide." />
          )
        }
      />

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-[min(760px,94vw)] p-0">
          <div className="border-b border-border px-5 py-3.5 pr-12">
            <DialogTitle className="text-[15px]">{preview?.label}</DialogTitle>
            <DialogDescription className="sr-only">Full-size document preview</DialogDescription>
          </div>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
            <img src={preview.url} alt={preview.label} className="mx-auto block max-h-[74vh] max-w-full object-contain p-3" />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!approveTarget}
        danger={false}
        title="Approve this provider?"
        message={approveTarget ? `${approveTarget.name} will be able to accept jobs right away.` : ""}
        confirmLabel="Approve"
        busy={approveBusyId !== null}
        onConfirm={() => approveTarget && handleApprove(approveTarget.id)}
        onCancel={() => setConfirmApproveId(null)}
      />

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
        <ReasonField
          autoFocus
          value={rejectReason}
          onChange={setRejectReason}
          max={REASON_MAX_LENGTH}
          label="Rejection reason (optional)"
          placeholder="Reason (optional, shown in the audit log)"
        />
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
