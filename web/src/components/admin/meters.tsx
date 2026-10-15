"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// Meters need no charting library, so pages can import them without pulling in recharts.

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
