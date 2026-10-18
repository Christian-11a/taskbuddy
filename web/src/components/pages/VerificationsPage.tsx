"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, BadgeCheck, Check, ExternalLink, FileText, RefreshCw, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, ReasonField } from "@/components/ui/input";
import { Pagination } from "@/components/ui/Pagination";
import { PageHeader } from "@/components/admin/Panel";
import {
  Avatar,
  DetailCard,
  DetailEmpty,
  DetailSection,
  Field,
  FieldGrid,
  KeyHints,
  QueueItem,
  QueueList,
  QueueListSkeleton,
  QueueListState,
  QueueProgress,
  QueueShell,
  initialsOf,
  neighborAfterRemoval,
  useIsWide,
  useQueueKeys,
} from "@/components/admin/queue";
import { useLiveTick } from "@/hooks/useLiveTick";
import { formatDate } from "@/lib/adapters";
import type { CasePart } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { decideVerificationCase, getVerificationCases, getVerificationHistory, type VerificationCase, type VerificationHistoryEntry } from "@/lib/services";

/** The API accepts a note of up to 500 characters. */
const NOTE_MAX = 500;
const PAGE_SIZE = 20;

const TYPE_LABEL = {
  tesda_nc: "TESDA certificate",
  prc_license: "PRC licence",
  trade_certificate: "Trade certificate",
  other: "Other credential",
} as const;

const PART_LABEL: Record<CasePart, string> = { id: "Government ID", selfie: "Selfie", certificate: "Certificate" };

/** What to ask for, per service (what providers are told in the app). */
const CERTIFICATE_GUIDANCE: Record<string, string> = {
  plumbing: "TESDA Plumbing NC II",
  cleaning: "Housekeeping NC II",
  handyman: "Carpentry or Electrical Installation NC II",
  manicure: "Beauty Care NC II",
  pedicure: "Beauty Care NC II",
};

