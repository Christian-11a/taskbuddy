"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, CalendarRange, CheckCircle2, Download, Printer, Star, Wallet, XCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/adapters";
import { downloadCsv } from "@/lib/export/csv";
import {
  RATING_UNAVAILABLE,
  buildPlatformReport,
  buildProviderReport,
  type BreakdownRow,
  type ReportFilters,
} from "@/lib/reports/build";
import { platformReportCsv, providerReportCsv } from "@/lib/reports/exportReport";
import { periodFor, readReportQuery, serializeReportQuery } from "@/lib/reports/query";
import type { ReportBooking, ReportEscrow, ReportProviderOption, ReportQuery, ReportStatus } from "@/lib/reports/types";
import { monthLabel, toChartSeries } from "@/lib/services/monthSeries";
import * as services from "@/lib/services";
import type { ServiceCategory } from "@/lib/domain";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Panel } from "@/components/admin/Panel";
import { FilterTabs, SearchField } from "@/components/admin/queue";
import { KpiCard } from "@/components/admin/KpiCard";
import { SelectFilter } from "@/components/admin/table";
import { ReportPrintView, platformPrintSections, providerPrintSections } from "./ReportPrintView";

const TrendChart = dynamic(() => import("@/components/admin/charts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="w-full" style={{ height: 260 }} />,
});
const BarTrend = dynamic(() => import("@/components/admin/charts").then((m) => m.BarTrend), {
  ssr: false,
  loading: () => <Skeleton className="w-full" style={{ height: 240 }} />,
});
const DonutChart = dynamic(() => import("@/components/admin/charts").then((m) => m.DonutChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[168px] w-full" />,
});

const STATUS_LABEL: Record<ReportStatus, string> = {
  all: "All",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Disputed",
};

interface Loaded {
  bookings: ReportBooking[];
  escrows: ReportEscrow[];
  categories: ServiceCategory[];
  providers: ReportProviderOption[];
}

function categoryShares(rows: BreakdownRow[]): { label: string; value: number }[] {
  const total = rows.reduce((sum, row) => sum + row.bookings, 0);
  if (total <= 0) return [];
  return rows
    .filter((row) => row.bookings > 0)
    .map((row) => ({ label: row.label, value: Math.round((row.bookings / total) * 1000) / 10 }));
}

