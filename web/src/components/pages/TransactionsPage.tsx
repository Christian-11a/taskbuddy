"use client";

import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import { toWalletTxnRow, type WalletTxnRow } from "@/lib/adapters";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import clsx from "clsx";

type StatusFilter = "all" | "Completed" | "In Escrow" | "Disputed" | "Refunded";
type Tab = "escrow" | "wallet";

/** What each tab exposes to the shared header Export CSV button (see TransactionsPage). */
interface ExportHandle {
  exportCsv: () => void;
}

interface TabProps {
  /** Tells the parent how many rows the header's Export CSV button would
   *  download — drives both its disabled state and the confirm dialog's row
   *  count. Driven by `filtered.length`, a primitive, so this only fires when
   *  the count actually changes rather than on every render (the filtered
   *  array itself is a new reference every render and would otherwise
   *  re-trigger endlessly). */
  onExportCountChange: (count: number) => void;
}

const EscrowTab = forwardRef<ExportHandle, TabProps>(function EscrowTab({ onExportCountChange }, ref) {
  const { transactions, loading } = useApp();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Memoised so the imperative handle below isn't rebuilt on every render.
  const filtered = useMemo(
    () =>
      transactions.filter((t) => {
        const matchSearch =
          t.id.toLowerCase().includes(search.toLowerCase()) ||
          t.customer.toLowerCase().includes(search.toLowerCase()) ||
          t.provider.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "all" || t.status === statusFilter;
        return matchSearch && matchStatus;
      }),
    [transactions, search, statusFilter],
  );

  const total = transactions.reduce((s, t) => s + t.amountValue, 0);

  // Exports what's on screen (current search + status filter), not the whole ledger.
  useImperativeHandle(
    ref,
    () => ({
      exportCsv: () => {
        const csv = toCsv(
          ["Escrow ID", "Job ID", "Customer", "Provider", "Service", "Amount", "Status", "Date"],
          filtered.map((t) => [t.id, t.jobId, t.customer, t.provider, t.service, t.amountValue, t.status, t.date]),
        );
        downloadCsv(datedFilename("taskbuddy-transactions"), csv);
      },
    }),
    [filtered],
  );
  useEffect(() => {
    onExportCountChange(filtered.length);
  }, [filtered.length, onExportCountChange]);

  return (
    <div>
      <div className="flex gap-2.5 flex-wrap mb-4">
        {[
          { label: "Total Transactions", val: transactions.length, accent: "#6366f1" },
          { label: "Total Volume", val: `₱${total.toLocaleString()}`, accent: "#22c55e" },
          { label: "Completed", val: transactions.filter((t) => t.status === "Completed").length, accent: "var(--success-text)" },
          { label: "Disputed", val: transactions.filter((t) => t.status === "Disputed").length, accent: "#ef4444" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: `1px solid ${s.accent}33`, background: `${s.accent}18`, fontSize: 11.4 }}>
            <span className="font-semibold text-white">{s.val}</span>
            <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by ID, customer, or provider…"
            aria-label="Search escrow transactions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "8px 13px 8px 32px", fontSize: 11.4, fontFamily: "inherit" }}
          />
        </div>
        <div className="inline-flex rounded-xl p-1 gap-1 flex-wrap" style={{ background: "var(--chip-bg)" }}>
          {(["all", "Completed", "In Escrow", "Disputed", "Refunded"] as StatusFilter[]).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={clsx("rounded-lg font-medium cursor-pointer transition-all", statusFilter === f ? "text-indigo-300" : "text-gray-500 hover:text-gray-300")}
              style={{ padding: "5px 10px", fontSize: 10.5, background: statusFilter === f ? "rgba(99,102,241,0.25)" : "transparent", border: "none", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th className="hidden md:table-cell">Provider</th>
                <th className="hidden lg:table-cell">Service</th>
                <th>Amount</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Date</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <Fragment key={t.id}>
                  <tr>
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
                      <td colSpan={8} style={{ background: "var(--chip-bg)", padding: "12px 16px" }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: 11.4 }}>
                          {[
                            ["ESCROW ID", t.id],
                            ["JOB ID", t.jobId],
                            ["CUSTOMER", t.customer],
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {loading
                      ? "Loading transactions…"
                      : transactions.length === 0
                        ? "No escrow transactions yet."
                        : "No transactions match this search or filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

  useImperativeHandle(
    ref,
    () => ({
      exportCsv: () => {
        const csv = toCsv(
          ["ID", "User", "Kind", "Amount", "Title", "Date"],
          filtered.map((r) => [r.id, r.profileName, r.kindLabel, r.amountValue, r.title, r.createdAt]),
        );
        downloadCsv(datedFilename("taskbuddy-wallet-transactions"), csv);
      },
    }),
    [filtered],
  );
  useEffect(() => {
    onExportCountChange(filtered.length);
  }, [filtered.length, onExportCountChange]);

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
      <div className="flex gap-2.5 flex-wrap mb-4">
        {[
          { label: "Ledger Rows", val: rows.length, accent: "#6366f1" },
          { label: "Total Topped Up", val: `₱${totalTopups.toLocaleString()}`, accent: "#22c55e" },
          { label: "Total Withdrawn", val: `₱${totalWithdrawals.toLocaleString()}`, accent: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: `1px solid ${s.accent}33`, background: `${s.accent}18`, fontSize: 11.4 }}>
            <span className="font-semibold text-white">{s.val}</span>
            <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className="relative mb-4" style={{ maxWidth: 320 }}>
        <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
        <input
          className="w-full text-white outline-none"
          placeholder="Search by user or description…"
            aria-label="Search wallet activity"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "8px 13px 8px 32px", fontSize: 11.4, fontFamily: "inherit" }}
        />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th className="hidden md:table-cell">Description</th>
                <th>Amount</th>
                <th className="hidden md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="text-white">{r.profileName}</td>
                  <td><span className={clsx("badge", r.kindClass)}>{r.kindLabel}</span></td>
                  <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{r.title}</td>
                  <td className="font-semibold" style={{ color: r.direction === "credit" ? "var(--success-text)" : "var(--text-light)" }}>{r.amount}</td>
                  <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{r.createdAt}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    No wallet activity found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

export function TransactionsPage() {
  const [tab, setTab] = useState<Tab>("escrow");
  const [exportCount, setExportCount] = useState(0);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const escrowRef = useRef<ExportHandle>(null);
  const walletRef = useRef<ExportHandle>(null);

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
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Transactions</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Monitor escrow payments and wallet activity across the platform</div>
        </div>
        <button
          onClick={() => setConfirmingExport(true)}
          disabled={exportCount === 0}
          title="Download the rows currently shown"
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="inline-flex rounded-xl p-1 gap-1 mb-4" style={{ background: "var(--chip-bg)" }}>
        {([
          ["escrow", "Escrow"],
          ["wallet", "Wallet"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx("rounded-lg font-medium cursor-pointer transition-all", tab === id ? "text-indigo-300" : "text-gray-500 hover:text-gray-300")}
            style={{ padding: "6px 16px", fontSize: 11.4, background: tab === id ? "rgba(99,102,241,0.25)" : "transparent", border: "none", fontFamily: "inherit" }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "escrow" ? (
        <EscrowTab ref={escrowRef} onExportCountChange={setExportCount} />
      ) : (
        <WalletTab ref={walletRef} onExportCountChange={setExportCount} />
      )}

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message={`This downloads ${exportCount} row${exportCount === 1 ? "" : "s"} from the ${tab === "escrow" ? "Escrow" : "Wallet"} tab as a .csv file to your device.`}
        confirmLabel="Export"
        onConfirm={handleExport}
        onCancel={() => setConfirmingExport(false)}
      />
    </div>
  );
}
