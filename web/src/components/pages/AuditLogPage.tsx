"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import * as services from "@/lib/services";
import type { AuditAction } from "@/lib/domain";

/** Human-readable label for the moderation action codes AdminActionsService
 *  writes (e.g. "user.suspend" — see backend/src/admin/admin-actions.service.ts). */
function actionLabel(action: string): string {
  return action.replace(".", " → ").replace(/_/g, " ");
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function AuditLogPage() {
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  /** The Refresh button's handler. Safe to set state synchronously here —
   *  it runs from an event, not from an effect. */
  async function load() {
    setLoading(true);
    setError(false);
    try {
      setActions(await services.getAuditLog());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // The mount fetch is written out rather than calling load(), so no state is
  // set synchronously in the effect body, and so an unmount mid-request can't
  // set state on a gone component.
  useEffect(() => {
    let cancelled = false;
    services
      .getAuditLog()
      .then((rows) => {
        if (!cancelled) setActions(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Audit Log</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            Every suspend, reinstate, cancel, and dispute resolution — with the admin behind it
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="rounded-xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        {loading && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        )}
        {!loading && error && (
          <div className="flex items-center justify-center gap-2 py-12" style={{ color: "var(--danger-text)", fontSize: 13 }}>
            <ShieldAlert size={14} /> Could not load the audit log.
          </div>
        )}
        {!loading && !error && actions.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>No admin actions recorded yet.</div>
        )}
        {!loading && !error && actions.length > 0 && (
          <div className="flex flex-col gap-3">
            {actions.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3" style={{ fontSize: 11.4 }}>
                <div>
                  <div className="text-white font-medium capitalize">{actionLabel(a.action)}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    by {a.actorName} · {a.targetType} <span style={{ fontFamily: "monospace" }}>{a.targetId.slice(0, 8)}</span>
                    {typeof a.metadata.reason === "string" && a.metadata.reason && ` — "${a.metadata.reason}"`}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>{formatWhen(a.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
