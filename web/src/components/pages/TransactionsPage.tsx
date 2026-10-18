"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Landmark, Lock, PanelRightOpen, Receipt, RefreshCw, ShieldAlert } from "lucide-react";
import * as services from "@/lib/services";
import { useApp } from "@/context/AppContext";
import { RETRY_OUTCOME_MESSAGE, toTransactionRow, toWalletTxnRow, type TransactionRow, type WalletTxnRow } from "@/lib/adapters";
import { exportMasks } from "@/lib/export/anonymize";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { ApiError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReviewDrawer, DrawerField, DrawerSection } from "@/components/ui/ReviewDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/Panel";
import { FilterTabs, SearchField, searchErrorMessage } from "@/components/admin/queue";
import { BulkBar, DataTable, LoadFailedState, RefreshFailedBanner, SummaryStrip, TableCard, TableEmpty, type Column } from "@/components/admin/table";
import { toneFromBadgeClass } from "@/components/admin/tones";
import { useLiveTick } from "@/hooks/useLiveTick";
import { useBookingDetailCache } from "@/hooks/useBookingDetailCache";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

type StatusFilter = "all" | "Completed" | "In Escrow" | "Disputed" | "Refunded";
type Tab = "escrow" | "wallet";

const ESCROW_TONE: Record<string, "ok" | "info" | "danger" | "neutral"> = {
  Completed: "ok",
  "In Escrow": "info",
  Disputed: "danger",
  Refunded: "neutral",
};

/** What each tab exposes to the shared header Export CSV button. */
interface ExportHandle {
  exportCsv: () => void;
}

/** Tells the parent how many rows the header's Export CSV button would
 *  download. Driven by primitives so it only fires when the counts change. */
interface TabProps {
  onExportCountChange: (info: { total: number; selected: number }) => void;
  onRequestExport: () => void;
}

function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  return {
    selected,
    setSelected,
    allSelected,
    toggleOne: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () => setSelected(allSelected ? new Set() : new Set(ids)),
    clear: () => setSelected((prev) => (prev.size === 0 ? prev : new Set())),
  };
}

