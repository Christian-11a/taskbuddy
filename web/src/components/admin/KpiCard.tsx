"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";
import { Sparkline } from "./charts";

/** Percent change between the last two points of a series, or null when there
 *  is no previous month to compare with (or it was zero). */
export function monthOverMonth(series: { value: number }[]): number | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2].value;
  const cur = series[series.length - 1].value;
  if (prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function Delta({ value, label = "vs last month" }: { value: number | null; label?: string }) {
  if (value === null) return <span className="text-[12px] text-subtle">No prior month</span>;
  const flat = Math.abs(value) < 0.5;
  const up = value > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular",
          flat ? "bg-neutral-soft text-neutral" : up ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger",
        )}
      >
        <Icon className="size-3" aria-hidden="true" />
        {flat ? "0%" : `${Math.abs(value).toFixed(value >= 10 || value <= -10 ? 0 : 1)}%`}
      </span>
      <span className="text-subtle">{label}</span>
    </span>
  );
}

interface KpiCardProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  format?: (n: number) => string;
  /** Secondary line under the number. */
  footer?: React.ReactNode;
  /** Trend values, oldest first. */
  trend?: number[];
  className?: string;
}

/** Headline metric: label, big counting number, trend sparkline, footer. */
export function KpiCard({ label, icon, value, format, footer, trend, className }: KpiCardProps) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-[12px] border border-border bg-surface p-4 shadow-ui-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
        <span className="grid size-7 place-items-center rounded-[8px] bg-primary-soft text-primary [&_svg]:size-3.5" aria-hidden="true">{icon}</span>
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em]">
        <AnimatedNumber value={value} format={format} countUpOnMount />
      </div>
      {trend && trend.length > 1 ? <Sparkline data={trend} className="-mx-1 mt-2" /> : <div className="h-3" />}
      {footer && <div className="mt-2 min-h-5">{footer}</div>}
    </div>
  );
}
