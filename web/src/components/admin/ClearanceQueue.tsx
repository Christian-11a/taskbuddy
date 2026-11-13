"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ImageViewer } from "@/components/ui/ImageViewer";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/adapters";
import { clearanceLabel, decideClearance, getPendingClearances, type AdminClearanceApiRow } from "@/lib/services";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * NBI and police clearances waiting for review (migration 0082). The admin
 * opens the photo in the viewer, then approves or rejects with a reason. A
 * clearance counts toward Verified only while the requirement is turned on.
 */
export function ClearanceQueue() {
  const [rows, setRows] = useState<AdminClearanceApiRow[] | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<AdminClearanceApiRow | null>(null);
  const [deciding, setDeciding] = useState<{ row: AdminClearanceApiRow; approve: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setRows(await getPendingClearances());
    } catch (err) {
      setError(errorText(err, "Could not load clearances. Please try again."));
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function confirm() {
    if (!deciding) return;
    setBusy(true);
    try {
      await decideClearance(deciding.row.id, deciding.approve, reason);
      setNotice(`${clearanceLabel(deciding.row.clearance_type)} for ${deciding.row.profiles?.full_name ?? "the provider"} ${deciding.approve ? "approved" : "rejected"}.`);
      setDeciding(null);
      setReason("");
      await load();
    } catch (err) {
      setError(errorText(err, "Could not save the decision. Please try again."));
      setDeciding(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted-foreground">
          NBI and police clearances waiting for review. Open the photo and check the name, number and expiry before deciding.
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw /> Refresh
        </Button>
      </div>
      {notice && <p role="status" className="mb-3 text-[12.5px] text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="mb-3 text-[12.5px] text-danger">{error}</p>}
      {rows === null ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">Loading clearances…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-muted-foreground">No clearances waiting for review.</p>
      ) : (
        <ul className="space-y-2" aria-label="Clearances to review">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-4 py-3 text-[12.5px]">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-foreground">{row.profiles?.full_name ?? "Unknown provider"}</div>
                <div className="text-muted-foreground">
                  {clearanceLabel(row.clearance_type)} · No. {row.clearance_number}
                  {row.issued_on ? ` · Issued ${formatDate(row.issued_on)}` : ""} · Expires {formatDate(row.expires_on)}
                </div>
                <div className="text-subtle">Submitted {formatDate(row.created_at)}</div>
              </div>
              {row.document_url ? (
                <Button size="sm" variant="outline" onClick={() => setViewing(row)}>View clearance</Button>
              ) : (
                <span className="text-subtle">No file</span>
              )}
              <Button size="sm" onClick={() => { setReason(""); setDeciding({ row, approve: true }); }}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => { setReason(""); setDeciding({ row, approve: false }); }}>Reject</Button>
            </li>
          ))}
        </ul>
      )}

      {viewing?.document_url && (
        <ImageViewer
          images={[{ label: `${clearanceLabel(viewing.clearance_type)} · ${viewing.profiles?.full_name ?? ""}`, url: viewing.document_url }]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => setViewing(null)}
        />
      )}

      <ConfirmDialog
        open={!!deciding}
        danger={!deciding?.approve}
        title={deciding?.approve ? "Approve this clearance?" : "Reject this clearance?"}
        message={
          deciding
            ? deciding.approve
              ? `${clearanceLabel(deciding.row.clearance_type)} No. ${deciding.row.clearance_number} for ${deciding.row.profiles?.full_name ?? "the provider"}, valid until ${formatDate(deciding.row.expires_on)}. The provider is notified.`
              : "The provider is told the reason and can upload a new clearance."
            : ""
        }
        confirmLabel={deciding?.approve ? "Approve" : "Reject"}
        busy={busy}
        confirmDisabled={!deciding?.approve && reason.trim().length === 0}
        onConfirm={() => void confirm()}
        onCancel={() => setDeciding(null)}
      >
        {deciding && !deciding.approve && (
          <Input
            autoFocus
            placeholder="Reason, shown to the provider (required)"
            aria-label="Rejection reason (required)"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
