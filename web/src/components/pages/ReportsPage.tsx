"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Download } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatCurrency, formatCurrencyCompact } from "@/lib/adapters";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const PIE_COLORS = ["#22c3d6", "#38bdf8", "#22c55e", "#f59e0b", "#ef4444", "#a78bfa"];

export function ReportsPage() {
  const {
    dashboardStats,
    revenueSeries,
    bookingsSeries,
    bookingsByCategory,
    topProviders,
    loading,
  } = useApp();
  const [confirmingExport, setConfirmingExport] = useState(false);

  if (loading || !dashboardStats) {
    return (
      <div className="flex items-center justify-center" style={{ height: 300, color: "var(--text-muted)", fontSize: 13 }}>
        Loading reports…
      </div>
    );
  }

  const maxProviderJobs = Math.max(...topProviders.map((p) => p.jobs), 1);
  // Captured after the null guard above so the export closure keeps the narrowing.
  const stats = dashboardStats;

  /**
   * One CSV covering every section on this page. A dashboard mixes several
   * unrelated tables, so each is emitted as its own labelled block rather than
   * forcing them into one incompatible header row.
   */
  function exportCsv() {
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
      toCsv(["Provider", "Completed jobs", "Rating"], topProviders.map((p) => [p.name, p.jobs, p.rating])),
    ];
    const labels = ["SUMMARY", "REVENUE TREND", "MONTHLY BOOKINGS", "BOOKINGS BY CATEGORY", "TOP PROVIDERS"];
    const csv = blocks.map((b, i) => `${labels[i]}\r\n${b}`).join("\r\n\r\n");
    downloadCsv(datedFilename("taskbuddy-analytics"), csv);
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: 22, letterSpacing: "-0.025em" }}>Reports & Analytics</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>
            Platform performance metrics and business intelligence
          </div>
        </div>
        <button
          onClick={() => setConfirmingExport(true)}
          title="Download every section on this page as one CSV"
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total Revenue", val: formatCurrencyCompact(dashboardStats.totalRevenue), sub: "All time" },
          { label: "This Month", val: formatCurrency(dashboardStats.monthlyRevenue), sub: "Current month" },
          { label: "Completion Rate", val: `${dashboardStats.completionRate}%`, sub: "Platform avg" },
          { label: "Avg Rating", val: `⭐ ${dashboardStats.avgRating}`, sub: "Provider avg" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-4"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{s.label}</div>
            <div className="text-white font-extrabold" style={{ fontSize: 22 }}>{s.val}</div>
            <div style={{ fontSize: 10, color: "var(--success-text)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Area chart */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Revenue Trend</div>
          <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 16 }}>Monthly earnings over time</div>
          {revenueSeries.length === 0 ? (
            <div
              className="flex items-center justify-center"
              style={{ height: 150, fontSize: 11.4, color: "var(--text-muted)", textAlign: "center" }}
            >
              No revenue yet — this fills in once a job&apos;s escrow is released to a provider.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c3d6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c3d6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  cursor={{ stroke: "var(--indigo)", strokeWidth: 1, strokeDasharray: "3 3" }}
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
                <Area type="monotone" dataKey="value" stroke="#22c3d6" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie chart */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Service Categories</div>
          <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 8 }}>Booking distribution</div>
          <div className="flex items-center gap-4">
            {/* Fixed-size chart — no ResponsiveContainer needed (avoids its console warning) */}
            <PieChart width={120} height={120}>
              <Pie
                data={bookingsByCategory}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={55}
                dataKey="value"
                paddingAngle={3}
              >
                {bookingsByCategory.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
            <div className="flex flex-col gap-1.5">
              {bookingsByCategory.map((c, i) => (
                <div key={c.label} className="flex items-center gap-2" style={{ fontSize: 10 }}>
                  <div
                    className="rounded-sm flex-shrink-0"
                    style={{ width: 8, height: 8, background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span style={{ color: "var(--text-muted)" }}>{c.label}</span>
                  <span className="text-white font-semibold ml-auto">{c.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Providers + Bar chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Top Providers</div>
          <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 16 }}>By total completed jobs</div>
          <div className="flex flex-col gap-3">
            {topProviders.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0 font-bold text-white"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 8,
                    background: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#cd7c3d" : "#6b7280",
                    color: "#fff",
                    fontSize: 9,
                  }}
                >
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium" style={{ fontSize: 11.4 }}>{p.name}</div>
                  <div style={{ fontSize: 9.8, color: "var(--text-muted)" }}>
                    {p.jobs} jobs · ⭐ {p.rating}
                  </div>
                </div>
                <div
                  className="flex-shrink-0 rounded-full overflow-hidden"
                  style={{ width: 60, height: 4, background: "var(--track-bg)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(p.jobs / maxProviderJobs) * 100}%`,
                      background: "linear-gradient(90deg, #22c3d6, #38bdf8)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-xl p-5"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        >
          <div className="font-semibold text-white mb-1" style={{ fontSize: 14 }}>Monthly Bookings</div>
          <div style={{ fontSize: 11.4, color: "var(--text-muted)", marginBottom: 16 }}>Volume per month</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={bookingsSeries} barSize={20}>
              <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
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
                formatter={(v: number) => [v, "Bookings"]}
              />
              <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
