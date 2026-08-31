"use client";

import Link from "next/link";
import {
  Users,
  ShieldCheck,
  CreditCard,
  CalendarDays,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  UserPlus,
  WalletCards, Percent, Star,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatCurrency } from "@/lib/adapters";
import { pageToPath } from "@/lib/routes";

const StatCard = ({
  icon,
  label,
  value,
  sub,
  accent,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
  className?: string;
}) => (
  /* No hover lift: this card isn't a link or a button, so animating it on
     hover promised an interaction that doesn't exist. The heavy drop shadow
     went with it — these sit flat on the page, and elevation should mean
     something is floating above it (a drawer, a dropdown), not decorate a
     static panel. */
  <div
    className={`flex flex-col ${className}`}
    style={{
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      borderRadius: "var(--r-lg)",
      padding: "var(--sp-5)",
      gap: "var(--sp-4)",
    }}
  >
    <div className="flex items-center justify-between">
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
      <div
        className="flex items-center justify-center"
        style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: accent + "22" }}
      >
        <span style={{ color: accent, display: "flex" }}>{icon}</span>
      </div>
    </div>
    <div>
      <div className="text-white font-extrabold tabular" style={{ fontSize: "var(--fs-3xl)", letterSpacing: "var(--tr-tight)", lineHeight: "var(--lh-tight)" }}>{value}</div>
      {sub && (
        <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: "var(--sp-1)" }}>
          {sub}
        </div>
      )}
    </div>
  </div>
);

const activityIcon = (type: string) => {
  switch (type) {
    case "tx": return <CreditCard size={12} style={{ color: "var(--success-text)" }} />;
    case "user": return <UserPlus size={12} style={{ color: "#60a5fa" }} />;
    case "alert": return <AlertTriangle size={12} style={{ color: "var(--warning-text)" }} />;
    default: return <CheckCircle size={12} style={{ color: "var(--success-text)" }} />;
  }
};

