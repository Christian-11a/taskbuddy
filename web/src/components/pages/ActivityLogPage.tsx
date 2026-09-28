"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, CreditCard, Download, History, UserPlus } from "lucide-react";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import type { ActivityEvent, ActivityType } from "@/lib/domain";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/Panel";
import { SearchField } from "@/components/admin/queue";
import { TableCard, TableEmpty } from "@/components/admin/table";
import { useLiveTick } from "@/hooks/useLiveTick";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import * as services from "@/lib/services";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

const TYPE_META: Record<ActivityType | "default", { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  tx: { icon: CreditCard, className: "bg-ok-soft text-ok" },
  user: { icon: UserPlus, className: "bg-info-soft text-info" },
  alert: { icon: AlertTriangle, className: "bg-warn-soft text-warn" },
  default: { icon: CheckCircle, className: "bg-primary-soft text-primary" },
};

export function ActivityLogPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [page, setPage] = useState(1);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // Events that arrived since the previous load get a brief highlight.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetching page-local data */
    let cancelled = false;
    setLoading(true);
    void services
      .searchActivity({ search: debouncedSearch, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        const keys = result.items.map((a) => a.text);
        setFresh(seen.current && page === 1 && !debouncedSearch ? new Set(keys.filter((k) => !seen.current!.has(k))) : new Set());
        seen.current = new Set(keys);
        setRecentActivity(result.items);
        setTotal(result.total);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setRecentActivity([]);
          setTotal(0);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [debouncedSearch, page, reloadKey]);

  useLiveTick(() => setReloadKey((k) => k + 1));

  function exportCsv() {
    const csv = toCsv(["Event", "When"], recentActivity.map((a) => [a.text, a.time]));
    downloadCsv(datedFilename("taskbuddy-activity"), csv);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Records"
        title="Activity"
        description={`Booking status changes across the platform, newest first — ${total.toLocaleString()} events.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => setConfirmingExport(true)} disabled={recentActivity.length === 0}>
            <Download /> Export CSV
          </Button>
        }
      />

      <TableCard
        toolbar={
          <SearchField
            className="w-full sm:w-72"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by job title…"
            label="Search activity by job title"
          />
        }
      >
        {recentActivity.length === 0 ? (
          <div role="status" aria-live="polite">
            <TableEmpty>
              {loading ? "Loading activity…" : total === 0 && !search.trim() ? "No platform activity yet." : "No events match this search."}
            </TableEmpty>
          </div>
        ) : (
          <ol className={cn("relative px-5 py-4 transition-opacity", loading && "opacity-60")}>
            <span aria-hidden className="absolute bottom-6 left-[34px] top-6 w-px bg-border" />
            {recentActivity.map((a, i) => {
              const meta = TYPE_META[a.type] ?? TYPE_META.default;
              const Icon = meta.icon;
              return (
                <li
                  key={`${a.text}-${i}`}
                  className={cn("relative -mx-2 flex items-center gap-3.5 rounded-[8px] px-2 py-2", fresh.has(a.text) && "ui-row-new")}
                >
                  <span className={cn("relative z-[1] grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-surface", meta.className)}>
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px]">{a.text}</span>
                  <span className="shrink-0 tabular text-[12px] text-subtle">{a.time}</span>
                </li>
              );
            })}
          </ol>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} itemLabel="events" />
      </TableCard>

      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-subtle">
        <History className="size-3.5" /> Refreshes on its own with the rest of the console.
      </p>

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message={`This downloads ${recentActivity.length} row${recentActivity.length === 1 ? "" : "s"} from the current page as a .csv file to your device.`}
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
