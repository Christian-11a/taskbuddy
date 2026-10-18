"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileBadge, FileText, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReasonField } from "@/components/ui/input";
import { Pagination } from "@/components/ui/Pagination";
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
  initialsOf,
  neighborAfterRemoval,
  useIsWide,
  useQueueKeys,
} from "@/components/admin/queue";
import { useLiveTick } from "@/hooks/useLiveTick";
import { formatDate } from "@/lib/adapters";
import { approveCredential, getCredentials, rejectCredential, type Credential, type CredentialStatus } from "@/lib/services";

/** The API accepts 1 to 500 characters. */
const REASON_MAX = 500;
const PAGE_SIZE = 20;

const TYPE_LABEL: Record<Credential["type"], string> = {
  tesda_nc: "TESDA certificate",
  prc_license: "PRC licence",
  trade_certificate: "Trade certificate",
  other: "Other credential",
};

const STATUS_META: Record<Credential["status"], { label: string; tone: "warn" | "ok" | "danger" | "neutral" }> = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
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

/**
 * Providers upload TESDA certificates, PRC licences and trade certificates; an
 * admin checks each against the provider's account and approves or rejects it.
 * A rejection needs a reason, which the provider reads in their notification.
 * The document link is signed and lasts an hour, so reloading the list gives
 * a fresh one.
 */
