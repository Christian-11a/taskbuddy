"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/adapters";
import { cn } from "@/lib/utils";
import {
  canRevoke,
  getIdentityDocuments,
  getVerificationHistory,
  revokeVerification,
  type VerificationHistoryEntry,
} from "@/lib/services";

/** Same limits the API enforces (RevokeVerificationDto). */
export const REVOKE_REASON_MIN = 10;
export const REVOKE_REASON_MAX = 500;

export function revokeReasonError(reason: string): string | null {
  const length = reason.trim().length;
  if (length < REVOKE_REASON_MIN) return `Give a reason of at least ${REVOKE_REASON_MIN} characters.`;
  if (length > REVOKE_REASON_MAX) return `Keep the reason under ${REVOKE_REASON_MAX + 1} characters.`;
  return null;
}

/** Badge text and tone shared by the History table and the Users drawer. */
export function resultBadge(result: VerificationHistoryEntry["result"]): { label: string; tone: "ok" | "warn" | "danger" } {
  if (result === "approved") return { label: "Approved", tone: "ok" };
  if (result === "expired") return { label: "Approved (now expired)", tone: "warn" };
  if (result === "revoked") return { label: "Revoked", tone: "danger" };
  return { label: "Rejected", tone: "danger" };
}

/** What the admin is told after revoking. `verified` is the provider's state after the last revoke. */
export function revokedNotice(count: number, result: { verified: boolean; withdrawnProposals: number }): string {
  const what = count === 1 ? "Revoked." : `Revoked ${count} items.`;
  const status = result.verified
    ? "The provider is still verified for their main service."
    : "The provider is no longer verified.";
  const withdrawn =
    result.withdrawnProposals === 0
      ? ""
      : ` ${result.withdrawnProposals} pending proposal${result.withdrawnProposals === 1 ? " was" : "s were"} withdrawn.`;
  return `${what} ${status}${withdrawn}`;
}

/** The confirmation text for what is ticked. */
export function revokeEffect(selected: readonly Pick<VerificationHistoryEntry, "kind">[], providerName: string): string {
  const identity = selected.some((entry) => entry.kind === "identity");
  const first = identity
    ? `${providerName} loses the Verified badge.`
    : `${providerName} can no longer take jobs in ${selected.length === 1 ? "this service" : "these services"} unless another valid certificate covers ${selected.length === 1 ? "it" : "them"}.`;
  return `${first} Proposals they have not been hired for yet are withdrawn, unless the client is already paying. Jobs they were hired for continue. They get a notification with your reason and can upload new documents.`;
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Could not revoke. Please try again.";
}

/** Opens a document in a new tab. Links are private and expire, so they are never shown as text. */
function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

