"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Download, ImageIcon, Lock, MapPin, XCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import * as services from "@/lib/services";
import type { AdminBookingDetail } from "@/lib/domain";
import { formatCurrency, toBookingRow, type BookingRow } from "@/lib/adapters";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReviewDrawer, DrawerField, DrawerSection } from "@/components/ui/ReviewDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/Panel";
import { SearchField } from "@/components/admin/queue";
import { BulkBar, DataTable, SelectFilter, TableCard, TableEmpty, type Column } from "@/components/admin/table";
import { useLiveTick } from "@/hooks/useLiveTick";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const PAGE_SIZE = 12;

type StatusFilter =
  | "all"
  | "Open"
  | "Matching"
  | "Awaiting Provider"
  | "Confirmed"
  | "In Progress"
  | "Completed"
  | "Cancelled"
  | "Expired";

const STATUS_API: Record<Exclude<StatusFilter, "all">, string> = {
  Open: "open",
  Matching: "recommending",
  "Awaiting Provider": "assigned",
  Confirmed: "confirmed",
  "In Progress": "in_progress",
  Completed: "completed",
  Cancelled: "cancelled",
  Expired: "expired",
};

export const BOOKING_TONE: Record<string, "info" | "accent" | "ok" | "danger" | "neutral" | "warn"> = {
  Open: "info",
  Matching: "warn",
  "Awaiting Provider": "accent",
  Confirmed: "accent",
  "In Progress": "info",
  Completed: "ok",
  Cancelled: "danger",
  Expired: "neutral",
};

