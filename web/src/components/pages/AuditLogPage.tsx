"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, Gavel, RefreshCw, RotateCcw, ScrollText, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import * as services from "@/lib/services";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/Panel";
import { SearchField } from "@/components/admin/queue";
import { SelectFilter, TableCard, TableEmpty } from "@/components/admin/table";
import type { AuditAction } from "@/lib/domain";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

/** Human-readable label for the moderation action codes AdminActionsService
 *  writes (e.g. "user.suspend" — see backend/src/admin/admin-actions.service.ts). */
export function actionLabel(action: string): string {
  return action.replace(".", " → ").replace(/_/g, " ");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** Icon + colour by what kind of decision it was. */
function actionStyle(action: string): { icon: React.ComponentType<{ className?: string }>; className: string } {
  const a = action.toLowerCase();
  if (/suspend|ban/.test(a)) return { icon: Ban, className: "bg-danger-soft text-danger" };
  if (/reject|cancel/.test(a)) return { icon: XCircle, className: "bg-danger-soft text-danger" };
  if (/maintenance/.test(a)) return { icon: ScrollText, className: "bg-warn-soft text-warn" };
  if (/reinstate|activate|approve|settle|credit/.test(a)) return { icon: CheckCircle2, className: "bg-ok-soft text-ok" };
  if (/refund/.test(a)) return { icon: RotateCcw, className: "bg-warn-soft text-warn" };
  if (/resolve|release|dispute/.test(a)) return { icon: Gavel, className: "bg-info-soft text-info" };
  if (/verif/.test(a)) return { icon: ShieldCheck, className: "bg-primary-soft text-primary" };
  return { icon: ScrollText, className: "bg-surface-2 text-muted-foreground" };
}

export function AuditLogPage() {
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  /** The Refresh button's handler — runs from an event, not an effect. */
  async function load() {
    setLoading(true);
    setError(false);
    try {
      setActions(await services.getAuditLog());
      setPage(1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // The mount fetch is written out rather than calling load(), so no state is
  // set synchronously in the effect body.
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

  const actionTypes = useMemo(() => [...new Set(actions.map((a) => a.action))].sort(), [actions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return actions.filter((a) => {
      if (actionFilter !== "all" && a.action !== actionFilter) return false;
      if (!q) return true;
      const reason = typeof a.metadata.reason === "string" ? a.metadata.reason : "";
      return [a.actorName, a.action, a.targetType, a.targetId, reason].some((v) => v.toLowerCase().includes(q));
    });
  }, [actions, search, actionFilter]);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const groups = useMemo(() => {
    const out: { day: string; items: AuditAction[] }[] = [];
    for (const a of visible) {
      const day = dayLabel(a.createdAt);
      if (out[out.length - 1]?.day === day) out[out.length - 1].items.push(a);
      else out.push({ day, items: [a] });
    }
    return out;
  }, [visible]);

  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Audit Log"
        description="Every suspend, reinstate, cancel, and dispute resolution — with the admin behind it."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <TableCard
        toolbar={
          <>
            <SearchField
              className="w-full sm:w-72"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by admin, target, or reason…"
              label="Search the audit log"
            />
            <SelectFilter
              label="Filter by action"
              value={actionFilter}
              onChange={(v) => {
                setActionFilter(v);
                setPage(1);
              }}
            >
              <option value="all">Action: any</option>
              {actionTypes.map((t) => (
                <option key={t} value={t}>
                  {actionLabel(t)}
                </option>
              ))}
            </SelectFilter>
            {!loading && !error && (
              <span className="ml-auto tabular text-[12px] text-muted-foreground">
                {filtered.length.toLocaleString()} {filtered.length === 1 ? "action" : "actions"}
              </span>
            )}
          </>
        }
      >
        {loading ? (
          <div role="status" aria-live="polite">
            <TableEmpty>Loading audit log…</TableEmpty>
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-[13px] text-danger">
            <span className="flex items-center gap-2">
              <ShieldAlert className="size-4" /> Could not load the audit log.
            </span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : actions.length === 0 ? (
          <TableEmpty>No admin actions recorded yet.</TableEmpty>
        ) : filtered.length === 0 ? (
          <TableEmpty>No actions match this search or filter.</TableEmpty>
        ) : (
          <div className="px-5 py-3">
            {groups.map((g) => (
              <section key={g.day} className="py-2">
                <h3 className="sticky top-0 z-[1] -mx-5 mb-1 bg-surface/90 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-subtle backdrop-blur">
                  {g.day}
                </h3>
                <ol>
                  {g.items.map((a) => {
                    const { icon: Icon, className } = actionStyle(a.action);
                    const reason = typeof a.metadata.reason === "string" && a.metadata.reason ? a.metadata.reason : null;
                    return (
                      <li key={a.id} className="flex items-start gap-3.5 rounded-[8px] py-2.5">
                        <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", className)}>
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium capitalize">{actionLabel(a.action)}</div>
                          <div className="mt-0.5 text-[12px] text-muted-foreground">
                            by <span className="font-medium text-foreground">{a.actorName}</span> · {a.targetType}{" "}
                            <span className="rounded bg-surface-2 px-1 font-mono text-[11px]" title={a.targetId}>
                              {a.targetId.slice(0, 8)}
                            </span>
                          </div>
                          {reason && (
                            <blockquote className="mt-1.5 border-l-2 border-border-strong pl-2.5 text-[12.5px] italic text-muted-foreground">
                              “{reason}”
                            </blockquote>
                          )}
                        </div>
                        <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()} className="shrink-0 tabular text-[12px] text-subtle">
                          {formatTime(a.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
        {!loading && !error && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} itemLabel="actions" />}
      </TableCard>
    </div>
  );
}
