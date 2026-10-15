"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock, CreditCard, Percent, RotateCw, ShieldCheck,
  UserPlus, Users, WalletCards, Wrench,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import * as services from "@/lib/services";
import { formatCurrency, formatCurrencyCompact } from "@/lib/adapters";
import { AnalyticsSourceNote } from "@/components/admin/AnalyticsSourceNote";
import { pageToPath } from "@/lib/routes";
import type { ActivityEvent, DashboardStats, Page } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/admin/AnimatedNumber";
import { Delta, KpiCard, monthOverMonth } from "@/components/admin/KpiCard";
import { EmptyState, PageHeader, Panel } from "@/components/admin/Panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Recharts (~110 KB gzipped) loads after the tiles and text. The skeleton keeps the 220px chart height (see the TrendChart height below).
const TrendChart = dynamic(() => import("@/components/admin/charts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="w-full" style={{ height: 220 }} />,
});

/** Figures the shared context doesn't carry (its bookings/transactions are
 *  empty by design), loaded from the same endpoints their own pages use. */
interface LiveExtras {
  /** null = that request failed; shown as "—", never as a misleading zero. */
  escrowCount: number | null;
  escrowHeld: number | null;
  openJobs: number | null;
  matchingJobs: number | null;
}

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const ACTIVITY_ICON = {
  tx: { icon: CreditCard, tone: "bg-ok-soft text-ok" },
  user: { icon: UserPlus, tone: "bg-info-soft text-info" },
  alert: { icon: AlertTriangle, tone: "bg-warn-soft text-warn" },
} as const;

function useLiveExtras(lastUpdated: number | null, stats: DashboardStats | null): LiveExtras | null {
  const [extras, setExtras] = useState<LiveExtras | null>(null);
  const { escrowCount, escrowHeld, openJobs, matchingJobs } = stats ?? {};
  useEffect(() => {
    let cancelled = false;
    if (lastUpdated === null) return;
    // Current deployments include these totals in the shared summary. Only
    // older responses/browser fallback need the separate list requests.
    void Promise.allSettled([
      escrowCount !== undefined && escrowHeld !== undefined
        ? Promise.resolve({ count: escrowCount, total: escrowHeld }) : services.getEscrowHeld(),
      openJobs !== undefined && matchingJobs !== undefined
        ? Promise.resolve({ open: openJobs, recommending: matchingJobs }) : services.getBookingStatusCounts(),
    ]).then(([escrow, counts]) => {
      if (cancelled) return;
      setExtras({
        escrowCount: escrow.status === "fulfilled" ? escrow.value.count : null,
        escrowHeld: escrow.status === "fulfilled" ? escrow.value.total : null,
        openJobs: counts.status === "fulfilled" ? counts.value.open : null,
        matchingJobs: counts.status === "fulfilled" ? counts.value.recommending : null,
      });
    });
    return () => {
      cancelled = true;
    };
    // Re-runs after every live refresh of the shared data.
  }, [lastUpdated, escrowCount, escrowHeld, openJobs, matchingJobs]);
  return extras;
}

function AttentionTile({ href, icon: Icon, count, one, many, tone, index, loading = false }: {
  href: string;
  icon: typeof ShieldCheck;
  count: number | null;
  one: string;
  many: string;
  tone: "danger" | "warn" | "info" | "accent";
  index: number;
  /** The list or count behind this tile is still on its way: a placeholder, not a zero. */
  loading?: boolean;
}) {
  const reduce = useReducedMotion();
  // null = the count could not be loaded: neither a real zero nor the green "clear" check. A count still loading is neither.
  const unknown = !loading && count === null;
  const clear = !loading && count === 0;
  const toneClass = {
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
    accent: "bg-primary-soft text-primary",
  }[tone];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={href}
        className={cn(
          "group flex h-full items-center gap-3 rounded-[12px] border bg-surface p-3.5 shadow-ui-sm outline-none transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-ui-md focus-visible:ring-2 focus-visible:ring-ring",
          unknown ? "border-dashed border-border-strong" : clear ? "border-border" : "border-border-strong",
        )}
      >
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[9px] [&_svg]:size-4", clear || unknown || loading ? "bg-surface-2 text-subtle" : toneClass)}>
          {clear ? <CheckCircle2 aria-hidden="true" /> : <Icon aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[20px] font-semibold leading-none tracking-tight", (clear || unknown) && "text-subtle")}>
            {loading ? <Skeleton className="h-5 w-8" /> : count === null ? "—" : <AnimatedNumber value={count} />}
          </span>
          <span className="mt-1 block truncate text-[12px] text-muted-foreground">
            {unknown ? `${many} · could not be checked` : count === 1 ? one : many}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
      </Link>
    </motion.div>
  );
}

