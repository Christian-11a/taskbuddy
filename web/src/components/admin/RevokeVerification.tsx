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

/** "Revoked" badge text and tone shared by the History table and the Users drawer. */
export function resultBadge(result: VerificationHistoryEntry["result"]): { label: string; tone: "ok" | "warn" | "danger" } {
  if (result === "approved") return { label: "Approved", tone: "ok" };
  if (result === "expired") return { label: "Approved (now expired)", tone: "warn" };
  if (result === "revoked") return { label: "Revoked", tone: "danger" };
  return { label: "Rejected", tone: "danger" };
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Could not revoke. Please try again.";
}

/**
 * Asks for a required reason, then revokes one approved identity check or
 * certificate. The provider loses Verified until they upload new documents.
 */
export function RevokeDialog({
  entry,
  onCancel,
  onRevoked,
}: {
  entry: VerificationHistoryEntry | null;
  onCancel: () => void;
  onRevoked: (entry: VerificationHistoryEntry, result: { verified: boolean; withdrawnProposals: number }) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- reset the form for each row opened */
  useEffect(() => {
    setReason("");
    setError("");
    setTouched(false);
  }, [entry?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalid = revokeReasonError(reason);

  async function confirm() {
    if (!entry || invalid) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await revokeVerification(entry, reason);
      onRevoked(entry, result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={!!entry}
      title={entry?.kind === "identity" ? "Revoke ID verification?" : "Revoke this certificate?"}
      message={
        entry
          ? entry.kind === "identity"
            ? `${entry.providerName} loses the Verified badge. Proposals they have not been hired for yet are withdrawn, unless the client is already paying. Jobs they were hired for continue. They see the reason and can upload new documents.`
            : `${entry.providerName} can no longer take jobs in this service unless another valid certificate covers it. Their proposals for it that are not hired yet are withdrawn, unless the client is already paying. Hired jobs continue. They see the reason and can upload a new certificate.`
          : ""
      }
      confirmLabel="Revoke"
      busy={busy}
      confirmDisabled={!!invalid}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      {entry && <p className="mb-2 text-[12.5px] text-foreground">{entry.subject}</p>}
      <Input
        autoFocus
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
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

/**
 * The provider's approved and revoked identity checks and certificates, for the
 * Users drawer, each approved one with a Revoke button.
 */
export function ProviderVerificationItems({ providerId, onChanged }: { providerId: string; onChanged?: () => void }) {
  const [entries, setEntries] = useState<VerificationHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [revoking, setRevoking] = useState<VerificationHistoryEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

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

  return (
    <div className="space-y-2">
      {notice && (
        <p role="status" className="text-[12.5px] text-muted-foreground">
          {notice}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No approved ID check or certificate.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[10px] border border-border">
          {entries.map((entry) => {
            const badge = resultBadge(entry.result);
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12.5px]">
                <div className="min-w-0 flex-1">
                  <div className="text-foreground">{entry.subject}</div>
                  <div className="text-muted-foreground">
                    {entry.result === "revoked" ? "Revoked" : "Decided"} {entry.decidedAt ? formatDate(entry.decidedAt) : "—"}
                    {entry.result === "revoked" && entry.reason ? ` — ${entry.reason}` : ""}
                  </div>
                </div>
                <Badge tone={badge.tone} dot>
                  {badge.label}
                </Badge>
                {canRevoke(entry) && (
                  <Button size="sm" variant="outline" onClick={() => setRevoking(entry)}>
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <RevokeDialog
        entry={revoking}
        onCancel={() => setRevoking(null)}
        onRevoked={(_entry, result) => {
          setRevoking(null);
          setNotice(revokedNotice(result));
          setReload((n) => n + 1);
          onChanged?.();
        }}
      />
    </div>
  );
}

export function revokedNotice(result: { verified: boolean; withdrawnProposals: number }): string {
  const status = result.verified ? "Revoked. The provider is still verified through another approval." : "Revoked. The provider is no longer verified.";
  if (result.withdrawnProposals === 0) return status;
  return `${status} ${result.withdrawnProposals} pending proposal${result.withdrawnProposals === 1 ? " was" : "s were"} withdrawn.`;
}
