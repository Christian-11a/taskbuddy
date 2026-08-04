"use client";

import { Fragment, useState } from "react";
import { Search, ChevronDown, Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import clsx from "clsx";

type StatusFilter = "all" | "Completed" | "In Escrow" | "Disputed" | "Refunded";

export function TransactionsPage() {
  const { transactions } = useApp();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = transactions.filter((t) => {
    const matchSearch =
      t.id.toLowerCase().includes(search.toLowerCase()) ||
      t.customer.toLowerCase().includes(search.toLowerCase()) ||
      t.provider.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const total = transactions.reduce((s, t) => s + t.amountValue, 0);

  /** Exports what's on screen (current search + status filter), not the whole ledger. */
  function exportCsv() {
    const csv = toCsv(
      ["Escrow ID", "Job ID", "Customer", "Provider", "Service", "Amount", "Status", "Date"],
      filtered.map((t) => [t.id, t.jobId, t.customer, t.provider, t.service, t.amountValue, t.status, t.date]),
    );
    downloadCsv(datedFilename("taskbuddy-transactions"), csv);
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Transactions</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Monitor all platform transactions and escrow payments</div>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