/** "View ID and selfie": the identity files are signed on demand, one request per click. */
function IdentityDocuments({ entry }: { entry: VerificationHistoryEntry }) {
  const [docs, setDocs] = useState<string[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  if (entry.subject.includes("Stripe")) return <span className="text-subtle">Checked by Stripe, no copy kept</span>;
  if (docs) {
    if (docs.length === 0) return <span className="text-subtle">No files on record</span>;
    return (
      <span className="flex gap-3">
        {docs.map((href, i) => (
          <DocLink key={href} href={href}>
            {i === 0 ? "ID photo" : i === 1 ? "Selfie" : `File ${i + 1}`}
          </DocLink>
        ))}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="text-primary underline-offset-2 hover:underline disabled:opacity-60"
      disabled={state === "loading"}
      onClick={() => {
        setState("loading");
        getIdentityDocuments(entry).then(
          (urls) => {
            setDocs(urls);
            setState("idle");
          },
          () => setState("failed"),
        );
      }}
    >
      {state === "loading" ? "Loading…" : state === "failed" ? "Could not load, try again" : "View ID and selfie"}
    </button>
  );
}

/**
 * The provider's approved and revoked ID check and certificates, with their
 * files, and one form to revoke any of them: just the ID, just a certificate,
 * or several at once, with one reason. This is the only place revoke happens;
 * Verifications → History is the record.
 */
export function ProviderVerificationSection({
  providerId,
  providerName,
  onChanged,
}: {
  providerId: string;
  providerName: string;
  onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<VerificationHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    getVerificationHistory().then(
      (all) => {
        if (cancelled) return;
        setFailed(false);
        setEntries(all.filter((entry) => entry.providerId === providerId && entry.result !== "rejected"));
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [providerId, reload]);

  if (failed) return <p className="text-[13px] text-danger">Could not load this provider&apos;s verifications.</p>;
  if (!entries) return <p className="text-[13px] text-muted-foreground">Loading verifications…</p>;

  const picked = entries.filter((entry) => selected.has(entry.id));
  const invalid = revokeReasonError(reason);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    setBusy(true);
    setError("");
    let last = { verified: true, withdrawnProposals: 0 };
    let withdrawn = 0;
    let done = 0;
    const failures: string[] = [];
    // One revoke per item, so each has its own audit row and notification.
    for (const entry of picked) {
      try {
        last = await revokeVerification(entry, reason);
        withdrawn += last.withdrawnProposals;
        done += 1;
      } catch (err) {
        failures.push(`${entry.subject}: ${errorText(err)}`);
      }
    }
    setBusy(false);
    setConfirming(false);
    if (done > 0) {
      setNotice(revokedNotice(done, { verified: last.verified, withdrawnProposals: withdrawn }));
      setSelected(new Set());
      setReason("");
      setTouched(false);
      setReload((n) => n + 1);
      onChanged?.();
    }
    if (failures.length > 0) setError(`Not revoked: ${failures.join("; ")}`);
  }

  return (
    <div className="space-y-3">
      {notice && (
        <p role="status" className="text-[12.5px] text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No approved ID check or certificate.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[10px] border border-border" aria-label="Verification items">
          {entries.map((entry) => {
            const badge = resultBadge(entry.result);
            const revocable = canRevoke(entry);
            return (
              <li key={entry.id} className="flex items-start gap-2.5 px-3 py-2.5 text-[12.5px]">
                {revocable ? (
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--color-danger,#dc2626)]"
                    aria-label={`Select ${entry.subject} to revoke`}
                    checked={selected.has(entry.id)}
                    onChange={() => toggle(entry.id)}
                  />
                ) : (
                  <span className="size-4 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground">{entry.subject}</span>
                    <Badge tone={badge.tone} dot>
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    {entry.result === "revoked" ? "Revoked" : "Approved"} {entry.decidedAt ? formatDate(entry.decidedAt) : "—"}
                    {entry.result === "revoked" && entry.reason ? ` — ${entry.reason}` : ""}
                  </div>
                  <div className="mt-1">
                    {entry.kind === "identity" ? (
                      <IdentityDocuments entry={entry} />
                    ) : entry.documentUrl ? (
                      <DocLink href={entry.documentUrl}>View certificate</DocLink>
                    ) : (
                      <span className="text-subtle">No file on record</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {picked.length > 0 && (
        <div className="rounded-[10px] border border-danger/25 bg-danger-soft/50 p-3">
          <Input
            placeholder="Reason, shown to the provider (required)"
            aria-label="Revoke reason (required)"
            aria-invalid={(touched && !!invalid) || undefined}
            value={reason}
            maxLength={REVOKE_REASON_MAX + 50}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          <div className="mt-1 flex justify-between gap-2 text-[11px]">
            <span className="text-danger">{touched && invalid ? invalid : ""}</span>
            <span className={cn("tabular", reason.trim().length > REVOKE_REASON_MAX ? "text-danger" : "text-subtle")}>
              {reason.trim().length}/{REVOKE_REASON_MAX}
            </span>
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="destructive"
              disabled={!!invalid}
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
            >
              Revoke {picked.length === 1 ? "selected item" : `${picked.length} selected items`}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={picked.length === 1 ? `Revoke ${picked[0]?.kind === "identity" ? "the ID check" : "this certificate"}?` : `Revoke ${picked.length} items?`}
        message={revokeEffect(picked, providerName)}
        confirmLabel="Revoke"
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setConfirming(false)}
      >
        <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-foreground">
          {picked.map((entry) => (
            <li key={entry.id}>{entry.subject}</li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-muted-foreground">Reason: {reason.trim()}</p>
      </ConfirmDialog>
    </div>
  );
}
