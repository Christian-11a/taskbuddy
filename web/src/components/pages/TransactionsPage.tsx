"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Gift, Landmark, Lock, PanelRightOpen, Receipt, RefreshCw, ShieldAlert } from "lucide-react";
import * as services from "@/lib/services";
import { useApp } from "@/context/AppContext";
import { toTransactionRow, toWalletTxnRow, type TransactionRow, type WalletTxnRow } from "@/lib/adapters";
import { exportMasks } from "@/lib/export/anonymize";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { RECOVERY_CREDIT_MAX_AMOUNT, RECOVERY_CREDIT_TITLE_MAX_LENGTH, validateRecoveryCreditAmount } from "@/lib/validation";
import { ApiError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReviewDrawer, DrawerField, DrawerSection } from "@/components/ui/ReviewDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/Panel";
import { FilterTabs, SearchField } from "@/components/admin/queue";
import { BulkBar, DataTable, SummaryStrip, TableCard, TableEmpty, type Column } from "@/components/admin/table";
import { toneFromBadgeClass } from "@/components/admin/tones";
import { useLiveTick } from "@/hooks/useLiveTick";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

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
  const [reloadKey, setReloadKey] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const { showToast } = useToast();
  const sel = useSelection(transactions.map((t) => t.id));

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
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransactions([]);
          setTotalCount(0);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [debouncedSearch, statusFilter, page, reloadKey]);

  useLiveTick(() => setReloadKey((k) => k + 1));

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
        ) : null,
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
            <TableEmpty>
              {loading
                ? "Loading transactions…"
                : totalCount === 0 && statusFilter === "all" && !search.trim()
                  ? "No escrow transactions yet."
                  : "No transactions match this search or filter."}
            </TableEmpty>
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
                {retryingId === open.id ? "Retrying…" : "Retry transfer"}
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
                  value={open.payout ? <Badge tone={toneFromBadgeClass(open.payoutClass)}>{open.payout}</Badge> : "—"}
                />
                {open.payoutDetail && <DrawerField label="Stripe" value={<span className="break-all">{open.payoutDetail}</span>} />}
              </div>
            </DrawerSection>
            {open.canRetryTransfer && (
              <p className="rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
                The payout is in the provider&apos;s wallet. Retrying sends it to their Stripe account.
              </p>
            )}
          </>
        )}
      </ReviewDrawer>
    </div>
  );
});

/**
 * The wallet ledger — top-ups, withdrawals, and the payout/refund rows escrow
 * itself writes. Distinct data source from the Escrow tab: escrow is money
 * held for one job, this is a user's running balance.
 */
