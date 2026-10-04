"use client";

import { useState } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, Download, Star, TrendingUp, Wallet } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatCurrencyCompact } from "@/lib/adapters";
import { exportMasks } from "@/lib/export/anonymize";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Panel } from "@/components/admin/Panel";
import { Avatar, FilterTabs, initialsOf } from "@/components/admin/queue";
import { BarList, BarTrend, DonutChart, ProgressRing, TrendChart } from "@/components/admin/charts";
import { Delta, KpiCard, monthOverMonth } from "@/components/admin/KpiCard";
import { AnalyticsSourceNote } from "@/components/admin/AnalyticsSourceNote";

type Range = "3" | "6" | "12";

export function ReportsPage() {
  const {
    dashboardStats,
    revenueSeries,
    bookingsSeries,
    bookingsByCategory,
    topProviders,
    loading,
    analyticsUnavailable,
    analyticsInBrowser,
    retryLoad,
    settings,
  } = useApp();
  const [confirmingExport, setConfirmingExport] = useState(false);
  // Only narrows what the charts show — the series already arrive from the server.
  const [range, setRange] = useState<Range>("12");

  const header = (actions?: React.ReactNode) => (
    <PageHeader
      eyebrow="Records"
      title="Reports"
      description="How the marketplace is performing: money, bookings, services and the providers doing the work."
      actions={actions}
    />
  );

  if (loading) {
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

  if (analyticsUnavailable || !dashboardStats) {
    return (
      <div>
        {header()}
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3.5 text-[13px]">
          <AlertTriangle className="size-4 shrink-0 text-warn" />
          <span className="flex-1">
            {analyticsUnavailable
              ? "Analytics are temporarily unavailable. No report values or charts are shown as zero while the data request is failing."
              : "Report data could not be loaded. Retry or check the console error above."}
          </span>
          <Button size="sm" variant="outline" onClick={retryLoad}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Captured after the null guard above so the export closure keeps the narrowing.
  const stats = dashboardStats;
  const months = Number(range);
  const revenueInRange = revenueSeries.slice(-months);
  const bookingsInRange = bookingsSeries.slice(-months);
  const revenueTotalInRange = revenueInRange.reduce((s, r) => s + r.value, 0);
  const bookingsTotalInRange = bookingsInRange.reduce((s, r) => s + r.value, 0);
  const categoryTotal = bookingsByCategory.reduce((s, c) => s + c.value, 0);

  /**
   * One CSV covering every section on this page. A dashboard mixes several
   * unrelated tables, so each is emitted as its own labelled block rather than
   * forcing them into one incompatible header row.
   */
  function exportCsv() {
    const mask = exportMasks(settings.anonymizeExports);
    const blocks = [
      toCsv(["Metric", "Value"], [
        ["Total revenue", stats.totalRevenue],
        ["Revenue this month", stats.monthlyRevenue],
        ["Completion rate (%)", stats.completionRate],
        ["Average provider rating", stats.avgRating],
        ["Total users", stats.totalUsers],
        ["Active providers", stats.activeProviders],
        ["Total bookings", stats.totalBookings],
      ]),
      toCsv(["Month", "Revenue"], revenueSeries.map((r) => [r.month, r.value])),
      toCsv(["Month", "Bookings"], bookingsSeries.map((b) => [b.month, b.value])),
      toCsv(["Category", "Share (%)"], bookingsByCategory.map((c) => [c.label, c.value])),
      toCsv(["Provider", "Completed jobs", "Rating"], topProviders.map((p) => [mask.name(p.name), p.jobs, p.rating])),
    ];
    const labels = ["SUMMARY", "REVENUE TREND", "MONTHLY BOOKINGS", "BOOKINGS BY CATEGORY", "TOP PROVIDERS"];
    const csv = blocks.map((b, i) => `${labels[i]}\r\n${b}`).join("\r\n\r\n");
    downloadCsv(datedFilename("taskbuddy-analytics"), csv);
  }

  return (
    <div>
      {header(
        <>
          <FilterTabs
            id="reports-range"
            label="Chart range"
            value={range}
            onChange={setRange}
            options={[
              { value: "3", label: "3M" },
              { value: "6", label: "6M" },
              { value: "12", label: "12M" },
            ]}
          />
          <Button variant="outline" size="sm" onClick={() => setConfirmingExport(true)} title="Download every section on this page as one CSV">
            <Download /> Export CSV
          </Button>
        </>,
      )}

      {analyticsInBrowser && <AnalyticsSourceNote />}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total revenue" icon={<Wallet />} value={stats.totalRevenue} format={formatCurrencyCompact} footer={<span className="text-muted-foreground">All-time gross merchandise value</span>} />
        <KpiCard
          label="Revenue this month"
          icon={<TrendingUp />}
          value={stats.monthlyRevenue}
          format={formatCurrency}
          trend={revenueSeries.map((r) => r.value)}
          footer={<Delta value={monthOverMonth(revenueSeries)} />}
        />
        <Panel bodyClassName="flex items-center gap-4 pt-4">
          <ProgressRing value={stats.completionRate} size={64} stroke={7} label={`${stats.completionRate}%`} />
          <div>
            <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <CheckCircle2 className="size-3.5" /> Completion rate
            </div>
            <div className="mt-1 text-[12px] text-subtle">Share of accepted jobs that finished</div>
          </div>
        </Panel>
        <Panel bodyClassName="pt-4">
          <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Star className="size-3.5" /> Avg provider rating
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="tabular text-[28px] font-semibold leading-none tracking-tight">{stats.avgRating}</span>
            <span className="mb-0.5 flex text-warn" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={i < Math.round(stats.avgRating) ? "size-3.5 fill-current" : "size-3.5 opacity-25"} />
              ))}
            </span>
          </div>
          <div className="mt-2 text-[12px] text-subtle">Across {stats.activeProviders.toLocaleString()} active providers</div>
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <Panel
          title="Revenue trend"
          description={`Gross merchandise value per month · ${formatCurrency(revenueTotalInRange)} over ${months} months`}
          action={<CalendarRange className="size-4 text-subtle" />}
        >
          {revenueInRange.length === 0 ? (
            <div className="grid h-[260px] place-items-center text-center text-[12.5px] text-muted-foreground">
              No revenue yet — this fills in once a job&apos;s escrow is released to a provider.
            </div>
          ) : (
            <TrendChart data={revenueInRange} format={formatCurrency} yFormat={formatCurrencyCompact} height={260} />
          )}
        </Panel>
        <Panel title="Service categories" description="Share of all bookings">
          {bookingsByCategory.length === 0 ? (
            <div className="grid h-[240px] place-items-center text-[12.5px] text-muted-foreground">No bookings yet.</div>
          ) : (
            <DonutChart data={bookingsByCategory} centerLabel="categories" centerValue={bookingsByCategory.length} />
          )}
          {categoryTotal > 0 && categoryTotal !== 100 && (
            <p className="mt-2 text-[11.5px] text-subtle">Shares are rounded, so they may not add up to exactly 100%.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <Panel title="Monthly bookings" description={`${bookingsTotalInRange.toLocaleString()} bookings over ${months} months`}>
          <BarTrend data={bookingsInRange} format={(n) => `${n} bookings`} color="var(--ui-chart-2)" height={240} />
        </Panel>
        <Panel title="Top providers" description="By completed jobs">
          {topProviders.length === 0 ? (
            <div className="grid h-[200px] place-items-center text-[12.5px] text-muted-foreground">No completed jobs yet.</div>
          ) : (
            <BarList
              items={topProviders.map((p, i) => ({
                label: (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-right tabular text-[11px] text-subtle">{i + 1}</span>
                    <Avatar initials={initialsOf(p.name)} tone={i === 0 ? "warn" : "neutral"} />
                    <span className="truncate">{p.name}</span>
                  </span>
                ),
                value: p.jobs,
                hint: (
                  <span className="inline-flex items-center gap-0.5">
                    {p.rating} <Star className="size-3 fill-current text-warn" />
                  </span>
                ),
              }))}
              format={(n) => `${n} jobs`}
            />
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message="This downloads every section on this page — summary, revenue trend, monthly bookings, categories, and top providers — as one .csv file to your device."
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