export function DashboardPage() {
  const { dashboardStats, recentActivity, disputes, transactions, bookings, users, bookingsSeries, loading } = useApp();
  const openDisputes = disputes.filter((d) => d.isOpen).length;
  const escrowUnderReview = transactions.filter((t) => t.status === "IN_ESCROW").length;
  const escrowHeld = transactions.filter((t) => t.status === "IN_ESCROW").reduce((s, t) => s + t.amountValue, 0);
  const openJobs = bookings.filter((b) => b.status === "Open").length;
  const matchingJobs = bookings.filter((b) => b.status === "Matching").length;
  const disputeRate = dashboardStats ? (dashboardStats.totalBookings > 0 ? (disputes.length / dashboardStats.totalBookings) * 100 : 0) : 0;

  const now = new Date();
  const newUsersThisMonth = users.filter((u) => {
    const d = new Date(u.createdAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const activeProviderShare = dashboardStats && dashboardStats.totalUsers > 0
    ? Math.round((dashboardStats.activeProviders / dashboardStats.totalUsers) * 1000) / 10
    : 0;
  // Booking trend is already aggregated server-side and sorted ascending —
  // the last point is the current month, real data rather than a guess.
  const bookingsThisMonth = bookingsSeries.length > 0 ? bookingsSeries[bookingsSeries.length - 1].value : 0;

  if (loading || !dashboardStats) {
    return (
      <div className="flex items-center justify-center" style={{ height: 300, color: "var(--text-muted)", fontSize: 13 }}>
        Loading dashboard…
      </div>
    );
  }

  return (
    <div>
      {/* The page title is a heading, not a hero. The indigo gradient slab and
          its radial glow behind this text were pure decoration — they said
          nothing about platform state and made the dashboard read as a
          marketing surface rather than a place of work. */}
      <header className="mb-6">
        <h1 className="text-white font-bold" style={{ fontSize: "var(--fs-3xl)", letterSpacing: "var(--tr-tight)", lineHeight: "var(--lh-tight)" }}>Platform overview</h1>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--sp-2)", lineHeight: "var(--lh-normal)" }}>A clear read on marketplace activity, revenue, and the work that needs attention.</p>
      </header>

      {/* Outstanding work leads the page. This is an operations console: what
          an admin has to *do* outranks how the marketplace is performing.
          Queues are ordered by how much a delay costs someone — an active
          dispute freezes money, an unpaid withdrawal keeps a provider waiting,
          an unverified provider can't earn at all — and only queues with real
          items are shown, so an idle console reads as one calm line instead of
          four cards all reporting zero. */}
      {(() => {
        const queues = [
          { key: "disputes", count: openDisputes, one: "open dispute", many: "open disputes", href: pageToPath("disputes"), icon: <AlertTriangle size={15} />, tone: "var(--danger-text)", wash: "rgba(239,68,68,0.09)" },
          { key: "withdrawals", count: dashboardStats.pendingWithdrawals, one: "withdrawal to settle", many: "withdrawals to settle", href: pageToPath("withdrawals"), icon: <WalletCards size={15} />, tone: "var(--warning-text)", wash: "rgba(245,158,11,0.09)" },
          { key: "verifications", count: dashboardStats.pendingVerifications, one: "provider awaiting verification", many: "providers awaiting verification", href: pageToPath("verifications"), icon: <ShieldCheck size={15} />, tone: "var(--warning-text)", wash: "rgba(245,158,11,0.09)" },
          { key: "escrow", count: escrowUnderReview, one: "escrow hold under review", many: "escrow holds under review", href: pageToPath("transactions"), icon: <CreditCard size={15} />, tone: "var(--indigo-light)", wash: "var(--chip-bg)" },
        ];
        const open = queues.filter((q) => q.count > 0);

        if (open.length === 0) {
          return (
            <div
              className="flex items-center gap-2.5 rounded-xl mb-7"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "13px 16px" }}
            >
              <CheckCircle size={15} style={{ color: "var(--success-text)", flexShrink: 0 }} />
              <span className="text-white" style={{ fontSize: "var(--fs-sm)" }}>Nothing needs review right now.</span>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>Disputes, withdrawals, verifications, and escrow holds are all clear.</span>
            </div>
          );
        }

        return (
          <section className="mb-7">
            <h2 className="font-semibold text-white mb-2.5" style={{ fontSize: "var(--fs-md)" }}>Needs your attention</h2>
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              {open.map((q, i) => (
                <Link
                  key={q.key}
                  href={q.href}
                  className="hover-row flex items-center gap-3.5"
                  style={{ padding: i === 0 ? "15px 16px" : "12px 16px", borderTop: i === 0 ? "none" : "1px solid var(--border)", textDecoration: "none" }}
                >
                  <span
                    className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{ width: i === 0 ? 34 : 28, height: i === 0 ? 34 : 28, background: q.wash, color: q.tone }}
                  >
                    {q.icon}
                  </span>
                  <span className="font-bold tabular" style={{ fontSize: i === 0 ? 22 : 17, color: q.tone, minWidth: 28 }}>{q.count}</span>
                  <span className="text-white" style={{ fontSize: i === 0 ? 13 : 12 }}>{q.count === 1 ? q.one : q.many}</span>
                  <span className="ml-auto flex items-center gap-1 font-medium flex-shrink-0" style={{ fontSize: 11, color: "var(--indigo-light)" }}>
                    Review <ArrowUpRight size={11} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Marketplace scale — three peer counts, so they share one treatment. */}
      <h2 className="font-semibold text-white mb-2.5" style={{ fontSize: "var(--fs-md)" }}>Marketplace</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard
          icon={<Users size={14} />}
          label="Total Users"
          value={dashboardStats.totalUsers.toLocaleString()}
          sub={newUsersThisMonth > 0 ? `+${newUsersThisMonth} this month` : "No new signups this month"}
          accent="#22c3d6"
        />
        <StatCard
          icon={<ShieldCheck size={14} />}
          label="Active Providers"
          value={dashboardStats.activeProviders}
          sub={`${activeProviderShare}% of registered users`}
          accent="#22c55e"
        />
        <StatCard
          icon={<CalendarDays size={14} />}
          label="Bookings This Month"
          value={bookingsThisMonth.toLocaleString()}
          sub={`${dashboardStats.completionRate}% completion rate`}
          className="col-span-2 lg:col-span-1"
          accent="#38bdf8"
        />
      </div>

      {/* Money is a different kind of fact from headcount, so it gets its own
          grouped panel rather than two more cards in the same row — the three
          figures here are related to each other, not to the counts above. */}
      <h2 className="font-semibold text-white mb-2.5" style={{ fontSize: "var(--fs-md)" }}>This month&apos;s money</h2>
      <div
        className="rounded-xl mb-7 flex flex-wrap"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "18px 20px", columnGap: 44, rowGap: 18 }}
      >
        <div>
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--text-muted)" }}><CreditCard size={13} /> Gross merchandise value</div>
          <div className="text-white font-extrabold mt-1.5 tabular" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>{formatCurrency(dashboardStats.monthlyRevenue)}</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--text-muted)" }}><Percent size={13} /> Commission retained</div>
          <div className="text-white font-extrabold mt-1.5 tabular" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>{formatCurrency(dashboardStats.monthlyCommission)}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>{formatCurrency(dashboardStats.totalCommission)} all time</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--text-muted)" }}><WalletCards size={13} /> Held in escrow</div>
          <div className="text-white font-extrabold mt-1.5 tabular" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>{formatCurrency(escrowHeld)}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>Not yet released to providers</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2"><div className="font-semibold text-white" style={{ fontSize: 13 }}>What&apos;s happening</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Latest signals</div></div>
      {/* Recent Activity + Marketplace Health */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)] gap-3">
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="flex items-start justify-between mb-1 gap-3">
            <div>
              <div className="font-semibold text-white" style={{ fontSize: 14 }}>Recent Platform Activity</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>Latest marketplace and administrative events.</div>
            </div>
            <Link
              href={pageToPath("activity-log")}
              className="flex-shrink-0 font-semibold transition-opacity hover:opacity-80"
              style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 9, padding: "6px 12px", fontSize: 11, color: "var(--text-light)", textDecoration: "none" }}
            >
              View activity
            </Link>
          </div>
          <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
            {/* Dashboard is a preview, not the full log — the Activity page is the complete history. */}
            {recentActivity.slice(0, 7).map((a, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0 rounded-lg"
                  style={{ width: 26, height: 26, background: "var(--chip-bg)" }}
                >
                  {activityIcon(a.type)}
                </div>
                <div className="flex-1 text-white" style={{ fontSize: 11.4 }}>{a.text}</div>
                <div className="flex items-center gap-1 flex-shrink-0" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  <Clock size={9} /> {a.time}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Marketplace Health</div>
          <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 12 }}>Current operational signals</div>
          {[
            ["Completion rate", `${dashboardStats.completionRate}%`],
            ["Open jobs", String(openJobs)],
            ["Jobs matching", String(matchingJobs)],
            ["Escrow held", formatCurrency(escrowHeld)],
            ["Dispute rate", `${disputeRate.toFixed(1)}%`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between"
              style={{ padding: "11px 0", borderBottom: "1px solid var(--border)" }}
            >
              <span style={{ fontSize: 11.4, color: "var(--text-light)" }}>{label}</span>
              <span className="text-white font-bold" style={{ fontSize: 13 }}>{value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between" style={{ padding: "11px 0" }}>
            <span style={{ fontSize: 11.4, color: "var(--text-light)" }}>Avg provider rating</span>
            <span className="text-white font-bold flex items-center gap-1" style={{ fontSize: 13 }}>
              {dashboardStats.avgRating} <Star size={12} fill="#f59e0b" color="#f59e0b" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

