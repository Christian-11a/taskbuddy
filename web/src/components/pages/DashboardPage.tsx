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
  WalletCards, Percent,
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) => (
  <div
    className="flex-1 min-w-[145px] rounded-2xl p-4 flex flex-col gap-3 transition-transform hover:-translate-y-0.5"
    style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 12px 30px rgba(0,0,0,.12)" }}
  >
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ width: 28, height: 28, background: accent + "22" }}
      >
        <span style={{ color: accent }}>{icon}</span>
      </div>
    </div>
    <div>
      <div className="text-white font-extrabold" style={{ fontSize: 27, letterSpacing: "-0.04em" }}>{value}</div>
      {sub && (
        <div className="mt-1" style={{ fontSize: 10, color: "var(--text-muted)" }}>
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
      <section className="relative overflow-hidden rounded-3xl p-6 mb-5" style={{ background: "linear-gradient(120deg, rgba(35,45,78,.95), rgba(16,24,47,.9))", border: "1px solid rgba(120,145,220,.22)", boxShadow: "0 20px 50px rgba(0,0,0,.2)" }}>
        <div className="absolute -right-16 -top-24 rounded-full" style={{ width: 230, height: 230, background: "radial-gradient(circle, rgba(56,189,248,.18), transparent 68%)" }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3" style={{ fontSize: 10, color: "#9db3d8", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>Operations center <span style={{ opacity: .45 }}>·</span> Today</div>
            <h1 className="text-white font-bold" style={{ fontSize: 28, letterSpacing: "-0.04em", lineHeight: 1.1 }}>Platform overview</h1>
            <p style={{ fontSize: 12, color: "#aebbd5", marginTop: 8, lineHeight: 1.5 }}>A clear read on marketplace activity, revenue, and the work that needs attention.</p>
          </div>
          <div className="flex items-center gap-2 font-semibold flex-shrink-0" style={{ background: "rgba(34,197,94,.13)", border: "1px solid rgba(34,197,94,.24)", borderRadius: 999, padding: "8px 12px", fontSize: 11.4, color: "var(--success-text)" }}><div className="rounded-full" style={{ width: 7, height: 7, background: "var(--success-text)", boxShadow: "0 0 8px var(--success-text)" }} />Live data</div>
        </div>
      </section>

      {/* Stat Cards */}
      <div className="flex gap-3 mb-5 flex-wrap">
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
          accent="#38bdf8"
        />
        <StatCard
          icon={<CreditCard size={14} />}
          label="Monthly GMV"
          value={formatCurrency(dashboardStats.monthlyRevenue)}
          sub={`${formatCurrency(escrowHeld)} currently held in escrow`}
          accent="#f59e0b"
        />
        <StatCard
          icon={<Percent size={14} />}
          label="Monthly Commission"
          value={formatCurrency(dashboardStats.monthlyCommission)}
          sub={`${formatCurrency(dashboardStats.totalCommission)} total retained`}
          accent="#a78bfa"
        />
      </div>

      <div className="flex items-center justify-between mb-2"><div className="font-semibold text-white" style={{ fontSize: 13 }}>Needs your attention</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Live queue</div></div>
      {/* Secondary Stat Row — actionable items only. Completion rate, avg
          rating, and total revenue duplicated Reports & Analytics, which
          already covers them (and more); trimmed so Dashboard stays a quick
          glance + what needs your attention right now, not a second Reports
          page. */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl flex-1 min-w-[210px]"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <ShieldCheck size={16} style={{ color: "#f59e0b" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{dashboardStats.pendingVerifications}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Pending Verifications</div>
          </div>
          <Link
            href={pageToPath("verifications")}
            className="ml-auto flex items-center gap-1 font-medium transition-opacity hover:opacity-75"
            style={{ fontSize: 10, color: "var(--indigo-light)", textDecoration: "none" }}
          >
            Review <ArrowUpRight size={10} />
          </Link>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl flex-1 min-w-[210px]"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <WalletCards size={16} style={{ color: "var(--warning-text)" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{dashboardStats.pendingWithdrawals}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Pending Withdrawals</div>
          </div>
          <Link
            href={pageToPath("withdrawals")}
            className="ml-auto flex items-center gap-1 font-medium transition-opacity hover:opacity-75"
            style={{ fontSize: 10, color: "var(--indigo-light)", textDecoration: "none" }}
          >
            Review <ArrowUpRight size={10} />
          </Link>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl flex-1 min-w-[210px]"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <AlertTriangle size={16} style={{ color: "var(--danger-text)" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{openDisputes}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Open Disputes</div>
          </div>
          <Link
            href={pageToPath("disputes")}
            className="ml-auto flex items-center gap-1 font-medium transition-opacity hover:opacity-75"
            style={{ fontSize: 10, color: "var(--indigo-light)", textDecoration: "none" }}
          >
            Review <ArrowUpRight size={10} />
          </Link>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl flex-1 min-w-[210px]"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <CreditCard size={16} style={{ color: "var(--indigo-light)" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{escrowUnderReview}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Escrow Under Review</div>
          </div>
          <Link
            href={pageToPath("transactions")}
            className="ml-auto flex items-center gap-1 font-medium transition-opacity hover:opacity-75"
            style={{ fontSize: 10, color: "var(--indigo-light)", textDecoration: "none" }}
          >
            Review <ArrowUpRight size={10} />
          </Link>
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
            ["Avg provider rating", `${dashboardStats.avgRating} ★`],
          ].map(([label, value], i, arr) => (
            <div
              key={label}
              className="flex items-center justify-between"
              style={{ padding: "11px 0", borderBottom: i === arr.length - 1 ? "none" : "1px solid var(--border)" }}
            >
              <span style={{ fontSize: 11.4, color: "var(--text-light)" }}>{label}</span>
              <span className="text-white font-bold" style={{ fontSize: 13 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