function escrowLabel(status: string) {
  const text = status.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The dropdown's option groups, in lifecycle order. */
const STATUS_GROUPS: { label: string; statuses: Exclude<StatusFilter, "all">[] }[] = [
  { label: "In progress", statuses: ["Open", "Matching", "Awaiting Provider", "Confirmed", "In Progress"] },
  { label: "Finished", statuses: ["Completed", "Cancelled", "Expired"] },
];

const withCount = (label: string, count: number | undefined) => (count === undefined ? label : `${label} (${count})`);

type DetailState = AdminBookingDetail | "loading" | "error";

export function BookingsPage() {
  const { cancelBooking } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  // GET /admin/bookings/:id (migration 0014) — fetched on demand and cached by id.
  const [details, setDetails] = useState<Record<string, DetailState>>({});
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
    void services
      .searchBookings({
        search: debouncedSearch,
        status: statusFilter === "all" ? undefined : STATUS_API[statusFilter],
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        if (!cancelled) {
          setBookings(result.items.map(toBookingRow));
          setTotal(result.total);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBookings([]);
          setTotal(0);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [debouncedSearch, statusFilter, page, reloadNonce]);

  useLiveTick(() => setReloadNonce((n) => n + 1));

  // Exact count for every status tab: the list endpoint only totals the
  // filter it was asked about, so this asks once per status (limit=1).
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    services
      .getBookingStatusCounts()
      .then((counts) => !cancelled && setStatusCounts(counts))
      .catch(() => !cancelled && setStatusCounts(null));
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  function countFor(s: StatusFilter): number | undefined {
    // A search narrows the list, and these counts ignore it — so only the
    // active tab's own total is shown while searching.
    if (debouncedSearch.trim() || !statusCounts) return s === statusFilter && !loading ? total : undefined;
    if (s === "all") return Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
    return statusCounts[STATUS_API[s]];
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelingId(cancelTarget.id);
    try {
      await cancelBooking(cancelTarget.id);
      setReloadNonce((value) => value + 1);
      setDetails((prev) => {
        const next = { ...prev };
        delete next[cancelTarget.id];
        return next;
      });
      setCancelTarget(null);
      showToast("Booking cancelled.");
    } catch {
      showToast("Could not cancel that booking. It may already be completed.", "error");
    } finally {
      setCancelingId(null);
    }
  }

  function openDetail(id: string) {
    setOpenId(id);
    if (!(id in details)) {
      setDetails((prev) => ({ ...prev, [id]: "loading" }));
      services
        .getBookingDetail(id)
        .then((detail) => setDetails((prev) => ({ ...prev, [id]: detail })))
        .catch(() => setDetails((prev) => ({ ...prev, [id]: "error" })));
    }
  }

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
      ["Booking ID", "Client", "Provider", "Service", "Status", "Posted", "Budget"],
      exportScope.map((b) => [b.id, b.customer, b.provider, b.service, b.status, b.date, b.amount]),
    );
    downloadCsv(datedFilename("taskbuddy-bookings"), csv);
  }

  const columns: Column<BookingRow>[] = [
    {
      id: "id",
      header: "Booking",
      cell: (b) => (
        <span className="font-mono text-[12px] text-primary" title={b.id}>
          {b.id.slice(0, 8)}
        </span>
      ),
    },
    { id: "customer", header: "Client", cell: (b) => <span className="font-medium">{b.customer}</span> },
    { id: "provider", header: "Provider", hideBelow: "md", cell: (b) => <span className="text-muted-foreground">{b.provider}</span> },
    { id: "service", header: "Service", hideBelow: "lg", cell: (b) => <span className="text-muted-foreground">{b.service}</span> },
    {
      id: "status",
      header: "Status",
      cell: (b) => (
        <Badge tone={BOOKING_TONE[b.status] ?? "neutral"} dot>
          {b.status}
        </Badge>
      ),
    },
    { id: "date", header: "Posted", hideBelow: "md", cell: (b) => <span className="tabular text-muted-foreground">{b.date}</span> },
    { id: "amount", header: "Budget", align: "right", cell: (b) => <span className="tabular font-semibold">{b.amount}</span> },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: 96,
      cell: (b) =>
        b.cancellable ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-danger opacity-70 hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setCancelTarget({ id: b.id });
            }}
            disabled={cancelingId === b.id}
            title="Cancel booking"
          >
            <XCircle className="size-3.5" /> {cancelingId === b.id ? "Cancelling…" : "Cancel"}
          </Button>
        ) : null,
    },
  ];

  const open = bookings.find((b) => b.id === openId) ?? null;
  const detail = openId ? details[openId] : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Bookings"
        description="Every job posted on the platform, from open request to completed work."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmingExport(true)}
            disabled={exportScope.length === 0}
            title={selected.size > 0 ? "Download only the checked rows" : "Download the current page"}
          >
            <Download /> {selected.size > 0 ? `Export ${selected.size} selected` : "Export current page"}
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
                clearSelectionOnScopeChange();
              }}
              placeholder="Search by booking ID, client, or service…"
              label="Search bookings"
            />
            {/* One status at a time, grouped by lifecycle, each with its count.
                A single-status query keeps paging on the server, so this stays
                fast however many bookings pile up. */}
            <SelectFilter
              label="Filter bookings by status"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as StatusFilter);
                clearSelectionOnScopeChange();
              }}
            >
              <option value="all">{withCount("All statuses", countFor("all"))}</option>
              {STATUS_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.statuses.map((st) => (
                    <option key={st} value={st}>
                      {withCount(st, countFor(st))}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectFilter>
            {statusFilter !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  clearSelectionOnScopeChange();
                }}
              >
                Clear filter
              </Button>
            )}
            <span className="ml-auto tabular text-[12px] text-muted-foreground">
              {loading ? "Loading…" : `${total.toLocaleString()} ${total === 1 ? "booking" : "bookings"}`}
            </span>
          </>
        }
      >
        <DataTable
          label="Bookings table"
          columns={columns}
          rows={bookings}
          getRowId={(b) => b.id}
          onRowClick={(b) => openDetail(b.id)}
          activeRowId={openId}
          minWidth={760}
          rowClassName={() => (loading ? "opacity-60" : undefined)}
          selection={{
            selected,
            onToggle: toggleOne,
            onToggleAll: toggleAll,
            allSelected,
            rowLabel: (id) => `Select booking ${id}`,
            allLabel: "Select all bookings on this page",
            disabledAll: bookings.length === 0,
          }}
          empty={
            <TableEmpty>
              {/* `total` is the count for the *current* query, so narrowing the
                  scope is the real signal for which message is true. */}
              {loading
                ? "Loading bookings…"
                : statusFilter !== "all" || search.trim()
                  ? "No bookings match this search or filter."
                  : "No bookings yet."}
            </TableEmpty>
          }
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={(nextPage) => {
            setSelected(new Set());
            setPage(nextPage);
          }}
          itemLabel="bookings"
        />
      </TableCard>

      <BulkBar count={selected.size} noun="booking" onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="outline" onClick={() => setConfirmingExport(true)}>
          <Download /> Export
        </Button>
      </BulkBar>

      <ReviewDrawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? open.service : ""}
        subtitle={open ? `Booking ${open.id.slice(0, 8)} · Posted ${open.date}` : undefined}
        footer={
          open ? (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setOpenId(null)}>
                Close
              </Button>
              {open.cancellable && (
                <Button variant="destructive" className="flex-1" onClick={() => setCancelTarget({ id: open.id })} disabled={cancelingId === open.id}>
                  <XCircle /> Cancel booking
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {open && (
          <>
            <div className="mb-5 flex items-center justify-between gap-3">
              <Badge tone={BOOKING_TONE[open.status] ?? "neutral"} dot>
                {open.status}
              </Badge>
              <span className="tabular text-[20px] font-semibold tracking-tight">{open.amount}</span>
            </div>
            <DrawerSection title="People">
              <div className="grid grid-cols-2 gap-4">
                <DrawerField label="Client" value={open.customer} />
                <DrawerField label="Provider" value={open.provider} />
                <DrawerField label="Service" value={open.service} />
                <DrawerField label="Booking ID" value={<span className="break-all font-mono text-[12px]">{open.id}</span>} />
              </div>
            </DrawerSection>
            <DrawerSection title="Job detail">
              {detail === "loading" || detail === undefined ? (
                <div className="space-y-2">
                  <div className="h-3 w-3/4 rounded bg-surface-2 motion-safe:animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-surface-2 motion-safe:animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-surface-2 motion-safe:animate-pulse" />
                </div>
              ) : detail === "error" ? (
                <p className="text-[12.5px] text-danger">Could not load job detail.</p>
              ) : (
                <div className="space-y-4">
                  <p className="text-[13px] leading-relaxed">{detail.description ?? "No description."}</p>
                  <ul className="space-y-2.5 text-[12.5px]">
                    <li className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /> {detail.address ?? "—"}
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      {detail.scheduledAt ? new Date(detail.scheduledAt).toLocaleString() : "Not scheduled"}
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      {detail.escrowStatus ? `Escrow: ${escrowLabel(detail.escrowStatus)} · ${formatCurrency(detail.escrowAmount ?? 0)}` : "No escrow hold"}
                    </li>
                  </ul>
                  {detail.photoUrls.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                        <ImageIcon className="size-3.5" /> Photos
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {detail.photoUrls.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[8px] border border-border">
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
                            <img src={url} alt="Job photo" className="aspect-square w-full object-cover transition-transform hover:scale-105" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DrawerSection>
          </>
        )}
      </ReviewDrawer>

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