export function CredentialsPage() {
  const { showToast } = useToast();
  const isWide = useIsWide();
  const [status, setStatus] = useState<CredentialStatus>("pending");
  const [items, setItems] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approving, setApproving] = useState<Credential | null>(null);
  const [rejecting, setRejecting] = useState<Credential | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneThisSession, setDoneThisSession] = useState(0);
  /** Ids whose document failed to load, usually because the link expired. */
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  // Only the newest request may write state.
  const requestSeq = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const seq = ++requestSeq.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const result = await getCredentials({ status, page, pageSize: PAGE_SIZE });
      if (seq !== requestSeq.current) return;
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setBrokenIds(new Set());
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(errorText(err, "Could not load credentials. Please try again."));
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [status, page]);

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

  async function decide(kind: "approve" | "reject") {
    const target = kind === "approve" ? approving : rejecting;
    if (!target) return;
    setBusy(true);
    try {
      if (kind === "approve") await approveCredential(target.id);
      else await rejectCredential(target.id, reason.trim());
      showToast(kind === "approve" ? "Credential approved." : "Credential rejected.");
      setApproving(null);
      setRejecting(null);
      setReason("");
      setSelectedId(neighborAfterRemoval(ids, target.id));
      setItems((prev) => prev.filter((i) => i.id !== target.id));
      setDoneThisSession((n) => n + 1);
      await load(true);
    } catch (err) {
      showToast(errorText(err, "Could not update this credential."), "error");
    } finally {
      setBusy(false);
    }
  }

  function openApprove(item: Credential) {
    if (item.expiresOn && item.expiresOn < manilaToday()) return;
    setApproving(item);
  }
  function openReject(item: Credential) { setReason(""); setRejecting(item); }
  function refreshLinks() { setRefreshing(true); void load(true); }

  const pending = selected?.status === "pending";
  const expiredOn = pending && selected?.expiresOn && selected.expiresOn < manilaToday() ? selected.expiresOn : null;
  useQueueKeys({
    ids,
    selectedId: effectiveId,
    onSelect: setSelectedId,
    onApprove: pending && !expiredOn && !busy ? () => openApprove(selected!) : undefined,
    onReject: pending && !busy ? () => openReject(selected!) : undefined,
  });

  const listBody = loading ? (
    <QueueListSkeleton />
  ) : error ? (
    <QueueListState icon={AlertTriangle} tone="danger" title="Couldn't load credentials" description={error} action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>} />
  ) : items.length === 0 ? (
    <QueueListState
      icon={status === "pending" ? ShieldCheck : FileBadge}
      tone={status === "pending" ? "ok" : "neutral"}
      title={status === "pending" ? "No credentials waiting for review" : `No ${status} credentials`}
    />
  ) : (
    <QueueList label="Provider credentials">
      {items.map((item) => (
        <QueueItem
          key={item.id}
          id={item.id}
          selected={item.id === effectiveId}
          onSelect={setSelectedId}
          leading={<Avatar initials={initialsOf(item.providerName)} tone={item.status === "pending" ? "accent" : "neutral"} />}
          title={item.providerName}
          trailing={<span className="text-[11.5px] text-subtle">{formatDate(item.createdAt)}</span>}
          meta={`${TYPE_LABEL[item.type]} · ${item.title}`}
          aside={<Badge tone={STATUS_META[item.status].tone} dot>{STATUS_META[item.status].label}</Badge>}
        />
      ))}
    </QueueList>
  );

  const docUrl = selected?.documentUrl ?? null;
  const docBroken = !!selected && brokenIds.has(selected.id);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Credentials"
        description="TESDA certificates, PRC licences and trade certificates that providers upload. Approved ones show as a Certified badge."
        actions={
          <Button variant="outline" size="sm" onClick={refreshLinks} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <QueueShell
        showDetailOnNarrow={!!selectedId && !!selected}
        onBack={() => setSelectedId(null)}
        storageKey="admin.queue.credentials"
        railCount={total}
        railLabel="credentials"
        toolbar={
          <>
            <FilterTabs
              id="credentials"
              label="Filter credentials by status"
              value={status}
              onChange={(s) => { setStatus(s); setPage(1); setSelectedId(null); }}
              options={[
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
            {status === "pending" ? (
              <QueueProgress remaining={total} done={doneThisSession} noun={total === 1 ? "credential" : "credentials"} />
            ) : (
              <span className="tabular text-[12px] text-muted-foreground">{total.toLocaleString()} credential{total === 1 ? "" : "s"}</span>
            )}
          </>
        }
        list={
          <>
            {listBody}
            {!loading && !error && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(next) => { setPage(next); setSelectedId(null); }} itemLabel="credentials" />}
            <KeyHints approve="approve" reject="reject" />
          </>
        }
        detail={
          selected ? (
            <DetailCard
              key={selected.id}
              header={
                <div className="flex items-start gap-3.5">
                  <Avatar initials={initialsOf(selected.providerName)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[17px] font-semibold tracking-tight">{selected.providerName}</h2>
                      <Badge tone={STATUS_META[selected.status].tone} dot>{STATUS_META[selected.status].label}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">{TYPE_LABEL[selected.type]} · Submitted {formatDate(selected.createdAt)}</p>
                  </div>
                </div>
              }
              footer={
                selected.status === "pending" ? (
                  <>
                    {expiredOn && (
                      <p role="note" className="mr-auto self-center text-[12.5px] text-danger">
                        Expired on {formatDate(expiredOn)} — can&apos;t be approved
                      </p>
                    )}
                    <Button variant="destructive-outline" onClick={() => openReject(selected)} disabled={busy}>
                      <XCircle /> Reject
                    </Button>
                    <Button onClick={() => openApprove(selected)} disabled={busy || !!expiredOn}>
                      <CheckCircle2 /> Approve
                    </Button>
                  </>
                ) : undefined
              }
            >
              <DetailSection title="Credential">
                <FieldGrid>
                  <Field label="Title">{selected.title}</Field>
                  <Field label="Issuer">{selected.issuer}</Field>
                  <Field label="Type">{TYPE_LABEL[selected.type]}</Field>
                  <Field label="Service">{selected.categoryName}</Field>
                  <Field label="Number">{selected.number ?? "—"}</Field>
                  <Field label="Issued">{selected.issuedOn ? formatDate(selected.issuedOn) : "—"}</Field>
                  <Field label="Expires">{selected.expiresOn ? formatDate(selected.expiresOn) : "—"}</Field>
                </FieldGrid>
              </DetailSection>
              <DetailSection title="Document">
                {!docUrl ? (
                  <p className="rounded-[10px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                    The document could not be linked.{" "}
                    <button type="button" className="font-medium text-primary underline" onClick={refreshLinks}>Refresh link</button>
                  </p>
                ) : docBroken ? (
                  <p role="alert" className="rounded-[10px] border border-dashed border-border-strong px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                    The document link may have expired.{" "}
                    <button type="button" className="font-medium text-primary underline" onClick={refreshLinks}>Refresh link</button>
                  </p>
                ) : isPdf(docUrl) ? (
                  <a
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-4 py-3 text-[13px] font-medium hover:shadow-ui-md"
                  >
                    <FileText className="size-4 text-muted-foreground" /> Open PDF in a new tab <ExternalLink className="size-3.5 text-subtle" />
                  </a>
                ) : (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not an optimizable static asset */}
                    <img
                      src={docUrl}
                      alt={`${selected.title} document`}
                      onError={() => setBrokenIds((prev) => new Set(prev).add(selected.id))}
                      className="max-h-[420px] w-full rounded-[10px] border border-border bg-surface-2 object-contain"
                    />
                    <a href={docUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline">
                      Open full size <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                )}
              </DetailSection>
              {selected.status === "rejected" && (
                <DetailSection title="Decision">
                  <FieldGrid>
                    <Field label="Reason sent to provider">{selected.rejectionReason ?? "—"}</Field>
                  </FieldGrid>
                </DetailSection>
              )}
              {pending && (
                <p className="rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  Check that the name, title and number on the document match what the provider entered, and that it has not expired.
                </p>
              )}
            </DetailCard>
          ) : (
            <DetailEmpty queueEmpty={items.length === 0} title="Pick a credential" description="Select a credential on the left to see the document and decide." />
          )
        }
      />

      <ConfirmDialog
        open={!!approving}
        title="Approve this credential?"
        message={approving ? `${approving.providerName}'s ${approving.title} will show as a Certified badge on ${approving.categoryName}.` : ""}
        confirmLabel="Approve"
        danger={false}
        busy={busy}
        onConfirm={() => void decide("approve")}
        onCancel={() => !busy && setApproving(null)}
      />
      <ConfirmDialog
        open={!!rejecting}
        title="Reject this credential?"
        message="The provider is notified with your reason and can upload a new one."
        confirmLabel="Reject credential"
        busy={busy}
        confirmDisabled={!reason.trim() || reason.length > REASON_MAX}
        onConfirm={() => void decide("reject")}
        onCancel={() => !busy && setRejecting(null)}
      >
        <ReasonField autoFocus required value={reason} onChange={setReason} max={REASON_MAX} label="Reason" placeholder="Tell the provider what is wrong with it" />
      </ConfirmDialog>
    </div>
  );
}