function MoneyTable({ rows, first, months }: { rows: BreakdownRow[]; first: string; months?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="text-[11.5px] text-muted-foreground">
            {[first, "Bookings", "Gross released", "Commission", "Payouts", "Refunds"].map((header) => (
              <th key={header} scope="col" className="px-5 py-2 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-6 text-muted-foreground">No rows in this period.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="px-5 py-2">{months ? monthLabel(row.label, true) : row.label}</td>
                <td className="px-5 py-2 tabular">{row.bookings.toLocaleString("en-PH")}</td>
                <td className="px-5 py-2 tabular">{formatCurrency(row.grossReleased)}</td>
                <td className="px-5 py-2 tabular">{formatCurrency(row.commission)}</td>
                <td className="px-5 py-2 tabular">{formatCurrency(row.providerPayouts)}</td>
                <td className="px-5 py-2 tabular">{formatCurrency(row.refunds)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage() {
  const { settings, adminProfile } = useApp();
  const [query, setQuery] = useState<ReportQuery>(() => readReportQuery(""));
  const [booted, setBooted] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmingExport, setConfirmingExport] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");

  useEffect(() => {
    const next = readReportQuery(window.location.search);
    const period = periodFor(next.preset, next.from, next.to, new Date());
    window.history.replaceState(null, "", `${window.location.pathname}?${serializeReportQuery(next, period)}`);
    setQuery(next);
    setBooted(true);
    const onPop = () => setQuery(readReportQuery(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!booted) return;
    let stale = false;
    setError(null);
    const categoryId = query.category === "all" ? undefined : Number(query.category);
    Promise.all([
      services.getReportBookings({
        status: query.status === "all" ? undefined : query.status,
        categoryId: categoryId != null && Number.isFinite(categoryId) ? categoryId : undefined,
      }),
      services.getReportEscrows(),
      services.getCategories(),
      services.getUsers(),
    ])
      .then(([bookings, escrows, categories, users]) => {
        if (stale) return;
        setLoaded({
          bookings,
          escrows,
          categories,
          providers: users
            .filter((user) => user.role === "provider")
            .map((user) => ({ id: user.id, name: user.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        });
      })
      .catch((err: unknown) => {
        if (stale) return;
        setError(err instanceof Error ? err.message : "The report could not be loaded.");
      });
    return () => {
      stale = true;
    };
  }, [booted, query.status, query.category, reloadKey]);

  const period = periodFor(query.preset, query.from, query.to, new Date());

  function update(patch: Partial<ReportQuery>) {
    const next = { ...query, ...patch };
    const nextPeriod = periodFor(next.preset, next.from, next.to, new Date());
    window.history.replaceState(null, "", `${window.location.pathname}?${serializeReportQuery(next, nextPeriod)}`);
    setQuery(next);
  }

  const filters = useMemo<ReportFilters>(() => {
    const category = loaded?.categories.find((item) => String(item.id) === query.category);
    const categoryId = query.category === "all" ? null : Number(query.category);
    return {
      from: period.from,
      to: period.to,
      status: query.status,
      categoryId: categoryId != null && Number.isFinite(categoryId) ? categoryId : null,
      categoryName: category?.name ?? null,
      providerId: query.providerId || null,
    };
  }, [loaded?.categories, period.from, period.to, query.category, query.providerId, query.status]);

  const selectedProvider = loaded?.providers.find((provider) => provider.id === query.providerId) ?? null;
  const platform = loaded ? buildPlatformReport(loaded.bookings, loaded.escrows, filters) : null;
  const providerReport = loaded ? buildProviderReport(loaded.bookings, loaded.escrows, filters, selectedProvider) : null;

  const periodLabel = `${formatDate(period.from)} – ${formatDate(period.to)}`;
  const categoryLabel = filters.categoryName ?? "All categories";
  const filtersLabel = `Status: ${STATUS_LABEL[query.status]}. Category: ${categoryLabel}.`;
  const generatedLabel = `Generated ${formatDate(new Date().toISOString())} by ${adminProfile?.name || "Admin"}`;
  const printTitle = query.tab === "platform"
    ? "Platform report"
    : `Provider report${selectedProvider ? `: ${selectedProvider.name}` : ""}`;

  function exportCsv() {
    if (!platform || !providerReport) return;
    const anonymize = settings?.anonymizeExports ?? false;
    const file = query.tab === "platform"
      ? platformReportCsv(platform, period.from, period.to)
      : providerReportCsv(providerReport, period.from, period.to, anonymize);
    downloadCsv(file.filename, file.csv);
  }

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      eyebrow="Records"
      title="Reports"
      description="Platform and provider reports for a period, a service category, and a job status."
      actions={actions}
    />
  );

  if (!loaded && !error) {
    return (
      <div aria-busy="true" aria-label="Loading reports…">
        {header()}
        <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-[12px]" />
          ))}
        </div>
        <Skeleton className="h-[340px] rounded-[12px]" />
      </div>
    );
  }

  if (!loaded && error) {
    return (
      <div>
        {header()}
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3.5 text-[13px]">
          <AlertTriangle className="size-4 shrink-0 text-warn" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => setReloadKey((n) => n + 1)}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!loaded || !platform || !providerReport) return null;

  const shares = categoryShares(platform.byCategory);
  const shareTotal = platform.byCategory.reduce((sum, row) => sum + row.bookings, 0);
  const visibleProviders = loaded.providers.filter((provider) =>
    provider.name.toLowerCase().includes(providerSearch.trim().toLowerCase()),
  ).slice(0, 8);

  const print = query.tab === "platform" ? platformPrintSections(platform) : providerPrintSections(providerReport);

  return (
    <div>
      <div className="report-screen">
        {error && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-[13px]">
            <AlertTriangle className="size-4 shrink-0 text-warn" />
            <span className="flex-1">{error} The figures below are the last ones that loaded.</span>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((n) => n + 1)}>Retry</Button>
          </div>
        )}
        {header(
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmingExport(true)}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer /> Download PDF
            </Button>
          </>,
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterTabs
            id="reports-tab"
            label="Report type"
            value={query.tab}
            onChange={(tab) => update({ tab })}
            options={[
              { value: "platform", label: "Platform" },
              { value: "provider", label: "Provider" },
            ]}
          />
          <FilterTabs
            id="reports-range"
            label="Date range"
            value={query.preset}
            onChange={(preset) => {
              const next = periodFor(preset, query.from, query.to, new Date());
              update({ preset, from: next.from, to: next.to });
            }}
            options={[
              { value: "this", label: "This month" },
              { value: "3", label: "Last 3 months" },
              { value: "6", label: "Last 6 months" },
              { value: "12", label: "Last 12 months" },
              { value: "custom", label: "Custom" },
            ]}
          />
          <FilterTabs
            id="reports-status"
            label="Status"
            value={query.status}
            onChange={(status) => update({ status })}
            options={[
              { value: "all", label: "All" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
              { value: "disputed", label: "Disputed" },
            ]}
          />
          <SelectFilter label="Service category" value={query.category} onChange={(category) => update({ category })}>
            <option value="all">All categories</option>
            {loaded.categories.map((category) => (
              <option key={category.id} value={String(category.id)}>{category.name}</option>
            ))}
          </SelectFilter>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-subtle" htmlFor="report-from">
            From
            <input
              id="report-from"
              type="date"
              value={period.from}
              onChange={(e) => {
                if (e.target.value) update({ preset: "custom", from: e.target.value, to: period.to });
              }}
              className="h-8 rounded-[8px] border border-input bg-surface px-2.5 text-[12.5px] font-normal text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-subtle" htmlFor="report-to">
            To
            <input
              id="report-to"
              type="date"
              value={period.to}
              onChange={(e) => {
                if (e.target.value) update({ preset: "custom", from: period.from, to: e.target.value });
              }}
              className="h-8 rounded-[8px] border border-input bg-surface px-2.5 text-[12.5px] font-normal text-foreground"
            />
          </label>
          <p className="pb-1.5 text-[12.5px] text-muted-foreground">{periodLabel}. {filtersLabel}</p>
        </div>

        {query.tab === "provider" && (
          <Panel title="Provider" description="Search by name, then pick one provider. Figures below are only theirs." className="mb-4">
            <SearchField label="Search providers" value={providerSearch} onChange={setProviderSearch} placeholder="Search by name" />
            {selectedProvider && <p className="mt-3 text-[13px]">Showing {selectedProvider.name}</p>}
            {visibleProviders.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-muted-foreground">No matching provider.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {visibleProviders.map((provider) => (
                  <li key={provider.id}>
                    <Button
                      size="sm"
                      variant={provider.id === query.providerId ? "secondary" : "outline"}
                      aria-pressed={provider.id === query.providerId}
                      onClick={() => update({ providerId: provider.id })}
                    >
                      {provider.name}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {!selectedProvider && <p className="mt-3 text-[12.5px] text-muted-foreground">Choose a provider to see their jobs.</p>}
          </Panel>
        )}

        {query.tab === "platform" ? (
          <>
            <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Bookings" icon={<CalendarRange />} value={platform.bookings} />
              <KpiCard label="Completed" icon={<CheckCircle2 />} value={platform.completed} />
              <KpiCard label="Cancelled" icon={<XCircle />} value={platform.cancelled} />
              <KpiCard label="Disputed" icon={<AlertTriangle />} value={platform.disputed} />
              <KpiCard label="Gross released payments" icon={<Wallet />} value={platform.money.grossReleased} format={formatCurrencyCompact} />
              <KpiCard label="TaskBuddy commission" icon={<Wallet />} value={platform.money.commission} format={formatCurrency} />
              <KpiCard label="Provider payouts" icon={<Wallet />} value={platform.money.providerPayouts} format={formatCurrency} />
              <KpiCard label="Refunds" icon={<Wallet />} value={platform.money.refunds} format={formatCurrency} />
            </div>
            <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
              <Panel title="Released payments" description={`${formatCurrency(platform.money.grossReleased)} released in this period`}>
                {!platform.byMonth.some((row) => row.grossReleased > 0) ? (
                  <div className="grid h-[260px] place-items-center text-center text-[12.5px] text-muted-foreground">No released payments in this period.</div>
                ) : (
                  <TrendChart data={toChartSeries(platform.byMonth.map((row) => ({ month: row.label, value: row.grossReleased })))} format={formatCurrency} yFormat={formatCurrencyCompact} height={260} />
                )}
              </Panel>
              <Panel title="Service categories" description="Share of bookings in this period">
                {shares.length === 0 ? (
                  <div className="grid h-[240px] place-items-center text-[12.5px] text-muted-foreground">No bookings in this period.</div>
                ) : (
                  <DonutChart data={shares} centerLabel="bookings" centerValue={shareTotal} />
                )}
              </Panel>
            </div>
            <Panel title="Monthly bookings" description={`${platform.bookings.toLocaleString("en-PH")} bookings in this period`} className="mb-4">
              <BarTrend data={toChartSeries(platform.byMonth.map((row) => ({ month: row.label, value: row.bookings })))} format={(n) => `${n} bookings`} color="var(--ui-chart-2)" height={240} />
            </Panel>
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="By service category" bodyClassName="px-0 pb-2">
                <MoneyTable rows={platform.byCategory} first="Category" />
              </Panel>
              <Panel title="By month" bodyClassName="px-0 pb-2">
                <MoneyTable rows={platform.byMonth} first="Month" months />
              </Panel>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Jobs" icon={<CalendarRange />} value={providerReport.jobs} />
              <KpiCard label="Completed" icon={<CheckCircle2 />} value={providerReport.completed} />
              <KpiCard label="Cancelled" icon={<XCircle />} value={providerReport.cancelled} />
              <KpiCard label="Disputed" icon={<AlertTriangle />} value={providerReport.disputed} />
              <KpiCard label="Gross earned" icon={<Wallet />} value={providerReport.grossEarned} format={formatCurrency} />
              <KpiCard label="Platform fee" icon={<Wallet />} value={providerReport.platformFee} format={formatCurrency} />
              <KpiCard label="Net received" icon={<Wallet />} value={providerReport.netReceived} format={formatCurrency} />
              <div className="flex min-w-0 flex-col rounded-[12px] border border-border bg-surface p-4 shadow-ui-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-muted-foreground">Average rating</span>
                  <span className="grid size-7 place-items-center rounded-[8px] bg-primary-soft text-primary" aria-hidden="true"><Star className="size-3.5" /></span>
                </div>
                <div className="mt-2 text-[22px] font-semibold leading-none tracking-tight">{RATING_UNAVAILABLE}</div>
                <p className="mt-2 text-[12px] text-subtle">The console has no per-job ratings, so this cannot follow the period.</p>
              </div>
            </div>
            <Panel title="Jobs in the period" description="Date posted, the client, the service, the payment, the fee, and the status." bodyClassName="px-0 pb-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="text-[11.5px] text-muted-foreground">
                      {["Date", "Client", "Service", "Amount", "Fee", "Status"].map((header) => (
                        <th key={header} scope="col" className="px-5 py-2 font-medium">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {providerReport.jobRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-muted-foreground">No jobs in this period.</td>
                      </tr>
                    ) : (
                      providerReport.jobRows.map((row) => (
                        <tr key={row.id} className="border-t border-border">
                          <td className="px-5 py-2">{formatDate(row.date)}</td>
                          <td className="px-5 py-2">{row.client}</td>
                          <td className="px-5 py-2">{row.service}</td>
                          <td className="px-5 py-2 tabular">{formatCurrency(row.amount)}</td>
                          <td className="px-5 py-2 tabular">{formatCurrency(row.fee)}</td>
                          <td className="px-5 py-2">{row.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}

        <ConfirmDialog
          open={confirmingExport}
          danger={false}
          title="Export to CSV?"
          message={`This downloads the ${query.tab === "platform" ? "platform" : "provider"} report for ${periodLabel} as one .csv file.`}
          confirmLabel="Export"
          onConfirm={() => {
            setConfirmingExport(false);
            exportCsv();
          }}
          onCancel={() => setConfirmingExport(false)}
        />
      </div>

      <ReportPrintView
        title={printTitle}
        periodLabel={periodLabel}
        filtersLabel={filtersLabel}
        generatedLabel={generatedLabel}
        totals={print.totals}
        sections={print.sections}
      />
    </div>
  );
}
