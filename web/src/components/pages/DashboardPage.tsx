"use client";

import {
  Users,
  ShieldCheck,
  CreditCard,
  CalendarDays,
  TrendingUp,
  Star,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  UserPlus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatCurrencyCompact } from "@/lib/adapters";
import type { Page } from "@/lib/domain";

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
}

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
    className="flex-1 min-w-0 rounded-xl p-4 flex flex-col gap-3"
    style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
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
      <div className="text-white font-extrabold" style={{ fontSize: 24 }}>{value}</div>
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
    case "verif": return <ShieldCheck size={12} style={{ color: "#a5b4fc" }} />;
    case "tx": return <CreditCard size={12} style={{ color: "var(--success-text)" }} />;
    case "user": return <UserPlus size={12} style={{ color: "#60a5fa" }} />;
    case "alert": return <AlertTriangle size={12} style={{ color: "var(--warning-text)" }} />;
    default: return <CheckCircle size={12} style={{ color: "var(--success-text)" }} />;
  }
};

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { dashboardStats, revenueSeries, bookingsByCategory, recentActivity, disputes, loading } = useApp();
  const openDisputes = disputes.filter((d) => d.isOpen).length;

  if (loading || !dashboardStats) {
    return (
      <div className="flex items-center justify-center" style={{ height: 300, color: "var(--text-muted)", fontSize: 13 }}>
        Loading dashboard…
      </div>
    );
  }

  return (
    <div>
      {/* Section Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: 18 }}>Platform Overview</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            Real-time snapshot of TaskBuddy&apos;s key metrics
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 font-semibold"
          style={{
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 11,
            padding: "7px 11px",
            fontSize: 11.4,
            color: "var(--success-text)",
          }}
        >
          <div
            className="rounded-full"
            style={{ width: 6, height: 6, background: "var(--success-text)", boxShadow: "0 0 6px var(--success-text)" }}
          />
          Live
        </div>
      </div>

      {/* Stat Cards */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <StatCard
          icon={<Users size={14} />}
          label="Total Users"
          value={dashboardStats.totalUsers.toLocaleString()}
          sub="Registered accounts"
          accent="#6366f1"
        />
        <StatCard
          icon={<ShieldCheck size={14} />}
          label="Active Providers"
          value={dashboardStats.activeProviders}
          sub="Currently active"
          accent="#8b5cf6"
        />
        <StatCard
          icon={<CalendarDays size={14} />}
          label="Total Bookings"
          value={dashboardStats.totalBookings.toLocaleString()}
          sub="All-time total"
          accent="#22c55e"
        />
        <StatCard
          icon={<CreditCard size={14} />}
          label="Monthly Revenue"
          value={formatCurrency(dashboardStats.monthlyRevenue)}
          sub="Current month"
          accent="#f59e0b"
        />
      </div>

      {/* Secondary Stat Row */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <ShieldCheck size={16} style={{ color: "#f59e0b" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{dashboardStats.pendingVerifications}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Pending Verifications</div>
          </div>
          <button
            onClick={() => onNavigate("verifications")}
            className="ml-auto flex items-center gap-1 font-medium transition-opacity hover:opacity-75"
            style={{ fontSize: 10, color: "var(--indigo-light)", background: "none", border: "none", cursor: "pointer" }}
          >
            Review <ArrowUpRight size={10} />
          </button>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <AlertTriangle size={16} style={{ color: "var(--danger-text)" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{openDisputes}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Open Disputes</div>
          </div>
          <button
            onClick={() => onNavigate("disputes")}
            className="ml-auto flex items-center gap-1 font-medium transition-opacity hover:opacity-75"
            style={{ fontSize: 10, color: "var(--indigo-light)", background: "none", border: "none", cursor: "pointer" }}
          >
            Review <ArrowUpRight size={10} />
          </button>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <CheckCircle size={16} style={{ color: "var(--success-text)" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{dashboardStats.completionRate}%</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Job Completion Rate</div>
          </div>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <Star size={16} style={{ color: "var(--warning-text)" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{dashboardStats.avgRating}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Avg Provider Rating</div>
          </div>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <TrendingUp size={16} style={{ color: "#a5b4fc" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 18 }}>{formatCurrencyCompact(dashboardStats.totalRevenue)}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Total Revenue (All Time)</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Revenue Chart */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Monthly Revenue</div>
          <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 16 }}>Last 7 months</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={revenueSeries} barSize={22}>
              <XAxis
                dataKey="month"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "var(--track-bg)", radius: 4 }}
                contentStyle={{
                  background: "var(--panel-bg)",
                  border: "1px solid var(--panel-border)",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                  padding: "8px 12px",
                }}
                labelStyle={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 2 }}
                itemStyle={{ color: "var(--text-white)", fontSize: 12, fontWeight: 600, padding: 0 }}
                formatter={(v: number) => [formatCurrency(v), "Revenue"]}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bookings by Category */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Bookings by Category</div>
          <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 16 }}>Current month breakdown</div>
          <div className="flex flex-col gap-2">
            {bookingsByCategory.map((cat) => (
              <div key={cat.label} className="flex items-center gap-2">
                <span style={{ fontSize: 10, color: "var(--text-muted)", width: 60 }}>{cat.label}</span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "var(--track-bg)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${cat.value * 2.5}%`,
                      background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                    }}
                  />
                </div>
                <span style={{ fontSize: 10, color: "var(--text-light)", width: 30, textAlign: "right" }}>{cat.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Recent Activity</div>
        <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 16 }}>Latest platform events</div>
        <div className="flex flex-col gap-3">
          {recentActivity.map((a, i) => (
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
    </div>
  );
}
