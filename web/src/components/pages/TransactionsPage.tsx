"use client";

import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Download, Gift } from "lucide-react";
import * as services from "@/lib/services";
import { useApp } from "@/context/AppContext";
import { toTransactionRow, toWalletTxnRow, type TransactionRow, type WalletTxnRow } from "@/lib/adapters";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { RECOVERY_CREDIT_MAX_AMOUNT, RECOVERY_CREDIT_TITLE_MAX_LENGTH, validateRecoveryCreditAmount } from "@/lib/validation";
import { ApiError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import clsx from "clsx";

const PAGE_SIZE = 7;

/** What an admin is told after "Retry transfer" (see ConnectPayoutsService). */
const RETRY_OUTCOME_MESSAGE: Record<services.TransferRetryOutcome, string> = {
  transferred: "Payout sent to the provider's Stripe account.",
  not_eligible: "The provider hasn't finished setting up payouts. The money stays in their wallet.",
  failed: "Stripe refused the transfer again. The money stays in the provider's wallet.",
  abandoned: "Stripe refused the transfer. The money stays in the provider's wallet.",
  retry: "Stripe didn't answer. The transfer is queued and will be retried automatically.",
  skipped: "Nothing to retry for this escrow.",
};

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
  const [reloadKey, setReloadKey] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const { showToast } = useToast();

  /** Retries a card-funded payout's Stripe transfer, then reloads the page. */
  async function retryTransfer(t: TransactionRow) {
    setRetryingId(t.id);
    try {
      const outcome = await services.retryEscrowTransfer(t.id);
      showToast(RETRY_OUTCOME_MESSAGE[outcome], outcome === "transferred" ? "success" : "error");
      setReloadKey((k) => k + 1);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not retry the transfer.", "error");
    } finally {
      setRetryingId(null);
    }
  }

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
  }, [search, statusFilter, page, reloadKey]);

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
          ["Escrow ID", "Job ID", "Homeowner", "Provider", "Service", "Amount", "Status", "Date", "Funding", "Payout"],
          exportScope.map((t) => [t.id, t.jobId, t.customer, t.provider, t.service, t.amountValue, t.status, t.date, t.funding, t.payout]),
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
            <div className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: "var(--fs-xs)" }}>
              <span className="font-semibold text-white">{totalCount}</span>
              <span style={{ color: "var(--text-muted)" }}>Total Transactions</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: "var(--fs-xs)" }}>
              <span className="font-semibold text-white">₱{total.toLocaleString()}</span>
              <span style={{ color: "var(--text-muted)" }}>Total Volume</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: "var(--fs-xs)" }}>
              <span className="font-semibold" style={{ color: "var(--success-text)" }}>{transactions.filter((t) => t.status === "Completed").length}</span>
              <span style={{ color: "var(--text-muted)" }}>Completed</span>
            </div>
            <div
              className="flex items-center gap-2 rounded-xl"
              style={disputedCount > 0
                ? { padding: "9px 14px", border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.15)", fontSize: "var(--fs-xs)" }
                : { padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: "var(--fs-xs)" }}
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
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: "var(--r-md)", padding: "0 13px 0 36px", fontSize: "var(--fs-sm)", fontFamily: "inherit" }}
          />
        </div>
        <div className="inline-flex flex-wrap" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: "var(--r-md)", gap: 2 }}>
          {(["all", "Completed", "In Escrow", "Disputed", "Refunded"] as StatusFilter[]).map((f) => (
            <button key={f} onClick={() => { setStatusFilter(f); clearSelectionOnScopeChange(); }}
              className={clsx("rounded-lg font-medium cursor-pointer transition-colors", statusFilter !== f && "text-gray-500 hover:text-gray-300")}
              style={{ padding: "5px 10px", fontSize: "var(--fs-2xs)", background: statusFilter === f ? "var(--indigo-dark)" : "transparent", color: statusFilter === f ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 flex-wrap" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
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
                <th className="hidden lg:table-cell">Payout</th>
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
                    <td style={{ color: "var(--indigo-light)", fontFamily: "monospace", fontSize: "var(--fs-xs)" }}>{t.id}</td>
                    <td className="text-white">{t.customer}</td>
                    <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{t.provider}</td>
                    <td className="hidden lg:table-cell" style={{ color: "var(--text-light)" }}>{t.service}</td>
                    <td className="text-white font-semibold">{t.amount}</td>
                    <td><span className={clsx("badge", t.statusClass)}>{t.status}</span></td>
                    <td className="hidden lg:table-cell">
                      {t.payout && (
                        <span className={clsx("badge", t.payoutClass)} title={t.payoutDetail ?? undefined}>
                          {t.payout}
                        </span>
                      )}
                    </td>
                    <td className="hidden md:table-cell" style={{ color: "var(--text-light)" }}>{t.date}</td>
                    <td>
                      <button
                        title="View details"
                        onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                        aria-label={`${expandedId === t.id ? "Hide" : "Show"} details for ${t.id}`}
                        aria-expanded={expandedId === t.id}
                        className="flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                        style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", transform: expandedId === t.id ? "rotate(180deg)" : "none" }}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </td>
                  </tr>
                  {expandedId === t.id && (
                    <tr>
                      <td colSpan={10} style={{ background: "var(--chip-bg)", padding: "12px 16px" }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: "var(--fs-xs)" }}>
                          {[
                            ["ESCROW ID", t.id],
                            ["JOB ID", t.jobId],
                            ["HOMEOWNER", t.customer],
                            ["PROVIDER", t.provider],
                            ["SERVICE", t.service],
                            ["AMOUNT HELD", t.amount],
                            ["STATUS", t.status],
                            ["HELD SINCE", t.date],
                            ["FUNDED BY", t.funding],
                            ["PAYOUT", t.payout || "—"],
                            ...(t.payoutDetail ? [["STRIPE", t.payoutDetail]] : []),
                          ].map(([label, value]) => (
                            <div key={label}>
                              <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                              <div className="text-white" style={{ wordBreak: "break-all" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        {t.canRetryTransfer && (
                          <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
                            <span>The payout is in the provider&apos;s wallet. Retrying sends it to their Stripe account.</span>
                            <button
                              onClick={() => void retryTransfer(t)}
                              disabled={retryingId === t.id}
                              className="rounded-lg font-semibold cursor-pointer"
                              style={{ padding: "6px 12px", background: "var(--indigo-dark)", color: "var(--indigo-light)", border: "none", fontFamily: "inherit", fontSize: "var(--fs-xs)", opacity: retryingId === t.id ? 0.6 : 1 }}
                            >
                              {retryingId === t.id ? "Retrying…" : "Retry transfer"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: "var(--fs-md)" }}>
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
  const { users } = useApp();
  const { showToast } = useToast();
  const [rows, setRows] = useState<WalletTxnRow[] | "loading" | "error">("loading");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Issue Credit form state. A plain object rather than five separate
  // useState calls since it's reset/read as a unit (open, close, submit).
  const [issuingCredit, setIssuingCredit] = useState(false);
  const [creditRecipientQuery, setCreditRecipientQuery] = useState("");
  const [creditProfileId, setCreditProfileId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditTitle, setCreditTitle] = useState("");
  const [creditJobId, setCreditJobId] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState("");

  function resetCreditForm() {
    setCreditRecipientQuery("");
    setCreditProfileId(null);
    setCreditAmount("");
    setCreditTitle("");
    setCreditJobId("");
    setCreditError("");
  }

  async function loadWallet() {
    try {
      const txns = await services.getWalletTransactions();
      setRows(txns.map(toWalletTxnRow));
    } catch {
      setRows("error");
    }
  }

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
    return <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", padding: "24px 0" }}>Loading wallet activity…</div>;
  }
  if (rows === "error") {
    return <div style={{ fontSize: "var(--fs-sm)", color: "var(--danger-text)", padding: "24px 0" }}>Could not load wallet activity. Please try again.</div>;
  }

  const totalTopups = rows.filter((r) => r.direction === "credit").reduce((s, r) => s + r.amountValue, 0);
  const totalWithdrawals = rows.filter((r) => r.direction === "debit").reduce((s, r) => s + r.amountValue, 0);

  // Recipient search over the users already loaded app-wide — there's no
  // dedicated "search users" endpoint, and the admin picking a recovery-credit
  // recipient by typing a raw UUID isn't realistic. Capped to 6 so picking a
  // common name doesn't dump the whole user base into a dropdown.
  const selectedRecipient = creditProfileId ? users.find((u) => u.id === creditProfileId) : undefined;
  const recipientMatches =
    !selectedRecipient && creditRecipientQuery.trim().length > 0
      ? users
          .filter(
            (u) =>
              u.name.toLowerCase().includes(creditRecipientQuery.toLowerCase()) ||
              u.email.toLowerCase().includes(creditRecipientQuery.toLowerCase()),
          )
          .slice(0, 6)
      : [];

  const creditAmountError = creditAmount ? validateRecoveryCreditAmount(creditAmount) : null;
  const creditTitleTooLong = creditTitle.length > RECOVERY_CREDIT_TITLE_MAX_LENGTH;
  const creditFormValid =
    !!creditProfileId &&
    creditAmount.trim().length > 0 &&
    !creditAmountError &&
    creditTitle.trim().length > 0 &&
    !creditTitleTooLong;

  function closeCreditDialog() {
    setIssuingCredit(false);
    resetCreditForm();
  }

  async function confirmIssueCredit() {
    if (!creditProfileId || !creditFormValid) return;
    setCreditBusy(true);
    setCreditError("");
    try {
      await services.issueRecoveryCredit({
        profileId: creditProfileId,
        amount: Number(creditAmount),
        title: creditTitle,
        jobId: creditJobId,
      });
      await loadWallet();
      showToast("Recovery credit issued.");
      closeCreditDialog();
    } catch (err) {
      // Surfaced verbatim: the backend's four refusal messages (deleted
      // recipient, job_id not theirs, over the ceiling, unknown profile) are
      // specific enough to act on, unlike a generic "something went wrong".
      setCreditError(err instanceof ApiError ? err.message : "Unable to issue credit. Please try again.");
    } finally {
      setCreditBusy(false);
    }
  }

  return (
    <div>
      {/* Ledger totals are neutral facts, not statuses — one calm surface,
          matching the Escrow tab's counters. */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-2.5 flex-wrap">
          {[
            { label: "Ledger Rows", val: rows.length.toLocaleString() },
            { label: "Total Topped Up", val: `₱${totalTopups.toLocaleString()}` },
            { label: "Total Withdrawn", val: `₱${totalWithdrawals.toLocaleString()}` },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 rounded-xl" style={{ padding: "9px 14px", border: "1px solid var(--card-border)", background: "var(--chip-bg)", fontSize: "var(--fs-xs)" }}>
              <span className="font-semibold text-white tabular">{s.val}</span>
              <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setIssuingCredit(true)}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80"
          style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--r-md)", padding: "7px 13px", fontSize: "var(--fs-xs)", color: "var(--success-text)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Gift size={12} /> Issue Credit
        </button>
      </div>

      <div className="relative mb-4" style={{ maxWidth: 360 }}>
        <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
        <input
          className="w-full text-white outline-none"
          placeholder="Search by user or description…"
            aria-label="Search wallet activity"
          value={search}
          onChange={(e) => { setSearch(e.target.value); clearSelectionOnScopeChange(); }}
          style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: "var(--r-md)", padding: "0 13px 0 36px", fontSize: "var(--fs-sm)", fontFamily: "inherit" }}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 flex-wrap" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>
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
                  <td colSpan={6} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: "var(--fs-md)" }}>
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

      <ConfirmDialog
        open={issuingCredit}
        danger={false}
        title="Issue recovery credit"
        message="Adds wallet balance for a user, typically after a dispute — spendable on a hire or withdrawable like any other peso."
        confirmLabel="Issue credit"
        busy={creditBusy}
        confirmDisabled={!creditFormValid}
        onConfirm={confirmIssueCredit}
        onCancel={closeCreditDialog}
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <label className="block font-semibold mb-1" style={{ fontSize: "var(--fs-xs)", color: "var(--text-light)" }}>
              Recipient
            </label>
            {selectedRecipient ? (
              <div
                className="flex items-center justify-between"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "7px 11px" }}
              >
                <span style={{ fontSize: "var(--fs-xs)" }} className="text-white">
                  {selectedRecipient.name} <span style={{ color: "var(--text-muted)" }}>({selectedRecipient.email})</span>
                </span>
                <button
                  onClick={() => { setCreditProfileId(null); setCreditRecipientQuery(""); }}
                  className="font-semibold"
                  style={{ background: "transparent", border: 0, color: "var(--text-muted)", fontSize: "var(--fs-xs)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Change
                </button>
              </div>
            ) : (
              <input
                autoFocus
                placeholder="Search by name or email…"
                aria-label="Search recipient by name or email"
                value={creditRecipientQuery}
                onChange={(e) => setCreditRecipientQuery(e.target.value)}
                className="w-full text-white outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "7px 11px", fontSize: "var(--fs-xs)", fontFamily: "inherit" }}
              />
            )}
            {recipientMatches.length > 0 && (
              <div
                className="absolute left-0 right-0 overflow-y-auto"
                style={{ top: "100%", marginTop: 4, maxHeight: 180, background: "var(--panel-bg)", border: "1px solid var(--panel-border)", borderRadius: "var(--r-md)", zIndex: 1, boxShadow: "0 8px 20px rgba(0,0,0,0.3)" }}
              >
                {recipientMatches.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setCreditProfileId(u.id); setCreditRecipientQuery(""); }}
                    className="w-full text-left transition-colors hover:opacity-80"
                    style={{ background: "transparent", border: 0, padding: "7px 11px", fontSize: "var(--fs-xs)", color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit", display: "block" }}
                  >
                    <span className="text-white">{u.name}</span>{" "}
                    <span style={{ color: "var(--text-muted)" }}>({u.email})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ fontSize: "var(--fs-xs)", color: "var(--text-light)" }}>
              Amount (₱)
            </label>
            <input
              type="number"
              min={0.01}
              max={RECOVERY_CREDIT_MAX_AMOUNT}
              step="0.01"
              placeholder="e.g. 500"
              aria-label="Credit amount in pesos"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="w-full text-white outline-none"
              style={{ background: "var(--input-bg)", border: `1px solid ${creditAmountError ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: "var(--r-md)", padding: "7px 11px", fontSize: "var(--fs-xs)", fontFamily: "inherit" }}
            />
            {creditAmountError && (
              <div style={{ fontSize: "var(--fs-2xs)", color: "var(--danger-text)", marginTop: 4 }}>{creditAmountError}</div>
            )}
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ fontSize: "var(--fs-xs)", color: "var(--text-light)" }}>
              Title <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(shown to the recipient)</span>
            </label>
            <input
              placeholder="e.g. Dispute resolution credit"
              aria-label="Credit title, shown to the recipient"
              value={creditTitle}
              onChange={(e) => setCreditTitle(e.target.value)}
              className="w-full text-white outline-none"
              style={{ background: "var(--input-bg)", border: `1px solid ${creditTitleTooLong ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: "var(--r-md)", padding: "7px 11px", fontSize: "var(--fs-xs)", fontFamily: "inherit" }}
            />
            <div style={{ fontSize: "var(--fs-2xs)", color: creditTitleTooLong ? "var(--danger-text)" : "var(--text-muted)", marginTop: 4 }}>
              {creditTitle.length}/{RECOVERY_CREDIT_TITLE_MAX_LENGTH}
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ fontSize: "var(--fs-xs)", color: "var(--text-light)" }}>
              Job ID <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional — the dispute or job this compensates)</span>
            </label>
            <input
              placeholder="Optional"
              aria-label="Related job ID (optional)"
              value={creditJobId}
              onChange={(e) => setCreditJobId(e.target.value)}
              className="w-full text-white outline-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "7px 11px", fontSize: "var(--fs-xs)", fontFamily: "inherit" }}
            />
          </div>

          {creditError && (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--danger-text)" }}>{creditError}</div>
          )}
        </div>
      </ConfirmDialog>
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
          <h1 className="text-white font-bold" style={{ fontSize: "var(--fs-2xl)", letterSpacing: "-0.025em" }}>Transactions</h1>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Monitor escrow payments and wallet activity across the platform</div>
        </div>
        <button
          onClick={() => setConfirmingExport(true)}
          disabled={exportCount === 0}
          title={exportInfo.selected > 0 ? "Download only the checked rows" : "Download the current page"}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "7px 13px", fontSize: "var(--fs-xs)", color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> {exportInfo.selected > 0 ? `Export ${exportInfo.selected} selected` : "Export current page"}
        </button>
      </div>

      <div className="inline-flex mb-4" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: "var(--r-md)", gap: 2 }}>
        {([
          ["escrow", "Escrow"],
          ["wallet", "Wallet"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx("rounded-lg font-medium cursor-pointer transition-colors", tab !== id && "text-gray-500 hover:text-gray-300")}
            style={{ padding: "6px 16px", fontSize: "var(--fs-xs)", background: tab === id ? "var(--indigo-dark)" : "transparent", color: tab === id ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit" }}
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