const EscrowTab = forwardRef<ExportHandle, TabProps>(function EscrowTab({ onExportCountChange, onRequestExport }, ref) {
  const { settings } = useApp();
  const anonymizeExports = settings.anonymizeExports;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  /** The last load failed. Rows stay on screen when there are any (see the banner). */
  const [loadFailed, setLoadFailed] = useState(false);
  /** The API rejected the search term (HTTP 400); shown under the search box. */
  const [searchError, setSearchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const { showToast } = useToast();
  const sel = useSelection(transactions.map((t) => t.id));

  /** Retries a payout that did not go through, then reloads the page. */
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
    void services
      .searchTransactions({
        search: debouncedSearch,
        status:
          statusFilter === "all"
            ? undefined
            : ({ Completed: "released", "In Escrow": "held", Disputed: "disputed", Refunded: "refunded" }[statusFilter] as
                | "released"
                | "held"
                | "disputed"
                | "refunded"),
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        if (!cancelled) {
          setTransactions(result.items.map(toTransactionRow));
          setTotalCount(result.total);
          setLoadFailed(false);
          setSearchError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const badSearch = searchErrorMessage(err);
        if (badSearch) {
          setSearchError(badSearch);
        } else {
          // Keep the last good rows and total; the banner says they may be stale.
          setLoadFailed(true);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [debouncedSearch, statusFilter, page, reloadKey]);

  useLiveTick(() => setReloadKey((k) => k + 1));
  const retryLoad = () => setReloadKey((k) => k + 1);

  const volume = transactions.reduce((s, t) => s + t.amountValue, 0);
  const disputedCount = transactions.filter((t) => t.status === "Disputed").length;

  function clearSelectionOnScopeChange() {
    sel.clear();
    setPage(1);
  }

  /** Exports checked rows or every row on the current server-loaded page. */
  const exportScope = sel.selected.size > 0 ? transactions.filter((t) => sel.selected.has(t.id)) : transactions;

  useImperativeHandle(
    ref,
    () => ({
      exportCsv: () => {
        const mask = exportMasks(anonymizeExports);
        const csv = toCsv(
          ["Escrow ID", "Job ID", "Client", "Provider", "Service", "Amount", "Status", "Date", "Funding", "Payout"],
          exportScope.map((t) => [t.id, t.jobId, mask.name(t.customer), mask.name(t.provider), t.service, t.amountValue, t.status, t.date, t.funding, t.payout]),
        );
        downloadCsv(datedFilename("taskbuddy-transactions"), csv);
      },
    }),
    [exportScope, anonymizeExports],
  );
  useEffect(() => {
    onExportCountChange({ total: transactions.length, selected: sel.selected.size });
  }, [transactions.length, sel.selected.size, onExportCountChange]);

  const columns: Column<TransactionRow>[] = [
    { id: "id", header: "Escrow", cell: (t) => <span className="font-mono text-[12px] text-primary" title={t.id}>{t.id.slice(0, 8)}</span> },
    { id: "customer", header: "Client", cell: (t) => <span className="font-medium">{t.customer}</span> },
    { id: "provider", header: "Provider", hideBelow: "md", cell: (t) => <span className="text-muted-foreground">{t.provider}</span> },
    { id: "service", header: "Service", hideBelow: "lg", cell: (t) => <span className="text-muted-foreground">{t.service}</span> },
    { id: "amount", header: "Amount", align: "right", cell: (t) => <span className="tabular font-semibold">{t.amount}</span> },
    {
      id: "status",
      header: "Status",
      cell: (t) => (
        <Badge tone={ESCROW_TONE[t.status] ?? toneFromBadgeClass(t.statusClass)} dot>
          {t.status}
        </Badge>
      ),
    },
    {
      id: "payout",
      header: "Payout",
      hideBelow: "lg",
      cell: (t) =>
        t.payout ? (
          <Badge tone={toneFromBadgeClass(t.payoutClass)} title={t.payoutDetail ?? undefined}>
            {t.payout}
          </Badge>
        ) : (
          <span className="text-muted-foreground" title={t.payoutNote ?? undefined}>—</span>
        ),
    },
    { id: "date", header: "Date", hideBelow: "md", cell: (t) => <span className="tabular text-muted-foreground">{t.date}</span> },
    {
      id: "open",
      header: <span className="sr-only">Details</span>,
      width: 44,
      align: "right",
      cell: (t) => (
        <button
          title="View details"
          onClick={(e) => {
            e.stopPropagation();
            setOpenId(t.id);
          }}
          aria-label={`Show details for ${t.id}`}
          className="grid size-7 place-items-center rounded-md text-subtle opacity-60 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <PanelRightOpen className="size-3.5" />
        </button>
      ),
    },
  ];

  const open = transactions.find((t) => t.id === openId) ?? null;
  const openJobId = open?.jobId ?? null;

  // Job detail gives whether the job is completed. Requested when the drawer opens and
  // refreshed on live ticks while it stays open (see useBookingDetailCache); a
  // failed request shows nothing extra and no toast.
  const job = useBookingDetailCache(openJobId);
  // Released once a completed job's escrow is released; otherwise release is in progress, or held while a complaint is open.
  const jobPayment =
    job && job !== "error" && job.status === "completed" && (job.escrowStatus === "COMPLETED" || job.escrowStatus === "IN_ESCROW" || job.escrowStatus === "DISPUTED")
      ? job.escrowStatus
      : null;

  return (
    <div>
      <SummaryStrip
        items={[
          { icon: Receipt, label: "transactions", value: totalCount.toLocaleString() },
          { icon: Landmark, label: "volume on this page", value: `₱${volume.toLocaleString()}` },
          { icon: Lock, label: "completed", value: transactions.filter((t) => t.status === "Completed").length },
          // Only loud when there's actually something disputed.
          ...(disputedCount > 0 ? [{ icon: ShieldAlert, label: "disputed", value: <span className="text-danger">{disputedCount}</span> }] : []),
        ]}
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
              placeholder="Search by ID, client, or provider…"
              label="Search escrow transactions"
              maxLength={100}
              error={searchError}
            />
            <FilterTabs
              id="escrow-status"
              label="Filter escrow transactions by status"
              value={statusFilter}
              onChange={(f) => {
                setStatusFilter(f);
                clearSelectionOnScopeChange();
              }}
              options={(["all", "Completed", "In Escrow", "Disputed", "Refunded"] as StatusFilter[]).map((f) => ({
                value: f,
                label: f === "all" ? "All" : f,
              }))}
            />
          </>
        }
      >
        {loadFailed && transactions.length > 0 && <RefreshFailedBanner noun="escrow transactions" onRetry={retryLoad} />}
        <DataTable
          label="Escrow transactions table"
          columns={columns}
          rows={transactions}
          getRowId={(t) => t.id}
          onRowClick={(t) => setOpenId(t.id)}
          activeRowId={openId}
          minWidth={820}
          rowClassName={() => (loading ? "opacity-60" : undefined)}
          selection={{
            selected: sel.selected,
            onToggle: sel.toggleOne,
            onToggleAll: sel.toggleAll,
            allSelected: sel.allSelected,
            rowLabel: (id) => `Select escrow transaction ${id}`,
            allLabel: "Select all escrow transactions on this page",
            disabledAll: transactions.length === 0,
          }}
          empty={
            loadFailed && !loading ? (
              <LoadFailedState noun="escrow transactions" onRetry={retryLoad} />
            ) : (
              <TableEmpty>
                {loading
                  ? "Loading transactions…"
                  : totalCount === 0 && statusFilter === "all" && !search.trim()
                    ? "No escrow transactions yet."
                    : "No transactions match this search or filter."}
              </TableEmpty>
            )
          }
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={(nextPage) => {
            sel.setSelected(new Set());
            setPage(nextPage);
          }}
          itemLabel="transactions"
        />
      </TableCard>

      <BulkBar count={sel.selected.size} noun="transaction" onClear={() => sel.setSelected(new Set())}>
        <Button size="sm" variant="outline" onClick={onRequestExport}>
          <Download /> Export
        </Button>
      </BulkBar>

      <ReviewDrawer
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? open.service : ""}
        subtitle={open ? `Escrow ${open.id.slice(0, 8)} · Held since ${open.date}` : undefined}
        footer={
          open?.canRetryTransfer ? (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setOpenId(null)}>
                Close
              </Button>
              <Button className="flex-1" onClick={() => void retryTransfer(open)} disabled={retryingId === open.id}>
                <RefreshCw className={retryingId === open.id ? "animate-spin" : ""} />
                {retryingId === open.id ? "Retrying…" : "Retry payout"}
              </Button>
            </>
          ) : undefined
        }
      >
        {open && (
          <>
            <div className="mb-5 flex items-center justify-between gap-3">
              <Badge tone={ESCROW_TONE[open.status] ?? toneFromBadgeClass(open.statusClass)} dot>
                {open.status}
              </Badge>
              <span className="tabular text-[22px] font-semibold tracking-tight">{open.amount}</span>
            </div>
            <DrawerSection title="Parties">
              <div className="grid grid-cols-2 gap-4">
                <DrawerField label="Client" value={open.customer} />
                <DrawerField label="Provider" value={open.provider} />
                <DrawerField label="Service" value={open.service} />
                <DrawerField label="Job ID" value={<span className="break-all font-mono text-[12px]">{open.jobId}</span>} />
                <DrawerField label="Escrow ID" value={<span className="break-all font-mono text-[12px]">{open.id}</span>} />
              </div>
            </DrawerSection>
            <DrawerSection title="Money">
              <div className="grid grid-cols-2 gap-4">
                <DrawerField label="Amount held" value={open.amount} />
                <DrawerField label="Funded by" value={open.funding} />
                <DrawerField
                  label="Payout"
                  value={open.payout ? <Badge tone={toneFromBadgeClass(open.payoutClass)}>{open.payout}</Badge> : <span title={open.payoutNote ?? undefined}>{open.payoutNote ? `— ${open.payoutNote}` : "—"}</span>}
                />
                {open.payoutDetail && <DrawerField label="Payout reference" value={<span className="break-all">{open.payoutDetail}</span>} />}
              </div>
              {jobPayment && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]">
                  {jobPayment === "COMPLETED" ? (
                    <Badge tone="ok" dot>Released</Badge>
                  ) : (
                    <>
                      <Badge tone="danger" dot>Held</Badge>
                      <span className="text-muted-foreground">
                        {jobPayment === "DISPUTED" || (job !== "error" && job?.displayStatus === "disputed")
                          ? "Held while the complaint is open"
                          : "Release in progress"}
                      </span>
                    </>
                  )}
                </div>
              )}
            </DrawerSection>
            {open.canRetryTransfer && (
              <p className="rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
                This payout did not reach the provider. Retrying sends it to their linked payout account.
              </p>
            )}
          </>
        )}
      </ReviewDrawer>
    </div>
  );
});

