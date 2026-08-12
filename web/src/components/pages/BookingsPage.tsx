"use client";

import { Fragment, useState } from "react";
import { Search, XCircle, ChevronDown, Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import * as services from "@/lib/services";
import type { AdminBookingDetail } from "@/lib/domain";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import clsx from "clsx";

const PAGE_SIZE = 7;

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
  const { bookings, cancelBooking, loading } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // GET /admin/bookings/:id (migration 0014) — fetched on demand per row and
  // cached by id so re-expanding a row doesn't refetch.
  const [details, setDetails] = useState<Record<string, AdminBookingDetail | "loading" | "error">>({});
  const [cancelTarget, setCancelTarget] = useState<{ id: string } | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelingId(cancelTarget.id);
    try {
      await cancelBooking(cancelTarget.id);
      setCancelTarget(null);
      showToast("Booking cancelled.");
    } catch {
      showToast("Could not cancel that booking. It may already be completed.", "error");
    } finally {
      setCancelingId(null);
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!(id in details)) {
      setDetails((prev) => ({ ...prev, [id]: "loading" }));
      services
        .getBookingDetail(id)
        .then((detail) => setDetails((prev) => ({ ...prev, [id]: detail })))
        .catch(() => setDetails((prev) => ({ ...prev, [id]: "error" })));
    }
  }

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

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // "Select all" covers every row matching the current search + filter, not
  // just the visible page — matches Users, and lets an admin export a whole
  // filtered set without paging through it first.
  const allSelected = filtered.length > 0 && filtered.every((b) => selected.has(b.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(filtered.map((b) => b.id)));
  }

  function clearSelectionOnScopeChange() {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    setPage(1);
  }

  /** Exports the checked rows when any are checked; otherwise everything matching the current search + status filter. */
  const exportScope = selected.size > 0 ? filtered.filter((b) => selected.has(b.id)) : filtered;

  function exportCsv() {
    const csv = toCsv(
      ["Booking ID", "Homeowner", "Provider", "Service", "Status", "Posted", "Budget"],
      exportScope.map((b) => [b.id, b.customer, b.provider, b.service, b.status, b.date, b.amount]),
    );
    downloadCsv(datedFilename("taskbuddy-bookings"), csv);
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: 22, letterSpacing: "-0.025em" }}>Bookings</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Track all service bookings across the platform</div>
        </div>
        <button
          onClick={() => setConfirmingExport(true)}
          disabled={exportScope.length === 0}
          title={selected.size > 0 ? "Download only the checked rows" : "Download the rows currently shown"}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> {selected.size > 0 ? `Export ${selected.size} selected` : "Export CSV"}
        </button>
      </div>

      <div className="flex gap-2.5 flex-wrap mb-4">
        {(["all", "Open", "Matching", "Assigned", "In Progress", "Completed", "Cancelled", "Expired"] as StatusFilter[]).map((s) => {
          const accent = STATUS_ACCENTS[s];
          return (
            <button key={s} onClick={() => { setStatusFilter(s); clearSelectionOnScopeChange(); }}
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
            placeholder="Search by booking ID, homeowner, or service…"
            aria-label="Search bookings"
            value={search}
            onChange={(e) => { setSearch(e.target.value); clearSelectionOnScopeChange(); }}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: 9, padding: "0 13px 0 36px", fontSize: 12, fontFamily: "inherit" }}
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 flex-wrap" style={{ fontSize: 11.4, color: "var(--text-muted)" }}>
          <span>{selected.size} selected</span>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    className={clsx("row-checkbox", selected.size > 0 && "always-visible")}
                    aria-label="Select all bookings"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={filtered.length === 0}
                  />
                </th>
                <th>Booking ID</th>
                <th>Homeowner</th>
                <th className="hidden md:table-cell">Provider</th>
                <th className="hidden lg:table-cell">Service</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Date</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((b) => (
                <Fragment key={b.id}>
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        className={clsx("row-checkbox", selected.size > 0 && "always-visible")}
                        aria-label={`Select booking ${b.id}`}
                        checked={selected.has(b.id)}
                        onChange={() => toggleOne(b.id)}
                      />
                    </td>
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
                            onClick={() => setCancelTarget({ id: b.id })}
                            disabled={cancelingId === b.id}
                            title="Cancel booking"
                            className="flex items-center gap-1 font-medium transition-colors hover:opacity-80 disabled:opacity-40"
                            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "4px 10px", fontSize: 10, color: "var(--danger-text)", cursor: cancelingId === b.id ? "default" : "pointer", fontFamily: "inherit" }}
                          >
                            <XCircle size={10} /> {cancelingId === b.id ? "Cancelling…" : "Cancel"}
                          </button>
                        )}
                        <button
                          title="View details"
                          onClick={() => toggleExpand(b.id)}
                        aria-label={`${expandedId === b.id ? "Hide" : "Show"} details for ${b.id}`}
                        aria-expanded={expandedId === b.id}
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
                      <td colSpan={9} style={{ background: "var(--chip-bg)", padding: "12px 16px" }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: 11.4 }}>
                          {[
                            ["BOOKING ID", b.id],
                            ["HOMEOWNER", b.customer],
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
                        {details[b.id] === "loading" && (
                          <div style={{ fontSize: 10.8, color: "var(--text-muted)", marginTop: 10 }}>Loading job detail…</div>
                        )}
                        {details[b.id] === "error" && (
                          <div style={{ fontSize: 10.8, color: "var(--danger-text)", marginTop: 10 }}>Could not load job detail.</div>
                        )}
                        {details[b.id] && typeof details[b.id] === "object" && (() => {
                          const d = details[b.id] as AdminBookingDetail;
                          return (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: 11.4, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                              <div className="col-span-2">
                                <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>DESCRIPTION</div>
                                <div className="text-white">{d.description ?? "—"}</div>
                              </div>
                              <div className="col-span-2">
                                <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>ADDRESS</div>
                                <div className="text-white">{d.address ?? "—"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>SCHEDULED</div>
                                <div className="text-white">{d.scheduledAt ? new Date(d.scheduledAt).toLocaleString() : "—"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>ESCROW</div>
                                <div className="text-white">
                                  {d.escrowStatus ? `${d.escrowStatus.replace("_", " ")} (₱${d.escrowAmount})` : "No escrow hold"}
                                </div>
                              </div>
                              {d.photoUrls.length > 0 && (
                                <div className="col-span-2 md:col-span-4">
                                  <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>PHOTOS</div>
                                  <div className="flex gap-2 flex-wrap">
                                    {d.photoUrls.map((url) => (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img key={url} src={url} alt="Job photo" style={{ width: 60, height: 60, borderRadius: 8, objectFit: "cover" }} />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {loading
                      ? "Loading bookings…"
                      : bookings.length === 0
                        ? "No bookings yet."
                        : "No bookings match this search or filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} itemLabel="bookings" />
      </div>

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this booking?"
        message={cancelTarget ? `Booking ${cancelTarget.id} will be marked cancelled. This can't be undone from here.` : ""}
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        busy={cancelingId !== null}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message={`This downloads ${exportScope.length} row${exportScope.length === 1 ? "" : "s"} as a .csv file to your device.`}
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
