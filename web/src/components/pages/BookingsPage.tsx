"use client";

import { Fragment, useEffect, useState } from "react";
import { Search, XCircle, ChevronDown, Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import * as services from "@/lib/services";
import type { AdminBookingDetail } from "@/lib/domain";
import { toBookingRow, type BookingRow } from "@/lib/adapters";
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
  | "Confirmed"
  | "In Progress"
  | "Completed"
  | "Cancelled"
  | "Expired";

const STATUS_ACCENTS: Record<StatusFilter, string> = {
  all: "#6366f1",
  Open: "#f59e0b",
  Matching: "#60a5fa",
  Assigned: "#8b5cf6",
  Confirmed: "#06b6d4",
  "In Progress": "#a855f7",
  Completed: "#22c55e",
  Cancelled: "#ef4444",
  Expired: "var(--danger-text)",
};

export function BookingsPage() {
  const { cancelBooking } = useApp();
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
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetching page-local data */
    let cancelled = false;
    setLoading(true);
    void services.searchBookings({
      search,
      status: statusFilter === "all" ? undefined : {
        Open: "open", Matching: "recommending", Assigned: "assigned", Confirmed: "confirmed", "In Progress": "in_progress",
        Completed: "completed", Cancelled: "cancelled", Expired: "expired",
      }[statusFilter],
      page,
      pageSize: PAGE_SIZE,
    }).then((result) => {
      if (!cancelled) {
        setBookings(result.items.map(toBookingRow));
        setTotal(result.total);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setBookings([]);
        setTotal(0);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [search, statusFilter, page, reloadNonce]);

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelingId(cancelTarget.id);
    try {
      await cancelBooking(cancelTarget.id);
      setReloadNonce((value) => value + 1);
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

  const counts: Record<StatusFilter, number> = {
    all: statusFilter === "all" ? total : 0,
    Open: statusFilter === "Open" ? total : 0,
    Matching: statusFilter === "Matching" ? total : 0,
    Assigned: statusFilter === "Assigned" ? total : 0,
    Confirmed: statusFilter === "Confirmed" ? total : 0,
    "In Progress": statusFilter === "In Progress" ? total : 0,
    Completed: statusFilter === "Completed" ? total : 0,
    Cancelled: statusFilter === "Cancelled" ? total : 0,
    Expired: statusFilter === "Expired" ? total : 0,
  };

  // Only this server-loaded page is available for selection and export.
  const allSelected = bookings.length > 0 && bookings.every((b) => selected.has(b.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(bookings.map((b) => b.id)));
  }

  function clearSelectionOnScopeChange() {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    setPage(1);
  }

  /** Exports checked rows or every row on the current server-loaded page. */
  const exportScope = selected.size > 0 ? bookings.filter((b) => selected.has(b.id)) : bookings;

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
          <h1 className="text-white font-bold" style={{ fontSize: 22, letterSpacing: "-0.025em" }}>Bookings</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Track all service bookings across the platform</div>
        </div>
        <button
          onClick={() => setConfirmingExport(true)}
          disabled={exportScope.length === 0}
          title={selected.size > 0 ? "Download only the checked rows" : "Download the current page"}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> {selected.size > 0 ? `Export ${selected.size} selected` : "Export current page"}
        </button>
      </div>

      <div className="flex gap-2.5 flex-wrap mb-4">
        {(["all", "Open", "Matching", "Assigned", "Confirmed", "In Progress", "Completed", "Cancelled", "Expired"] as StatusFilter[]).map((s) => {
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
        <div
          className="overflow-x-auto pb-1"
          role="region"
          aria-label="Bookings table"
          tabIndex={0}
          style={{ scrollbarColor: "var(--border-md) transparent" }}
        >
          <table className="data-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    className={clsx("row-checkbox", selected.size > 0 && "always-visible")}
                    aria-label="Select all bookings on this page"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={bookings.length === 0}
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
              {bookings.map((b) => (
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
                    <td style={{ color: "var(--indigo-light)", fontFamily: "monospace", fontSize: 11 }} title={b.id}>{b.id.slice(0, 8)}…</td>
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
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {loading
                      ? "Loading bookings…"
                        : total === 0
                        ? "No bookings yet."
                        : "No bookings match this search or filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="md:hidden px-4 py-2" style={{ color: "var(--text-muted)", fontSize: 10 }}>
          Swipe horizontally to view provider, service, and date details.
        </div>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => { setSelected(new Set()); setPage(nextPage); }}
          itemLabel="bookings"
        />
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
        message={`This downloads ${exportScope.length} row${exportScope.length === 1 ? "" : "s"} from the current page as a .csv file to your device.`}
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