const WalletTab = forwardRef<ExportHandle, TabProps>(function WalletTab({ onExportCountChange, onRequestExport }, ref) {
  const { users, settings } = useApp();
  const anonymizeExports = settings.anonymizeExports;
  const { showToast } = useToast();
  const [rows, setRows] = useState<WalletTxnRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 250);

  // Issue Credit form state.
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
          const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
          if (page > lastPage) setPage(lastPage);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setTotalCount(0);
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [debouncedSearch, page, reloadKey]);

  const searchPending = search !== debouncedSearch;
  const walletBusy = loading || searchPending;
  const visibleRows = walletBusy || error ? [] : rows;
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
          ["ID", "User", "Kind", "Amount", "Title", "Date"],
          exportScope.map((r) => [r.id, mask.name(r.profileName), r.kindLabel, r.amountValue, r.title, r.createdAt]),
        );
        downloadCsv(datedFilename("taskbuddy-wallet-transactions"), csv);
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

  // Recipient search over the users already loaded app-wide — there's no
  // dedicated "search users" endpoint. Capped to 6 so a common name doesn't
  // dump the whole user base into a dropdown.
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
    !!creditProfileId && creditAmount.trim().length > 0 && !creditAmountError && creditTitle.trim().length > 0 && !creditTitleTooLong;

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
      sel.clear();
      setReloadKey((key) => key + 1);
      showToast("Recovery credit issued.");
      closeCreditDialog();
    } catch (err) {
      // Surfaced verbatim: the backend's refusal messages are specific enough to act on.
      setCreditError(err instanceof ApiError ? err.message : "Unable to issue credit. Please try again.");
    } finally {
      setCreditBusy(false);
    }
  }

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
    { id: "date", header: "Date", hideBelow: "md", cell: (r) => <span className="tabular text-muted-foreground">{r.createdAt}</span> },
  ];

  const labelClass = "mb-1.5 block text-[12px] font-medium text-foreground";

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
          <Button size="sm" onClick={() => setIssuingCredit(true)}>
            <Gift /> Issue Credit
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
            label="Search wallet activity"
          />
        }
      >
        <DataTable
          label="Wallet activity table"
          columns={columns}
          rows={visibleRows}
          getRowId={(r) => r.id}
          minWidth={620}
          selection={{
            selected: sel.selected,
            onToggle: sel.toggleOne,
            onToggleAll: sel.toggleAll,
            allSelected: sel.allSelected,
            rowLabel: (id) => `Select wallet row ${id}`,
            allLabel: "Select all wallet rows on this page",
            disabledAll: totalCount === 0,
          }}
          empty={walletBusy ? <TableEmpty>Loading wallet activity…</TableEmpty> : error ? <TableEmpty><span className="text-danger">Could not load wallet activity.</span> <Button size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>Try again</Button></TableEmpty> : <TableEmpty>No wallet activity found.</TableEmpty>}
        />
        {!walletBusy && !error && <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={totalCount}
          onPageChange={(nextPage) => {
            sel.setSelected(new Set());
            setPage(nextPage);
          }}
          itemLabel="wallet rows"
        />}
        {walletBusy && <div role="status" aria-live="polite" className="sr-only">Loading wallet activity…</div>}
      </TableCard>

      <BulkBar count={exportUnavailable ? 0 : sel.selected.size} noun="row" onClear={() => sel.setSelected(new Set())}>
        <Button size="sm" variant="outline" onClick={onRequestExport} disabled={exportUnavailable}>
          <Download /> Export
        </Button>
      </BulkBar>

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
        <div className="flex flex-col gap-3.5">
          <div className="relative">
            <label className={labelClass}>Recipient</label>
            {selectedRecipient ? (
              <div className="flex items-center justify-between rounded-[8px] border border-input bg-surface-2 px-3 py-2 text-[12.5px]">
                <span>
                  <span className="font-medium">{selectedRecipient.name}</span>{" "}
                  <span className="text-muted-foreground">({selectedRecipient.email})</span>
                </span>
                <button
                  onClick={() => {
                    setCreditProfileId(null);
                    setCreditRecipientQuery("");
                  }}
                  className="text-[12px] font-medium text-primary hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <Input
                autoFocus
                placeholder="Search by name or email…"
                aria-label="Search recipient by name or email"
                value={creditRecipientQuery}
                onChange={(e) => setCreditRecipientQuery(e.target.value)}
              />
            )}
            {recipientMatches.length > 0 && (
              <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-[180px] overflow-y-auto rounded-[10px] border border-border bg-popover p-1 shadow-ui-lg">
                {recipientMatches.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCreditProfileId(u.id);
                      setCreditRecipientQuery("");
                    }}
                    className="block w-full rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] hover:bg-accent"
                  >
                    <span className="font-medium">{u.name}</span> <span className="text-muted-foreground">({u.email})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Amount (₱)</label>
            <Input
              type="number"
              min={0.01}
              max={RECOVERY_CREDIT_MAX_AMOUNT}
              step="0.01"
              placeholder="e.g. 500"
              aria-label="Credit amount in pesos"
              aria-invalid={!!creditAmountError || undefined}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
            {creditAmountError && <div className="mt-1 text-[11.5px] text-danger">{creditAmountError}</div>}
          </div>

          <div>
            <label className={labelClass}>
              Title <span className="font-normal text-muted-foreground">(shown to the recipient)</span>
            </label>
            <Input
              placeholder="e.g. Dispute resolution credit"
              aria-label="Credit title, shown to the recipient"
              aria-invalid={creditTitleTooLong || undefined}
              value={creditTitle}
              onChange={(e) => setCreditTitle(e.target.value)}
            />
            <div className={cn("mt-1 text-right text-[11px] tabular", creditTitleTooLong ? "text-danger" : "text-subtle")}>
              {creditTitle.length}/{RECOVERY_CREDIT_TITLE_MAX_LENGTH}
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Job ID <span className="font-normal text-muted-foreground">(optional — the dispute or job this compensates)</span>
            </label>
            <Input placeholder="Optional" aria-label="Related job ID (optional)" value={creditJobId} onChange={(e) => setCreditJobId(e.target.value)} />
          </div>

          {creditError && <div className="rounded-[8px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{creditError}</div>}
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

  const requestExport = () => setConfirmingExport(true);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Transactions"
        description="Money held in escrow for each job, and every wallet top-up, payout and withdrawal."
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
            { value: "wallet", label: "Wallet" },
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
        message={`This downloads ${exportCount} row${exportCount === 1 ? "" : "s"} from the current ${tab === "escrow" ? "Escrow" : "Wallet"} page as a .csv file to your device.`}
        confirmLabel="Export"
        onConfirm={handleExport}
        onCancel={() => setConfirmingExport(false)}
      />
    </div>
  );
}
