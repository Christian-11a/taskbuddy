"use client";

import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Download } from "lucide-react";
import * as services from "@/lib/services";
import { toTransactionRow, toWalletTxnRow, type TransactionRow, type WalletTxnRow } from "@/lib/adapters";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import clsx from "clsx";

const PAGE_SIZE = 7;

type StatusFilter = "all" | "Completed" | "In Escrow" | "Disputed" | "Refunded";
type Tab = "escrow" | "wallet";

/** What each tab exposes to the shared header Export CSV button (see TransactionsPage). */
interface ExportHandle {
  exportCsv: () => void;
}

/** Tells the parent how many rows the header's Export CSV button would
 *  download — drives both its disabled state and the confirm dialog's row
 *  count/label. `total` is the current page row count, `selected` is how many
 *  are checked (0 means "export this page"). Driven by primitives so
 *  this only fires when the counts actually change rather than on every
 *  render (the filtered array itself is a new reference every render and
 *  would otherwise re-trigger endlessly). */
interface TabProps {
  onExportCountChange: (info: { total: number; selected: number }) => void;
}

const EscrowTab = forwardRef<ExportHandle, TabProps>(function EscrowTab({ onExportCountChange }, ref) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetching page-local data */
    let cancelled = false;
    setLoading(true);
    void services.searchTransactions({
      search,
      status: statusFilter === "all" ? undefined : {
        Completed: "released", "In Escrow": "held", Disputed: "disputed", Refunded: "refunded",
      }[statusFilter] as "released" | "held" | "disputed" | "refunded" | undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then((result) => {
      if (!cancelled) {
        setTransactions(result.items.map(toTransactionRow));
        setTotalCount(result.total);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setTransactions([]);
        setTotalCount(0);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [search, statusFilter, page]);

  const total = transactions.reduce((s, t) => s + t.amountValue, 0);

  // Only this server-loaded page is available for selection and export.
  const allSelected = transactions.length > 0 && transactions.every((t) => selected.has(t.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(transactions.map((t) => t.id)));
  }

  function clearSelectionOnScopeChange() {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    setPage(1);
  }

  /** Exports checked rows or every row on the current server-loaded page. */
  const exportScope = selected.size > 0 ? transactions.filter((t) => selected.has(t.id)) : transactions;

  useImperativeHandle(
    ref,
    () => ({
      exportCsv: () => {
        const csv = toCsv(
          ["Escrow ID", "Job ID", "Homeowner", "Provider", "Service", "Amount", "Status", "Date"],
          exportScope.map((t) => [t.id, t.jobId, t.customer, t.provider, t.service, t.amountValue, t.status, t.date]),
        );
        downloadCsv(datedFilename("taskbuddy-transactions"), csv);
      },
    }),
    [exportScope],
  );
  useEffect(() => {
    onExportCountChange({ total: transactions.length, selected: selected.size });
  }, [transactions.length, selected.size, onExportCountChange]);

  return (
    <div>
      {/* Disputed transactions need attention when they exist and shouldn't
          compete with the neutral counters when they don't — a red pill
          reading "0 Disputed" looked like an alert for nothing. */}
      {(() => {
        const disputedCount = transactions.filter((t) => t.status === "Disputed").length;
        return (
          <div className="flex gap-2.5 flex-wrap mb-4 items-center">
            <div className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: 11.4 }}>
              <span className="font-semibold text-white">{totalCount}</span>
              <span style={{ color: "var(--text-muted)" }}>Total Transactions</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: 11.4 }}>
              <span className="font-semibold text-white">₱{total.toLocaleString()}</span>
              <span style={{ color: "var(--text-muted)" }}>Total Volume</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: 11.4 }}>
              <span className="font-semibold" style={{ color: "var(--success-text)" }}>{transactions.filter((t) => t.status === "Completed").length}</span>
              <span style={{ color: "var(--text-muted)" }}>Completed</span>
            </div>
            <div
              className="flex items-center gap-2 rounded-xl"
              style={disputedCount > 0
                ? { padding: "9px 14px", border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.15)", fontSize: 11.4 }
                : { padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: 11.4 }}
            >
              <span className="font-semibold" style={{ color: disputedCount > 0 ? "var(--danger-text)" : "var(--text-muted)" }}>{disputedCount}</span>
              <span style={{ color: "var(--text-muted)" }}>Disputed</span>
            </div>
          </div>
        );
      })()}

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 200, maxWidth: 360 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by ID, homeowner, or provider…"
            aria-label="Search escrow transactions"
            value={search}
            onChange={(e) => { setSearch(e.target.value); clearSelectionOnScopeChange(); }}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: 9, padding: "0 13px 0 36px", fontSize: 12, fontFamily: "inherit" }}
          />
        </div>
        <div className="inline-flex flex-wrap" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: 9, gap: 2 }}>
          {(["all", "Completed", "In Escrow", "Disputed", "Refunded"] as StatusFilter[]).map((f) => (
            <button key={f} onClick={() => { setStatusFilter(f); clearSelectionOnScopeChange(); }}
              className={clsx("rounded-lg font-medium cursor-pointer transition-all", statusFilter !== f && "text-gray-500 hover:text-gray-300")}
              style={{ padding: "5px 10px", fontSize: 10.5, background: statusFilter === f ? "var(--indigo-dark)" : "transparent", color: statusFilter === f ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
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
                    aria-label="Select all escrow transactions on this page"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={transactions.length === 0}
                  />
                </th>
                <th>ID</th>
                <th>Homeowner</th>
                <th className="hidden md:table-cell">Provider</th>
                <th className="hidden lg:table-cell">Service</th>
                <th>Amount</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Date</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <Fragment key={t.id}>
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        className={clsx("row-checkbox", selected.size > 0 && "always-visible")}
                        aria-label={`Select escrow transaction ${t.id}`}
                        checked={selected.has(t.id)}
                        onChange={() => toggleOne(t.id)}
                      />
                    </td>
                    <td style={{ color: "var(--indigo-light)", fontFamily: "monospace", fontSize: 11 }}>{t.id}</td>
                    <td className="text-white">{t.customer}</td>
                    <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{t.provider}</td>
                    <td className="hidden lg:table-cell" style={{ color: "var(--text-light)" }}>{t.service}</td>
                    <td className="text-white font-semibold">{t.amount}</td>
                    <td><span className={clsx("badge", t.statusClass)}>{t.status}</span></td>
                    <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{t.date}</td>
                    <td>
                      <button
                        title="View details"
                        onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                        aria-label={`${expandedId === t.id ? "Hide" : "Show"} details for ${t.id}`}
                        aria-expanded={expandedId === t.id}
                        className="flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
                        style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", transform: expandedId === t.id ? "rotate(180deg)" : "none" }}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </td>
                  </tr>
                  {expandedId === t.id && (
                    <tr>
                      <td colSpan={9} style={{ background: "var(--chip-bg)", padding: "12px 16px" }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: 11.4 }}>
                          {[
                            ["ESCROW ID", t.id],
                            ["JOB ID", t.jobId],
                            ["HOMEOWNER", t.customer],
                            ["PROVIDER", t.provider],
                            ["SERVICE", t.service],
                            ["AMOUNT HELD", t.amount],
                            ["STATUS", t.status],
                            ["HELD SINCE", t.date],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                              <div className="text-white" style={{ wordBreak: "break-all" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {loading
                      ? "Loading transactions…"
                        : totalCount === 0
                        ? "No escrow transactions yet."
                        : "No transactions match this search or filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={(nextPage) => { setSelected(new Set()); setPage(nextPage); }}
          itemLabel="transactions"
        />
      </div>
    </div>
  );
});

/**
 * The wallet ledger — top-ups, withdrawals, and the payout/refund rows escrow
 * itself writes. Distinct data source from the Escrow tab: escrow is money
 * held for one job, this is a user's running balance. Fetched on demand
 * (first time the tab is opened) rather than on every page load, matching how
 * BookingsPage fetches booking detail on expand.
 */
const WalletTab = forwardRef<ExportHandle, TabProps>(function WalletTab({ onExportCountChange }, ref) {
  const [rows, setRows] = useState<WalletTxnRow[] | "loading" | "error">("loading");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    services
      .getWalletTransactions()
      .then((txns) => {
        if (!cancelled) setRows(txns.map(toWalletTxnRow));
      })
      .catch(() => {
        if (!cancelled) setRows("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoised so the imperative handle below isn't rebuilt on every render.
  const filtered = useMemo(
    () =>
      Array.isArray(rows)
        ? rows.filter(
            (r) =>
              r.profileName.toLowerCase().includes(search.toLowerCase()) ||
              r.title.toLowerCase().includes(search.toLowerCase()),
          )
        : [],
    [rows, search],
  );

  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allSelected = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visibleRows.map((r) => r.id)));
  }

  function clearSelectionOnScopeChange() {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    setPage(1);
  }

  /** Exports checked rows or every row on the current page. */
  const exportScope = selected.size > 0 ? visibleRows.filter((r) => selected.has(r.id)) : visibleRows;

  useImperativeHandle(
    ref,
    () => ({
      exportCsv: () => {
        const csv = toCsv(
          ["ID", "User", "Kind", "Amount", "Title", "Date"],
          exportScope.map((r) => [r.id, r.profileName, r.kindLabel, r.amountValue, r.title, r.createdAt]),
        );
        downloadCsv(datedFilename("taskbuddy-wallet-transactions"), csv);
      },
    }),
    [exportScope],
  );
  useEffect(() => {
    onExportCountChange({ total: visibleRows.length, selected: selected.size });
  }, [visibleRows.length, selected.size, onExportCountChange]);

  if (rows === "loading") {
    return <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "24px 0" }}>Loading wallet activity…</div>;
  }
  if (rows === "error") {
    return <div style={{ fontSize: 12, color: "var(--danger-text)", padding: "24px 0" }}>Could not load wallet activity. Please try again.</div>;
  }

  const totalTopups = rows.filter((r) => r.direction === "credit").reduce((s, r) => s + r.amountValue, 0);
  const totalWithdrawals = rows.filter((r) => r.direction === "debit").reduce((s, r) => s + r.amountValue, 0);

  return (
    <div>
      {/* Ledger totals are neutral facts, not statuses — one calm surface,
          matching the Escrow tab's counters. */}
      <div className="flex gap-2.5 flex-wrap mb-4">
        {[
          { label: "Ledger Rows", val: rows.length.toLocaleString() },
          { label: "Total Topped Up", val: `₱${totalTopups.toLocaleString()}` },
          { label: "Total Withdrawn", val: `₱${totalWithdrawals.toLocaleString()}` },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: 11.4 }}>
            <span className="font-semibold text-white tabular">{s.val}</span>
            <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="relative mb-4" style={{ maxWidth: 360 }}>
        <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
        <input
          className="w-full text-white outline-none"
          placeholder="Search by user or description…"
            aria-label="Search wallet activity"
          value={search}
          onChange={(e) => { setSearch(e.target.value); clearSelectionOnScopeChange(); }}
          style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: 9, padding: "0 13px 0 36px", fontSize: 12, fontFamily: "inherit" }}
        />
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
                    aria-label="Select all wallet rows on this page"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={filtered.length === 0}
                  />
                </th>
                <th>User</th>
                <th>Type</th>
                <th className="hidden md:table-cell">Description</th>
                <th>Amount</th>
                <th className="hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      className={clsx("row-checkbox", selected.size > 0 && "always-visible")}
                      aria-label={`Select wallet row ${r.id}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </td>
                  <td className="text-white">{r.profileName}</td>
                  <td><span className={clsx("badge", r.kindClass)}>{r.kindLabel}</span></td>
                  <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{r.title}</td>
                  <td className="font-semibold" style={{ color: r.direction === "credit" ? "var(--success-text)" : "var(--text-light)" }}>{r.amount}</td>
                  <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{r.createdAt}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    No wallet activity found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={(nextPage) => { setSelected(new Set()); setPage(nextPage); }}
          itemLabel="wallet rows"
        />
      </div>
    </div>
  );
});

export function TransactionsPage() {
  const [tab, setTab] = useState<Tab>("escrow");
  const [exportInfo, setExportInfo] = useState({ total: 0, selected: 0 });
  const [confirmingExport, setConfirmingExport] = useState(false);
  const escrowRef = useRef<ExportHandle>(null);
  const walletRef = useRef<ExportHandle>(null);

  const exportCount = exportInfo.selected > 0 ? exportInfo.selected : exportInfo.total;

  function handleExport() {
    setConfirmingExport(false);
    (tab === "escrow" ? escrowRef.current : walletRef.current)?.exportCsv();
  }

  return (
    <div>
      {/* Title + Export CSV on one row, matching User Management/Bookings — the
          tabs are a second, independent row below, not stacked under their own
          separate export button (which used to leave a large empty gap). */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-white font-bold" style={{ fontSize: 22, letterSpacing: "-0.025em" }}>Transactions</h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Monitor escrow payments and wallet activity across the platform</div>
        </div>
        <button
          onClick={() => setConfirmingExport(true)}
          disabled={exportCount === 0}
          title={exportInfo.selected > 0 ? "Download only the checked rows" : "Download the current page"}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> {exportInfo.selected > 0 ? `Export ${exportInfo.selected} selected` : "Export current page"}
        </button>
      </div>

      <div className="inline-flex mb-4" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: 9, gap: 2 }}>
        {([
          ["escrow", "Escrow"],
          ["wallet", "Wallet"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx("rounded-lg font-medium cursor-pointer transition-all", tab !== id && "text-gray-500 hover:text-gray-300")}
            style={{ padding: "6px 16px", fontSize: 11.4, background: tab === id ? "var(--indigo-dark)" : "transparent", color: tab === id ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "escrow" ? (
        <EscrowTab ref={escrowRef} onExportCountChange={setExportInfo} />
      ) : (
        <WalletTab ref={walletRef} onExportCountChange={setExportInfo} />
      )}

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message={`This downloads ${exportCount} row${exportCount === 1 ? "" : "s"} from the current ${tab === "escrow" ? "Escrow" : "Wallet"} page as a .csv file to your device.`}
        confirmLabel="Export"
        onConfirm={handleExport}
        onCancel={() => setConfirmingExport(false)}
      />
    </div>
  );
}