/** Signed links end in a file name before the token, so the extension tells a PDF from a photo. */
function isPdf(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Today in Manila as YYYY-MM-DD, the same date the API compares expiry with. */
function manilaToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** The parts of this case an admin can fail. A Stripe-approved identity leaves only the certificate. */
function failablePartsOf(c: VerificationCase): CasePart[] {
  const parts: CasePart[] = [];
  if (c.verification) {
    parts.push("id");
    if (c.verification.method !== "stripe_identity") parts.push("selfie");
  }
  if (c.credential) parts.push("certificate");
  return parts;
}

function expiredOnOf(c: VerificationCase): string | null {
  const exp = c.credential?.expiresOn;
  return exp && exp < manilaToday() ? exp : null;
}

/** A signed document, shown inline when it is an image and as a link when it is a PDF. */
function DocumentView({ url, title, broken, onBroken, onRefresh }: { url: string | null; title: string; broken: boolean; onBroken: () => void; onRefresh: () => void }) {
  if (!url) {
    return (
      <p className="rounded-[10px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted-foreground">
        The document could not be linked.{" "}
        <button type="button" className="font-medium text-primary underline" onClick={onRefresh}>Refresh link</button>
      </p>
    );
  }
  if (broken) {
    return (
      <p role="alert" className="rounded-[10px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted-foreground">
        The document link may have expired.{" "}
        <button type="button" className="font-medium text-primary underline" onClick={onRefresh}>Refresh link</button>
      </p>
    );
  }
  if (isPdf(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-4 py-3 text-[13px] font-medium hover:shadow-ui-md"
      >
        <FileText className="size-4 text-muted-foreground" /> Open PDF in a new tab <ExternalLink className="size-3.5 text-subtle" />
      </a>
    );
  }
  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not an optimizable static asset */}
      <img src={url} alt={title} onError={onBroken} className="max-h-[420px] w-full rounded-[10px] border border-border bg-surface-2 object-contain" />
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline">
        Open full size <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

/**
 * One case per provider: government ID, selfie and the certificate for their
 * service, reviewed together. A provider is verified only when identity passes
 * AND an unexpired certificate is approved, so the decision covers every
 * pending part in one call. Certificate-only cases (Stripe already approved
 * identity, a renewal, a second service) arrive in the same queue.
 *
 * Provider verification is a trust-and-safety decision, so there is no bulk
 * approve here on purpose. See docs/TaskBuddyCompleteRefinement.md §28.
 */
export function VerificationsPage() {
  const [tab, setTab] = useState<"review" | "history">("review");
  const tabs = <VerificationTabs tab={tab} onChange={setTab} />;
  return tab === "review" ? <ReviewQueue tabs={tabs} /> : <HistoryView tabs={tabs} />;
}

function VerificationTabs({ tab, onChange }: { tab: "review" | "history"; onChange: (t: "review" | "history") => void }) {
  return (
    <div role="tablist" aria-label="Verifications" className="mb-4 flex gap-1 border-b border-border">
      {([["review", "To review"], ["history", "History"]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => onChange(key)}
          className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ReviewQueue({ tabs }: { tabs: ReactNode }) {
  const { refreshCounts } = useApp();
  const { showToast } = useToast();
  const isWide = useIsWide();
  const [items, setItems] = useState<VerificationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The A shortcut asks first: a stray key press shouldn't approve a provider.
  const [approving, setApproving] = useState<VerificationCase | null>(null);
  const [rejecting, setRejecting] = useState<VerificationCase | null>(null);
  const [failedParts, setFailedParts] = useState<Set<CasePart>>(new Set());
  const [note, setNote] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneThisSession, setDoneThisSession] = useState(0);
  /** Keys ("<case id>:<document>") whose file failed to load, usually because the link expired. */
  const [brokenKeys, setBrokenKeys] = useState<Set<string>>(new Set());

  // Only the newest request may write state.
  const requestSeq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const seq = ++requestSeq.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await getVerificationCases({ page, pageSize: PAGE_SIZE });
      if (seq !== requestSeq.current) return;
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setBrokenKeys(new Set());
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(errorText(err, "Could not load verifications. Please try again."));
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [page]);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch is an
     external-system synchronization; the state updates happen in its async
     continuation. */
  useEffect(() => {
    void load();
    return () => { requestSeq.current += 1; };
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useLiveTick(() => void load(true));

  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const selected = items.find((i) => i.id === selectedId) ?? (isWide ? items[0] : undefined);
  const effectiveId = selected?.id ?? null;
  const expiredOn = selected ? expiredOnOf(selected) : null;

  async function finish(target: VerificationCase, toast: string) {
    showToast(toast);
    setApproving(null);
    setRejecting(null);
    setNote("");
    setFailedParts(new Set());
    setRejectError("");
    setSelectedId(neighborAfterRemoval(ids, target.id));
    setItems((prev) => prev.filter((i) => i.id !== target.id));
    setDoneThisSession((n) => n + 1);
    void refreshCounts();
    await load(true);
  }

  /** Someone else already decided this case: drop the dialog, say so and reload. */
  function handleConflict(err: unknown): boolean {
    if (!(err instanceof ApiError) || err.status !== 409) return false;
    setApproving(null);
    setRejecting(null);
    setNote("");
    setFailedParts(new Set());
    setRejectError("");
    showToast(errorText(err, "This case was already decided."), "error");
    void refreshCounts();
    void load(true);
    return true;
  }

  async function approve(target: VerificationCase) {
    if (expiredOnOf(target)) return;
    setBusy(true);
    try {
      await decideVerificationCase({ verificationId: target.verification?.id, credentialId: target.credential?.id, decision: "approve" });
      await finish(target, "Case approved.");
    } catch (err) {
      if (handleConflict(err)) return;
      setApproving(null);
      showToast(errorText(err, "Could not approve this case."), "error");
    } finally {
      setBusy(false);
    }
  }

  function openReject(target: VerificationCase) {
    setNote("");
    setRejectError("");
    setFailedParts(new Set());
    setRejecting(target);
  }

  async function confirmReject() {
    if (!rejecting) return;
    const target = rejecting;
    setBusy(true);
    setRejectError("");
    try {
      await decideVerificationCase({
        verificationId: target.verification?.id,
        credentialId: target.credential?.id,
        decision: "reject",
        failedParts: failablePartsOf(target).filter((p) => failedParts.has(p)),
        note: note.trim(),
      });
      await finish(target, "Case rejected.");
    } catch (err) {
      if (handleConflict(err)) return;
      setRejectError(errorText(err, "Could not reject this case. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function togglePart(part: CasePart) {
    setFailedParts((prev) => {
      const next = new Set(prev);
      if (next.has(part)) next.delete(part);
      else next.add(part);
      return next;
    });
  }

  function refreshLinks() { setRefreshing(true); void load(true); void refreshCounts(); }

  useQueueKeys({
    ids,
    selectedId: effectiveId,
    onSelect: setSelectedId,
    onApprove: selected && !expiredOn && !busy ? () => setApproving(selected) : undefined,
    onReject: selected && !busy ? () => openReject(selected) : undefined,
  });

  const listBody = loading ? (
    <QueueListSkeleton />
  ) : error ? (
    <QueueListState icon={AlertTriangle} tone="danger" title="Couldn't load verifications" description={error} action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>} />
  ) : items.length === 0 ? (
    <QueueListState icon={BadgeCheck} tone="ok" title="Queue clear" description="Every provider case has been reviewed." />
  ) : (
    <QueueList label="Verification cases">
      {items.map((c) => (
        <QueueItem
          key={c.id}
          id={c.id}
          selected={c.id === effectiveId}
          onSelect={setSelectedId}
          leading={<Avatar initials={initialsOf(c.name)} tone="accent" />}
          title={c.name}
          trailing={<span className="text-[11.5px] text-subtle">{c.submittedAt ? formatDate(c.submittedAt) : ""}</span>}
          meta={c.email}
          aside={
            <span className="flex items-center gap-2">
              <Badge tone="warn" dot>{c.type}</Badge>
              <span className="text-[11.5px] text-muted-foreground">
                {c.verification ? (c.verification.method === "stripe_identity" ? "ID checked by Stripe" : "ID + selfie") : "Identity approved"}
                {c.credential ? " · certificate" : " · no certificate"}
              </span>
            </span>
          }
        />
      ))}
    </QueueList>
  );

  const rejectParts = rejecting ? failablePartsOf(rejecting) : [];
  const certificateOnly = rejectParts.length === 1 && rejectParts[0] === "certificate";
  const noteTooLong = note.length > NOTE_MAX;
  const rejectInvalid = failedParts.size === 0 || !note.trim() || noteTooLong;
  const guidance = selected?.credential ? CERTIFICATE_GUIDANCE[selected.credential.serviceName.trim().toLowerCase()] : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Verifications"
        description="One case per provider: government ID, selfie and the certificate for their service. A provider is verified only when both the identity check and the certificate are approved."
        actions={
          <Button variant="outline" size="sm" onClick={refreshLinks} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />
      {tabs}

      <QueueShell
        showDetailOnNarrow={!!selectedId && !!selected}
        onBack={() => setSelectedId(null)}
        storageKey="admin.queue.verifications"
        railCount={total}
        railLabel="cases"
        toolbar={<QueueProgress remaining={total} done={doneThisSession} noun={total === 1 ? "case" : "cases"} />}
        list={
          <>
            {listBody}
            {!loading && !error && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(next) => { setPage(next); setSelectedId(null); }} itemLabel="cases" />}
            <KeyHints approve="approve" reject="reject" />
          </>
        }
        detail={
          selected ? (
            <DetailCard
              key={selected.id}
              header={
                <div className="flex items-start gap-3.5">
                  <Avatar initials={initialsOf(selected.name)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[17px] font-semibold tracking-tight">{selected.name}</h2>
                      <Badge tone="warn" dot>{selected.type}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                      {selected.email}{selected.submittedAt ? ` · Submitted ${formatDate(selected.submittedAt)}` : ""}
                    </p>
                  </div>
                </div>
              }
              footer={
                <>
                  {expiredOn && (
                    <p role="note" className="mr-auto self-center text-[12.5px] text-danger">
                      Expired on {formatDate(expiredOn)} — can&apos;t be approved
                    </p>
                  )}
                  <Button variant="destructive-outline" onClick={() => openReject(selected)} disabled={busy}>
                    <X /> Reject
                  </Button>
                  <Button onClick={() => setApproving(selected)} disabled={busy || !!expiredOn}>
                    <Check /> {busy && approving ? "Approving…" : "Approve"}
                  </Button>
                </>
              }
            >
              <DetailSection title="Identity">
                {selected.verification ? (
                  selected.verification.documents.length === 0 ? (
                    <p className="rounded-[10px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                      {selected.verification.method === "stripe_identity" ? "Checked by Stripe Identity — no documents to review" : "No documents available"}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {selected.verification.documents.map((url, i) => {
                        const label = i === 0 ? "ID photo" : i === 1 ? "Selfie" : `Document ${i + 1}`;
                        return (
                          <a
                            key={label}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${label}`}
                            className="group overflow-hidden rounded-[10px] border border-border bg-surface-2 transition-shadow hover:shadow-ui-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
                            <img src={url} alt="" className="h-40 w-full object-contain" />
                            <span className="flex items-center gap-1.5 border-t border-border bg-surface px-3 py-2 text-[12px] font-medium">
                              <FileText className="size-3.5 text-muted-foreground" /> {label}
                              <ExternalLink className="ml-auto size-3.5 text-subtle" />
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
                    {selected.identity === "approved" ? "Identity already approved (Stripe). Only the certificate needs a decision." : "No identity submission is waiting."}
                  </p>
                )}
                {selected.verification && (
                  <FieldGrid>
                    {selected.verification.method !== "stripe_identity" && <Field label="ID type">{selected.verification.documentType ?? "Not specified"}</Field>}
                    <Field label="Checked by">{selected.verification.method === "stripe_identity" ? "Stripe Identity" : "Admin review (ID + selfie)"}</Field>
                  </FieldGrid>
                )}
              </DetailSection>

              <DetailSection title="Certificate">
                {selected.credential ? (
                  <>
                    <FieldGrid>
                      <Field label="Service">{selected.credential.serviceName}</Field>
                      <Field label="Type">{TYPE_LABEL[selected.credential.type]}</Field>
                      <Field label="Title">{selected.credential.title}</Field>
                      <Field label="Issuer">{selected.credential.issuer}</Field>
                      <Field label="Number">{selected.credential.number ?? "—"}</Field>
                      <Field label="Issued">{selected.credential.issuedOn ? formatDate(selected.credential.issuedOn) : "—"}</Field>
                      <Field label="Expires">{selected.credential.expiresOn ? formatDate(selected.credential.expiresOn) : "—"}</Field>
                    </FieldGrid>
                    {guidance && (
                      <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                        For {selected.credential.serviceName}, look for {guidance}. Any TESDA National Certificate, PRC licence or trade certificate that matches the service is acceptable.
                      </p>
                    )}
                    <DocumentView
                      url={selected.credential.documentUrl}
                      title={`${selected.credential.title} document`}
                      broken={brokenKeys.has(`${selected.id}:cert`)}
                      onBroken={() => setBrokenKeys((prev) => new Set(prev).add(`${selected.id}:cert`))}
                      onRefresh={refreshLinks}
                    />
                  </>
                ) : (
                  <p className="rounded-[10px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                    No certificate uploaded yet. Approving the identity alone will not verify the provider.
                  </p>
                )}
              </DetailSection>

              <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                Check that the name matches the account, the selfie matches the ID photo, and the certificate is genuine, matches the service and has not expired. Approve covers every part shown here.
              </p>
            </DetailCard>
          ) : (
            <DetailEmpty queueEmpty={items.length === 0} title="Pick a case" description="Select a provider on the left to see their documents and decide." />
          )
        }
      />

      <ConfirmDialog
        open={!!approving}
        danger={false}
        title="Approve this case?"
        message={approving ? `${approving.name}: ${approving.verification ? "identity and " : ""}${approving.credential ? "certificate" : "documents"} will be approved together.` : ""}
        confirmLabel="Approve"
        busy={busy}
        onConfirm={() => approving && void approve(approving)}
        onCancel={() => !busy && setApproving(null)}
      />

      <ConfirmDialog
        open={!!rejecting}
        title="Reject this case?"
        message={
          certificateOnly
            ? "Only the certificate is being reviewed. The provider is told what to redo."
            : "Tick the parts that failed. Parts you leave unticked are approved, so a certificate-only failure still approves the ID and selfie."
        }
        confirmLabel="Reject"
        busy={busy}
        confirmDisabled={rejectInvalid}
        onConfirm={() => void confirmReject()}
        onCancel={() => !busy && setRejecting(null)}
      >
        <fieldset className="mb-3 space-y-1.5">
          <legend className="mb-1 text-[12px] font-medium text-muted-foreground">Failed parts</legend>
          {rejectParts.map((part) => (
            <label key={part} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={failedParts.has(part)} onChange={() => togglePart(part)} disabled={busy} />
              {PART_LABEL[part]}
            </label>
          ))}
        </fieldset>
        <ReasonField autoFocus required value={note} onChange={setNote} max={NOTE_MAX} label="Note to the provider" placeholder="Tell the provider what to redo" />
        {rejectError && <p role="alert" className="mt-2 text-[12.5px] text-danger">{rejectError}</p>}
      </ConfirmDialog>
    </div>
  );
}

const HISTORY_PAGE_SIZE = 20;

/** Decided identity checks and certificates, newest first. Read-only. */
function HistoryView({ tabs }: { tabs: ReactNode }) {
  const [entries, setEntries] = useState<VerificationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setEntries(await getVerificationHistory());
    } catch (err) {
      setError(errorText(err, "Could not load the history. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The API cannot search these lists, so this filters the loaded rows by provider name.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? entries.filter((e) => e.providerName.toLowerCase().includes(q)) : entries;
  }, [entries, search]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const rows = filtered.slice((current - 1) * HISTORY_PAGE_SIZE, current * HISTORY_PAGE_SIZE);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Verifications"
        description="Every identity check and certificate that has been approved or rejected, newest first."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />
      {tabs}
      <div className="mb-3 max-w-sm">
        <Input type="search" aria-label="Search by provider" placeholder="Search by provider name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>
      {loading ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">Loading history…</p>
      ) : error ? (
        <div role="alert" className="py-10 text-center">
          <p className="text-[13px] text-danger">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Try again</Button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">{search.trim() ? "No decisions match that provider." : "Nothing has been decided yet."}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[12px] border border-border">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 font-medium">Decided</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{e.providerName}</td>
                    <td className="px-3 py-2">{e.subject}</td>
                    <td className="px-3 py-2"><Badge tone={e.result === "approved" ? "ok" : e.result === "expired" ? "warn" : "danger"} dot>{e.result === "approved" ? "Approved" : e.result === "expired" ? "Approved (now expired)" : "Rejected"}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">{e.result === "rejected" ? (e.reason ?? "—") : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{e.decidedAt ? formatDate(e.decidedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={current} pageSize={HISTORY_PAGE_SIZE} total={filtered.length} onPageChange={setPage} itemLabel="decisions" />
        </>
      )}
    </div>
  );
}