/** A headline metric whose figure is still loading: its label and icon are known, the figure is not. */
function KpiPlaceholder({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[12px] border border-border bg-surface p-4 shadow-ui-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
        <span className="grid size-7 place-items-center rounded-[8px] bg-primary-soft text-primary [&_svg]:size-3.5" aria-hidden="true">{icon}</span>
      </div>
      <Skeleton className="mt-3 h-7 w-28" />
      <Skeleton className="mt-4 h-3.5 w-36" />
    </div>
  );
}

function ActivityFeed({ items, loading = false }: { items: ActivityEvent[]; loading?: boolean }) {
  const reduce = useReducedMotion();
  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading recent activity" className="space-y-3 px-2 py-1">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={<Clock />} title="No recent activity" description="New bookings, payments and signups will appear here." />;
  }
  return (
    <ul className="-mx-2">
      <AnimatePresence initial={false}>
        {items.map((a) => {
          const { icon: Icon, tone } = ACTIVITY_ICON[a.type] ?? ACTIVITY_ICON.tx;
          return (
            <motion.li
              key={a.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-[8px] px-2 py-2 transition-colors hover:bg-accent">
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-[8px] [&_svg]:size-3.5", tone)} aria-hidden="true"><Icon /></span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{a.text}</span>
                <span className="shrink-0 text-[11.5px] tabular text-subtle">{a.time}</span>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

export function DashboardPage() {
  const {
    adminProfile, dashboardStats, recentActivity, disputes, users, usersLoading, ensureUsers, revenueSeries, bookingsSeries,
    analyticsUnavailable, analyticsInBrowser, analyticsLoading, disputesLoading, verificationsLoading, activityLoading,
    countsLoading, retryLoad, lastUpdated, queueCounts,
  } = useApp();
  // The new-signups tile counts the Users list, which loads behind the console. Read it here if it is more than 5 minutes old.
  useEffect(() => {
    ensureUsers({ maxAgeMs: 5 * 60_000 });
  }, [ensureUsers]);
  const extras = useLiveExtras(lastUpdated, dashboardStats);
  const now = new Date();
  const firstName = adminProfile.name.split(" ")[0] || "there";
  const dateLabel = now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const openDisputes = disputes.filter((d) => d.isOpen).length;
  const newUsersThisMonth = useMemo(
    () => users.filter((u) => {
      const d = new Date(u.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- month boundary is fine to evaluate per data change
    [users],
  );

  const header = (
    <PageHeader
      eyebrow={dateLabel}
      title={`${greeting(now)}, ${firstName}`}
      description="Marketplace activity, money in motion, and work waiting for review."
    />
  );

  // Analytics down (not merely loading): keep the console useful with what we have. While they load, the page shows placeholders.
  if (!analyticsLoading && (analyticsUnavailable || !dashboardStats)) {
    return (
      <div>
        {header}
        <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-[12px] border border-warn/30 bg-warn-soft px-4 py-3 text-[13px]">
          <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden="true" />
          <span className="flex-1">
            {analyticsUnavailable
              ? "Dashboard analytics are temporarily unavailable. Other admin sections are still available."
              : "Dashboard data could not be loaded. Retry or check the console error above."}
          </span>
          <Button size="sm" variant="outline" onClick={retryLoad}><RotateCw /> Retry</Button>
        </div>
        {analyticsUnavailable && openDisputes > 0 && (
          <div className="mb-5 max-w-sm">
            <AttentionTile href={pageToPath("disputes")} icon={AlertTriangle} count={openDisputes} one="open dispute" many="open disputes" tone="danger" index={0} />
          </div>
        )}
        {analyticsUnavailable && (
          <Panel
            title="Recent platform activity"
            description="Latest marketplace and administrative events."
            action={<Button asChild variant="outline" size="sm"><Link href={pageToPath("activity-log")}>View activity</Link></Button>}
          >
            <ActivityFeed items={recentActivity.slice(0, 7)} loading={activityLoading} />
          </Panel>
        )}
      </div>
    );
  }

  // The series only has months that had bookings, so its last point may be an
  // older month. Count it only if it really is this month.
  const currentMonthLabel = now.toLocaleDateString("en-US", { month: "short" });
  const lastPoint = bookingsSeries[bookingsSeries.length - 1];
  // While the analytics load, their figures are placeholders, whatever the last load left behind.
  const stats = analyticsLoading ? null : dashboardStats;
  const bookingsThisMonth = lastPoint && lastPoint.month === currentMonthLabel ? lastPoint.value : 0;
  const activeProviderShare = stats && stats.totalUsers > 0
    ? Math.round((stats.activeProviders / stats.totalUsers) * 1000) / 10
    : 0;
  const disputeRate = stats && stats.totalBookings > 0 ? (disputes.length / stats.totalBookings) * 100 : 0;
  const escrowHeld = extras?.escrowHeld ?? null;
  const dash = (v: number | null | undefined, fmt: (n: number) => string = String) => (v === null || v === undefined ? "—" : fmt(v));

  // Each queue is read from one part of the console, so it shows a placeholder until that part answers.
  const attentionLoading = disputesLoading || verificationsLoading || countsLoading;
  const queues: { key: string; page: Page; icon: typeof ShieldCheck; count: number | null; loading: boolean; one: string; many: string; tone: "danger" | "warn" | "info" | "accent" }[] = [
    { key: "disputes", page: "disputes", icon: AlertTriangle, count: openDisputes, loading: disputesLoading, one: "open dispute", many: "open disputes", tone: "danger" },
    // Same per-queue counts the bell and sidebar use. The summary's totals can be
    // a stand-in 0 when a request failed, so they are not read here.
    { key: "withdrawals", page: "withdrawals", icon: WalletCards, count: queueCounts.withdrawals, loading: countsLoading, one: "payout request", many: "payout requests", tone: "warn" },
    { key: "verifications", page: "verifications", icon: ShieldCheck, count: queueCounts.verifications, loading: verificationsLoading, one: "provider to verify", many: "providers to verify", tone: "warn" },
    { key: "skills", page: "skill-requests", icon: Wrench, count: queueCounts["skill-requests"], loading: countsLoading, one: "service request", many: "service requests", tone: "info" },
    { key: "escrow", page: "transactions", icon: CreditCard, count: extras?.escrowCount ?? null, loading: false, one: "escrow hold", many: "escrow holds", tone: "accent" },
  ];
  const openQueues = queues.filter((q) => q.count !== null && q.count > 0).length;
  const unknownQueues = queues.some((q) => q.count === null);

  return (
    <div>
      {header}
      {analyticsInBrowser && <AnalyticsSourceNote />}

      {/* Outstanding work leads: this is an operations console. */}
      <section aria-labelledby="attention-title" className="mb-7">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 id="attention-title" className="text-[14px] font-semibold tracking-tight">Needs your attention</h2>
          <span className="text-[12px] text-muted-foreground">
            {attentionLoading ? "Checking queues…" : unknownQueues ? "Some queue counts are unavailable." : openQueues === 0 ? "All clear: nothing is waiting for review." : `${openQueues} ${openQueues === 1 ? "queue has" : "queues have"} work waiting`}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {queues.map((q, i) => (
            <AttentionTile key={q.key} href={pageToPath(q.page)} icon={q.icon} count={q.count} loading={q.loading} one={q.one} many={q.many} tone={q.tone} index={i} />
          ))}
        </div>
      </section>

      {/* Headline metrics */}
      {stats ? (
        <section aria-label="Key metrics" className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total users"
            icon={<Users />}
            value={stats.totalUsers}
            footer={<span className="text-[12px] text-muted-foreground">{usersLoading && users.length === 0 ? "Counting new signups…" : newUsersThisMonth > 0 ? <><span className="font-semibold text-ok">+{newUsersThisMonth}</span> joined this month</> : "No new signups this month"}</span>}
          />
          <KpiCard
            label="Registered providers"
            icon={<ShieldCheck />}
            value={stats.activeProviders}
            footer={<span className="text-[12px] text-muted-foreground"><span className="font-semibold text-foreground tabular">{activeProviderShare}%</span> of registered users</span>}
          />
          <KpiCard
            label="Bookings this month"
            icon={<CalendarDays />}
            value={bookingsThisMonth}
            trend={bookingsSeries.map((p) => p.value)}
            footer={<Delta value={monthOverMonth(bookingsSeries)} />}
          />
          <KpiCard
            label="Provider payouts"
            icon={<CreditCard />}
            value={stats.monthlyRevenue}
            format={formatCurrency}
            trend={revenueSeries.map((p) => p.value)}
            footer={<Delta value={monthOverMonth(revenueSeries)} />}
          />
        </section>
      ) : (
        <section aria-busy="true" aria-label="Loading key metrics" className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiPlaceholder label="Total users" icon={<Users />} />
          <KpiPlaceholder label="Registered providers" icon={<ShieldCheck />} />
          <KpiPlaceholder label="Bookings this month" icon={<CalendarDays />} />
          <KpiPlaceholder label="Provider payouts" icon={<CreditCard />} />
        </section>
      )}

      {/* What's happening now, beside the money in motion. Deeper analysis
          (categories, top providers, ratings, completion) lives on Reports. */}
      <div className="mb-7 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel
          title="Recent platform activity"
          description="Latest marketplace and administrative events"
          className="lg:col-span-2"
          action={<Button asChild variant="outline" size="sm"><Link href={pageToPath("activity-log")}>View all</Link></Button>}
        >
          {/* A preview, not the full log — the Activity page is the complete history. */}
          <ActivityFeed items={recentActivity.slice(0, 7)} loading={activityLoading} />
        </Panel>

        <Panel title="Marketplace pulse" description="Money held and jobs in motion">
          <dl className="divide-y divide-border text-[13px]">
            {[
              {
                label: "Held in escrow",
                icon: WalletCards,
                value: !extras ? "…" : dash(escrowHeld, formatCurrency),
                hint: extras && extras.escrowCount !== null ? `${extras.escrowCount} ${extras.escrowCount === 1 ? "job" : "jobs"}` : undefined,
              },
              {
                label: "Commission this month",
                icon: Percent,
                value: stats ? formatCurrency(stats.monthlyCommission) : "…",
                hint: stats ? `${formatCurrency(stats.totalCommission)} all time` : undefined,
              },
              { label: "Open jobs", icon: CalendarDays, value: extras ? dash(extras.openJobs) : "…" },
              { label: "Jobs matching", icon: Users, value: extras ? dash(extras.matchingJobs) : "…" },
              { label: "Dispute rate", icon: AlertTriangle, value: stats && !disputesLoading ? `${disputeRate.toFixed(1)}%` : "…" },
            ].map(({ label, icon: Icon, value, hint }) => (
              <div key={label} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Icon className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                <dt className="flex-1 text-muted-foreground">
                  {label}
                  {hint && <span className="block text-[11.5px] text-subtle">{hint}</span>}
                </dt>
                <dd className="font-semibold tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel
        title="Payout trend"
        description="Provider payouts released per month, after commission"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={pageToPath("reports")}>
              Full reports <ArrowRight />
            </Link>
          </Button>
        }
      >
        {analyticsLoading ? (
          <Skeleton className="w-full" style={{ height: 220 }} />
        ) : revenueSeries.length > 0 ? (
          <TrendChart data={revenueSeries} format={formatCurrency} yFormat={formatCurrencyCompact} height={220} />
        ) : (
          <EmptyState icon={<CreditCard />} title="No payouts yet" description="Completed, paid jobs will build this chart." />
        )}
      </Panel>
    </div>
  );
}