/**
 * Read-only wallet history from before per-job card payments — top-ups,
 * withdrawals, and the payout/refund rows escrow wrote. Distinct data source
 * from the Escrow tab. Nothing can be issued or changed from here.
 */
const WalletTab = forwardRef<ExportHandle, TabProps>(function WalletTab({ onExportCountChange, onRequestExport }, ref) {
  const { settings } = useApp();
  const anonymizeExports = settings.anonymizeExports;
  const [rows, setRows] = useState<WalletTxnRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- fetching page-local data */
    setLoading(true);
    setError(false);
    void services
      .searchWalletTransactions({ search: debouncedSearch, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!cancelled) {
          setRows(result.items.map(toWalletTxnRow));
          setTotalCount(result.total);
          setSearchError(null);
          const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
          if (page > lastPage) setPage(lastPage);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const badSearch = searchErrorMessage(err);
        if (badSearch) {
          setSearchError(badSearch);
        } else {
          // Keep the last good rows and total; the banner says they may be stale.
          setError(true);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [debouncedSearch, page, reloadKey]);

  const searchPending = search !== debouncedSearch;
  const walletBusy = loading || searchPending;
  const visibleRows = walletBusy ? [] : rows;
  const sel = useSelection(visibleRows.map((r) => r.id));

  function clearSelectionOnScopeChange() {
    sel.clear();
    setPage(1);
  }

  /** Exports checked rows or every row on the current page. */
  const exportScope = sel.selected.size > 0 ? visibleRows.filter((r) => sel.selected.has(r.id)) : visibleRows;
  const exportUnavailable = walletBusy || error;

  useImperativeHandle(
    ref,
    () => ({
      exportCsv: () => {
        if (exportUnavailable) return;
        const mask = exportMasks(anonymizeExports);
        const csv = toCsv(
          ["ID", "User", "Kind", "Amount", "Status", "Title", "Date"],
          exportScope.map((r) => [r.id, mask.name(r.profileName), r.kindLabel, r.amountValue, r.statusLabel, r.title, r.createdAt]),
        );
        downloadCsv(datedFilename("taskbuddy-payment-records"), csv);
      },
    }),
    [exportScope, exportUnavailable, anonymizeExports],
  );
  useEffect(() => {
    onExportCountChange({
      total: exportUnavailable ? 0 : visibleRows.length,
      selected: exportUnavailable ? 0 : sel.selected.size,
    });
  }, [visibleRows.length, sel.selected.size, exportUnavailable, onExportCountChange]);

  const totalTopups = visibleRows.filter((r) => r.direction === "credit").reduce((s, r) => s + r.amountValue, 0);
  const totalWithdrawals = visibleRows.filter((r) => r.direction === "debit").reduce((s, r) => s + r.amountValue, 0);

  const columns: Column<WalletTxnRow>[] = [
    { id: "user", header: "User", cell: (r) => <span className="font-medium">{r.profileName}</span> },
    { id: "kind", header: "Type", cell: (r) => <Badge tone={toneFromBadgeClass(r.kindClass)}>{r.kindLabel}</Badge> },
    { id: "title", header: "Description", hideBelow: "md", cell: (r) => <span className="text-muted-foreground">{r.title}</span> },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (r) => (
        <span className={cn("inline-flex items-center gap-1 tabular font-semibold", r.direction === "credit" ? "text-ok" : "text-foreground")}>
          {r.direction === "credit" ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5 text-muted-foreground" />}
          {r.amount}
        </span>
      ),
    },
    { id: "status", header: "Status", cell: (r) => <Badge tone={toneFromBadgeClass(r.statusClass)}>{r.statusLabel}</Badge> },
    { id: "date", header: "Date", hideBelow: "md", cell: (r) => <span className="tabular text-muted-foreground">{r.createdAt}</span> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <SummaryStrip
          items={[
            { icon: Receipt, label: "rows on this page", value: visibleRows.length.toLocaleString() },
            { icon: ArrowDownLeft, label: "credits on this page", value: `₱${totalTopups.toLocaleString()}` },
            { icon: ArrowUpRight, label: "debits on this page", value: `₱${totalWithdrawals.toLocaleString()}` },
          ]}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { sel.clear(); setReloadKey((key) => key + 1); }} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      <TableCard
        toolbar={
          <SearchField
            className="w-full sm:w-72"
            value={search}
            onChange={(v) => {
              setSearch(v);
              clearSelectionOnScopeChange();
            }}
            placeholder="Search by user or description…"
            label="Search payment records"
            maxLength={100}
            error={searchError}
          />
        }
      >
        {error && !walletBusy && visibleRows.length > 0 && (
          <RefreshFailedBanner noun="payment records" onRetry={() => setReloadKey((key) => key + 1)} />
        )}
        <DataTable
          label="Payment records table"
          columns={columns}
          rows={visibleRows}
          getRowId={(r) => r.id}
          minWidth={620}
          selection={{
            selected: sel.selected,
            onToggle: sel.toggleOne,
            onToggleAll: sel.toggleAll,
            allSelected: sel.allSelected,
            rowLabel: (id) => `Select payment row ${id}`,
            allLabel: "Select all payment rows on this page",
            disabledAll: totalCount === 0,
          }}
          empty={
            walletBusy ? (
              <TableEmpty>Loading payment records…</TableEmpty>
            ) : error ? (
              <LoadFailedState noun="payment records" onRetry={() => setReloadKey((key) => key + 1)} />
            ) : (
              <TableEmpty>No payment records found.</TableEmpty>
            )
          }
        />
        {!walletBusy && (!error || visibleRows.length > 0) && <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={(nextPage) => {
            sel.setSelected(new Set());
            setPage(nextPage);
          }}
          itemLabel="payment rows"
        />}
        {walletBusy && <div role="status" aria-live="polite" className="sr-only">Loading payment records…</div>}
      </TableCard>

      <BulkBar count={exportUnavailable ? 0 : sel.selected.size} noun="row" onClear={() => sel.setSelected(new Set())}>
        <Button size="sm" variant="outline" onClick={onRequestExport} disabled={exportUnavailable}>
          <Download /> Export
        </Button>
      </BulkBar>
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

  const requestExport = () => setConfirmingExport(true);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Transactions"
        description="Money held in escrow for each job, and the payment records (client payments, provider payouts and refunds)."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={requestExport}
            disabled={exportCount === 0}
            title={exportInfo.selected > 0 ? "Download only the checked rows" : "Download the current page"}
          >
            <Download /> {exportInfo.selected > 0 ? `Export ${exportInfo.selected} selected` : "Export current page"}
          </Button>
        }
      />

      <div className="mb-4">
        <FilterTabs
          id="transactions-tab"
          label="Transaction type"
          value={tab}
          onChange={setTab}
          options={[
            { value: "escrow", label: "Escrow" },
            { value: "wallet", label: "Payment records" },
          ]}
        />
      </div>

      {tab === "escrow" ? (
        <EscrowTab ref={escrowRef} onExportCountChange={setExportInfo} onRequestExport={requestExport} />
      ) : (
        <WalletTab ref={walletRef} onExportCountChange={setExportInfo} onRequestExport={requestExport} />
      )}

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message={`This downloads ${exportCount} row${exportCount === 1 ? "" : "s"} from the current ${tab === "escrow" ? "Escrow" : "Payment records"} page as a .csv file to your device.`}
        confirmLabel="Export"
        onConfirm={handleExport}
        onCancel={() => setConfirmingExport(false)}
      />
    </div>
  );
}
