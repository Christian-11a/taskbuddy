"use client";

import { useEffect, useState } from "react";
import { Search, Clock, CreditCard, AlertTriangle, UserPlus, CheckCircle, Download } from "lucide-react";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import type { ActivityType } from "@/lib/domain";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import * as services from "@/lib/services";
import type { ActivityEvent } from "@/lib/domain";

const PAGE_SIZE = 7;

function activityIcon(type: ActivityType) {
  switch (type) {
    case "tx": return <CreditCard size={12} style={{ color: "var(--success-text)" }} />;
    case "user": return <UserPlus size={12} style={{ color: "#60a5fa" }} />;
    case "alert": return <AlertTriangle size={12} style={{ color: "var(--warning-text)" }} />;
    default: return <CheckCircle size={12} style={{ color: "var(--success-text)" }} />;
  }
}

export function ActivityLogPage() {
  const [search, setSearch] = useState("");
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [page, setPage] = useState(1);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetching page-local data */
    let cancelled = false;
    setLoading(true);
    void services.searchActivity({ search, page, pageSize: PAGE_SIZE }).then((result) => {
      if (!cancelled) {
        setRecentActivity(result.items);
        setTotal(result.total);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setRecentActivity([]);
        setTotal(0);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [search, page]);

  function exportCsv() {
    const csv = toCsv(["Event", "When"], recentActivity.map((a) => [a.text, a.time]));
    downloadCsv(datedFilename("taskbuddy-activity"), csv);
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-white font-bold" style={{ fontSize: "var(--fs-2xl)", letterSpacing: "-0.025em" }}>Activity Log</h1>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>
            Recent booking status transitions across the platform — {total} events
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmingExport(true)}
            disabled={recentActivity.length === 0}
            className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "7px 13px", fontSize: "var(--fs-xs)", color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <div className="relative" style={{ flex: "1 1 200px", maxWidth: 360 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" style={{ color: "var(--text-white)" }} />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by job title…"
            aria-label="Search activity by job title"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: "var(--r-md)", padding: "0 13px 0 36px", fontSize: "var(--fs-sm)", fontFamily: "inherit", color: "var(--text-white)" }}
          />
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div style={{ padding: "var(--sp-5)" }}>
        {recentActivity.length === 0 && (
          <div role="status" aria-live="polite" className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: "var(--fs-md)" }}>
            {loading
              ? "Loading activity…"
                : total === 0
                ? "No platform activity yet."
                : "No events match this search."}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {recentActivity.map((a, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0 rounded-lg"
                style={{ width: 26, height: 26, background: "var(--chip-bg)" }}
              >
                {activityIcon(a.type)}
              </div>
              <div className="flex-1 text-white" style={{ fontSize: "var(--fs-xs)" }}>{a.text}</div>
              <div className="flex items-center gap-1 flex-shrink-0" style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
                <Clock size={9} /> {a.time}
              </div>
            </div>
          ))}
        </div>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} itemLabel="events" />
      </div>

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
