"use client";

import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Chart colours come from the theme tokens, so both themes just work. */
export const CHART_COLORS = [
  "var(--ui-chart-1)", "var(--ui-chart-2)", "var(--ui-chart-3)", "var(--ui-chart-4)", "var(--ui-chart-5)",
];

const axisTick = { fill: "var(--ui-text-subtle)", fontSize: 11 };

function ChartTooltip({ active, payload, label, format }: {
  active?: boolean;
  payload?: { value: number; name?: string; color?: string }[];
  label?: string;
  format: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[8px] border border-border bg-popover px-3 py-2 text-[12px] shadow-ui-md">
      {label && <div className="mb-0.5 font-medium text-muted-foreground">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 font-semibold tabular">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          {format(p.value)}
        </div>
      ))}
    </div>
  );
}

/** Tiny trend line for KPI cards; no axes, no interaction. */
export function Sparkline({ data, color = CHART_COLORS[0], className }: { data: number[]; color?: string; className?: string }) {
  const id = React.useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  if (data.length < 2) return <div className={cn("h-10", className)} />;
  return (
    <div className={cn("h-10", className)} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#spark-${id})`} isAnimationActive={!reduce} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Month-by-month trend with gridlines and a hover tooltip. */
export function TrendChart({ data, format, color = CHART_COLORS[0], height = 260, yFormat }: {
  data: { month: string; value: number }[];
  format: (n: number) => string;
  yFormat?: (n: number) => string;
  color?: string;
  height?: number;
}) {
  const id = React.useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`trend-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--ui-border)" strokeDasharray="3 4" />
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56} tickFormatter={yFormat ?? format} />
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: "var(--ui-border-strong)", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#trend-${id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--ui-surface)" }} isAnimationActive={!reduce} animationDuration={800} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Vertical bars per month. */
export function BarTrend({ data, format, color = CHART_COLORS[0], height = 240 }: {
  data: { month: string; value: number }[];
  format: (n: number) => string;
  color?: string;
  height?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--ui-border)" strokeDasharray="3 4" />
          <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "var(--ui-hover)" }} />
          <Bar dataKey="value" fill={color} radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive={!reduce} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Share-of-total ring with a legend; values are percentages. */
export function DonutChart({ data, centerLabel, centerValue }: {
  data: { label: string; value: number }[];
  centerLabel?: string;
  centerValue?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = React.useState<number | null>(null);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-[168px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={56}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--ui-surface)"
              strokeWidth={2}
              isAnimationActive={!reduce}
              animationDuration={800}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={active === null || active === i ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[20px] font-semibold tabular tracking-tight">
              {active !== null ? `${data[active].value}%` : centerValue}
            </div>
            <div className="max-w-[92px] truncate text-[11px] text-subtle">{active !== null ? data[active].label : centerLabel}</div>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((d, i) => (
          <li
            key={d.label}
            className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] transition-colors", active === i && "bg-accent")}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="font-semibold tabular">{d.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal ranked bars (leaderboards). */
export function BarList({ items, format = (n) => String(n), max }: {
  items: { label: React.ReactNode; value: number; hint?: React.ReactNode }[];
  format?: (n: number) => string;
  max?: number;
}) {
  const reduce = useReducedMotion();
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px]">
            <span className="min-w-0 truncate font-medium">{item.label}</span>
            <span className="shrink-0 text-muted-foreground tabular">{item.hint ?? format(item.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn("h-full rounded-full bg-primary", !reduce && "origin-left animate-[ui-grow_700ms_cubic-bezier(0.16,1,0.3,1)_both]")}
              style={{ width: `${Math.max(3, (item.value / top) * 100)}%`, animationDelay: reduce ? undefined : `${i * 60}ms` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Circular progress (0–100). */
export function ProgressRing({ value, size = 56, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ui-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ui-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: reduce ? undefined : "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      {label && <div className="absolute inset-0 grid place-items-center text-[12px] font-semibold tabular">{label}</div>}
    </div>
  );
}
