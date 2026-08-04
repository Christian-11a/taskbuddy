"use client";

import { Fragment, useState } from "react";
import { Search, XCircle, ChevronDown, Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import clsx from "clsx";

type StatusFilter =
  | "all"
  | "Open"
  | "Matching"
  | "Assigned"
  | "In Progress"
  | "Completed"
  | "Cancelled"
  | "Expired";

const STATUS_ACCENTS: Record<StatusFilter, string> = {
  all: "#6366f1",
  Open: "#f59e0b",
  Matching: "#60a5fa",
  Assigned: "#8b5cf6",
  "In Progress": "#a855f7",
  Completed: "#22c55e",
  Cancelled: "#ef4444",
  Expired: "var(--danger-text)",
};

export function BookingsPage() {
  const { bookings, cancelBooking } = useApp();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = bookings.filter((b) => {
    const matchSearch =
      b.id.toLowerCase().includes(search.toLowerCase()) ||
      b.customer.toLowerCase().includes(search.toLowerCase()) ||
      b.service.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts: Record<StatusFilter, number> = {
    all: bookings.length,
    Open: bookings.filter((b) => b.status === "Open").length,
    Matching: bookings.filter((b) => b.status === "Matching").length,
    Assigned: bookings.filter((b) => b.status === "Assigned").length,
    "In Progress": bookings.filter((b) => b.status === "In Progress").length,
    Completed: bookings.filter((b) => b.status === "Completed").length,
    Cancelled: bookings.filter((b) => b.status === "Cancelled").length,
    Expired: bookings.filter((b) => b.status === "Expired").length,
  };

  /** Exports what's on screen (current search + status filter). */
  function exportCsv() {
    const csv = toCsv(
      ["Booking ID", "Customer", "Provider", "Service", "Status", "Posted", "Budget"],
      filtered.map((b) => [b.id, b.customer, b.provider, b.service, b.status, b.date, b.amount]),
    );
    downloadCsv(datedFilename("taskbuddy-bookings"), csv);
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Bookings</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Track all service bookings across the platform</div>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title="Download the rows currently shown"
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="flex gap-2.5 flex-wrap mb-4">
        {(["all", "Open", "Matching", "Assigned", "In Progress", "Completed", "Cancelled", "Expired"] as StatusFilter[]).map((s) => {
          const accent = STATUS_ACCENTS[s];
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="flex items-center gap-2 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
              style={{ padding: "9px 14px", border: `1px solid ${accent}33`, background: statusFilter === s ? `${accent}28` : `${accent}18`, fontSize: 11.4, fontFamily: "inherit", outline: statusFilter === s ? `1px solid ${accent}44` : "none" }}
            >
              <span className="font-semibold text-white">{counts[s]}</span>
              <span style={{ color: "var(--text-muted)" }}>{s === "all" ? "Total" : s}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by booking ID, customer, or service…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "8px 13px 8px 32px", fontSize: 11.4, fontFamily: "inherit" }}
          />
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Customer</th>
                <th className="hidden md:table-cell">Provider</th>
                <th className="hidden lg:table-cell">Service</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Date</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <Fragment key={b.id}>
                  <tr>
                    <td style={{ color: "var(--indigo-light)", fontFamily: "monospace", fontSize: 11 }}>{b.id}</td>
                    <td className="text-white">{b.customer}</td>
                    <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{b.provider}</td>
                    <td className="hidden lg:table-cell" style={{ color: "var(--text-light)" }}>{b.service}</td>
                    <td><span className={clsx("badge", b.statusClass)}>{b.status}</span></td>
                    <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{b.date}</td>
                    <td className="text-white font-semibold">{b.amount}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        {b.cancellable && (
                          <button
                            onClick={() => cancelBooking(b.id)}
                            title="Cancel booking"
                            className="flex items-center gap-1 font-medium transition-colors hover:opacity-80"
                            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 10px", fontSize: 10, color: "var(--danger-text)", cursor: "pointer", fontFamily: "inherit" }}
                          >
                            <XCircle size={10} /> Cancel
                          </button>
                        )}
                        <button
                          title="View details"
                          onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                          className="flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
                          style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", transform: expandedId === b.id ? "rotate(180deg)" : "none" }}
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === b.id && (
                    <tr>
                      <td colSpan={8} style={{ background: "var(--chip-bg)", padding: "12px 16px" }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: 11.4 }}>
                          {[
                            ["BOOKING ID", b.id],
                            ["CUSTOMER", b.customer],
                            ["PROVIDER", b.provider],
                            ["SERVICE", b.service],
                            ["STATUS", b.status],
                            ["POSTED", b.date],
                            ["BUDGET", b.amount],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                              <div className="text-white" style={{ wordBreak: "break-all" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginTop: 10 }}>
                          Job description, address and scheduled time need a backend endpoint — see web/README.md.
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
