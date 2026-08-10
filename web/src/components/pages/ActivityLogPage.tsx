"use client";

import { useState } from "react";
import { Search, Clock, CreditCard, AlertTriangle, UserPlus, ShieldCheck, CheckCircle, Download, ArrowUpDown } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import type { ActivityType } from "@/lib/domain";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import clsx from "clsx";

type Filter = "all" | ActivityType;

const TYPE_LABEL: Record<ActivityType, string> = {
  tx: "Completed",
  alert: "Cancelled / Expired",
  user: "Other transitions",
  verif: "Verification",
};

function activityIcon(type: ActivityType) {
  switch (type) {
    case "verif": return <ShieldCheck size={12} style={{ color: "#a5b4fc" }} />;
    case "tx": return <CreditCard size={12} style={{ color: "var(--success-text)" }} />;
    case "user": return <UserPlus size={12} style={{ color: "#60a5fa" }} />;
    case "alert": return <AlertTriangle size={12} style={{ color: "var(--warning-text)" }} />;
    default: return <CheckCircle size={12} style={{ color: "var(--success-text)" }} />;
  }
}

export function ActivityLogPage() {
  const { recentActivity, loading } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [confirmingExport, setConfirmingExport] = useState(false);

  const matched = recentActivity.filter((a) => {
    const matchFilter = filter === "all" || a.type === filter;
    const matchSearch = a.text.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });
  // The endpoint already returns newest-first, so reversing is enough — there
  // are no timestamps on the mapped rows to sort by.
  const filtered = oldestFirst ? [...matched].reverse() : matched;

  const typesPresent = Array.from(new Set(recentActivity.map((a) => a.type)));

  function exportCsv() {
    const csv = toCsv(["Event", "When"], filtered.map((a) => [a.text, a.time]));
    downloadCsv(datedFilename("taskbuddy-activity"), csv);
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Activity Log</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            Recent booking status transitions across the platform — the latest {recentActivity.length} events
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOldestFirst((v) => !v)}
            title="Toggle sort order"
            className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80"
            style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
          >
            <ArrowUpDown size={12} /> {oldestFirst ? "Oldest first" : "Newest first"}
          </button>
          <button
            onClick={() => setConfirmingExport(true)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <div className="relative" style={{ flex: "1 1 200px", maxWidth: 313 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" style={{ color: "var(--text-white)" }} />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by job title…"
            aria-label="Search activity by job title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "8px 13px 8px 32px", fontSize: 11.4, fontFamily: "inherit", color: "var(--text-white)" }}
          />
        </div>
        <div className="inline-flex rounded-xl p-1 gap-1 flex-wrap" style={{ background: "var(--chip-bg)" }}>
          {(["all", ...typesPresent] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={clsx("rounded-lg font-medium cursor-pointer transition-all", filter === f ? "text-indigo-300" : "text-gray-500 hover:text-gray-300")}
              style={{ padding: "5px 12px", fontSize: 11.4, background: filter === f ? "rgba(99,102,241,0.25)" : "transparent", border: "none", fontFamily: "inherit" }}
            >
              {f === "all" ? "All" : TYPE_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        {filtered.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
            {loading
              ? "Loading activity…"
              : recentActivity.length === 0
                ? "No platform activity yet."
                : "No events match this search or filter."}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {filtered.map((a, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0 rounded-lg"
                style={{ width: 26, height: 26, background: "var(--chip-bg)" }}
              >
                {activityIcon(a.type)}
              </div>
              <div className="flex-1 text-white" style={{ fontSize: 11.4 }}>{a.text}</div>
              <div className="flex items-center gap-1 flex-shrink-0" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                <Clock size={9} /> {a.time}
              </div>
            </div>
          ))}
        </div>
      </div>

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
