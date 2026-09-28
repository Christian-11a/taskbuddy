"use client";

import * as React from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { ArrowLeft, CheckCircle2, Inbox, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";

/* ─────────────────────────── pure helpers ─────────────────────────── */

/** The id `dir` steps from `current` in `ids`, clamped at the ends. With no
 *  current selection, J lands on the first item and K on the last. */
export function stepInList(ids: string[], current: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i === -1) return dir === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
}

/** Where the selection should land once `id` leaves the list: the next item,
 *  else the previous one, else nothing. */
export function neighborAfterRemoval(ids: string[], id: string): string | null {
  const i = ids.indexOf(id);
  if (i === -1) return ids[0] ?? null;
  return ids[i + 1] ?? ids[i - 1] ?? null;
}

/* ─────────────────────────── hooks ─────────────────────────── */

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

/** True at the `lg` breakpoint and up, where queues show list + detail side by side. */
export function useIsWide(query = "(min-width: 1024px)") {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => true,
  );
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function modalIsOpen() {
  return !!document.querySelector(
    '[aria-modal="true"]:not([aria-hidden="true"]), [role="dialog"][data-state="open"], [role="menu"][data-state="open"]',
  );
}

export interface QueueKeyHandlers {
  ids: string[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** A — the queue's positive decision (approve, release, settle). */
  onApprove?: () => void;
  /** R — the queue's negative decision (reject, refund). */
  onReject?: () => void;
  enabled?: boolean;
}

/**
 * Inbox keys: J/↓ next, K/↑ previous, A approve, R reject, Esc clear.
 * Ignored while typing, while any dialog/menu is open, or with modifiers held,
 * so it never fights the command palette or a reason field.
 */
export function useQueueKeys({ ids, selectedId, onSelect, onApprove, onReject, enabled = true }: QueueKeyHandlers) {
  const latest = useRef({ ids, selectedId, onSelect, onApprove, onReject });
  useEffect(() => {
    latest.current = { ids, selectedId, onSelect, onApprove, onReject };
  });

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || modalIsOpen()) return;
      const { ids, selectedId, onSelect, onApprove, onReject } = latest.current;
      const key = e.key.toLowerCase();
      if (key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = stepInList(ids, selectedId, 1);
        onSelect(next);
        if (next) scrollItemIntoView(next);
      } else if (key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = stepInList(ids, selectedId, -1);
        onSelect(prev);
        if (prev) scrollItemIntoView(prev);
      } else if (key === "a" && selectedId && onApprove) {
        e.preventDefault();
        onApprove();
      } else if (key === "r" && selectedId && onReject) {
        e.preventDefault();
        onReject();
      } else if (e.key === "Escape" && selectedId) {
        onSelect(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}

function scrollItemIntoView(id: string) {
  requestAnimationFrame(() => {
    document.querySelector(`[data-queue-item="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: "nearest" });
  });
}

/* ─────────────────────────── components ─────────────────────────── */

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Segmented filter with a pill that glides to the active option. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: T;
  onChange: (value: T) => void;
  options: FilterOption<T>[];
  label: string;
  /** Unique per page, so two tab strips never share a sliding pill. */
  id: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[9px] bg-surface-2 p-[3px]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`filter-pill-${id}`}
                className="absolute inset-0 rounded-[7px] border border-border bg-surface shadow-ui-sm"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
            {o.count !== undefined && (
              <span className={cn("relative tabular text-[11px]", active ? "text-muted-foreground" : "text-subtle")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        className="h-8 w-full rounded-[8px] border border-input bg-surface pl-8 pr-8 text-[12.5px] text-foreground transition-[border-color,box-shadow] placeholder:text-subtle focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-subtle hover:bg-accent hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Inbox layout: list on the left, detail on the right (sticky). Below `lg`
 * it becomes one column — the list, or the detail with a back button.
 */
export function QueueShell({
  toolbar,
  list,
  detail,
  showDetailOnNarrow,
  onBack,
  backLabel = "Back to queue",
}: {
  toolbar: React.ReactNode;
  list: React.ReactNode;
  detail: React.ReactNode;
  showDetailOnNarrow: boolean;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] xl:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
      <section
        className={cn(
          "flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-border bg-surface shadow-ui-sm",
          showDetailOnNarrow && "hidden lg:flex",
        )}
      >
        <div className="flex flex-col gap-2.5 border-b border-border p-3">{toolbar}</div>
        {list}
      </section>
      <section className={cn("min-w-0 lg:sticky lg:top-0", !showDetailOnNarrow && "hidden lg:block")}>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
        >
          <ArrowLeft className="size-3.5" /> {backLabel}
        </button>
        {detail}
      </section>
    </div>
  );
}

/** A selectable row in a queue list. */
export function QueueItem({
  id,
  selected,
  onSelect,
  leading,
  title,
  meta,
  trailing,
  aside,
}: {
  id: string;
  selected: boolean;
  onSelect: (id: string) => void;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <li className="relative">
      <button
        data-queue-item={id}
        aria-current={selected || undefined}
        onClick={() => onSelect(id)}
        className={cn(
          "group relative flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected ? "bg-primary-soft/70" : "hover:bg-accent",
        )}
      >
        {selected && (
          <motion.span
            layoutId="queue-selected-bar"
            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        {leading && <span className="shrink-0">{leading}</span>}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-foreground">{title}</span>
            {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
          </span>
          {meta && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{meta}</span>}
          {aside && <span className="mt-1.5 block">{aside}</span>}
        </span>
      </button>
    </li>
  );
}

export function QueueList({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul aria-label={label} className="max-h-[calc(100dvh-270px)] min-h-[200px] divide-y divide-border overflow-y-auto lg:max-h-[calc(100dvh-250px)]">
      {children}
    </ul>
  );
}

/** Empty / loading / error body for a queue list. */
export function QueueListState({
  icon: Icon = Inbox,
  title,
  description,
  tone = "neutral",
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  tone?: "neutral" | "ok" | "danger";
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span
        className={cn(
          "grid size-10 place-items-center rounded-full",
          tone === "ok" ? "bg-ok-soft text-ok" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted-foreground",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      {description && <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Skeleton rows while a queue loads. */
export function QueueListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-start gap-3 px-3.5 py-3.5">
          <span className="size-9 shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-3 w-2/5 rounded bg-surface-2 motion-safe:animate-pulse" />
            <span className="block h-2.5 w-3/5 rounded bg-surface-2 motion-safe:animate-pulse" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "N waiting · M done this session" with a bar that fills as work clears. */
export function QueueProgress({ remaining, done, noun }: { remaining: number; done: number; noun: string }) {
  const total = remaining + done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
      <span className="tabular">
        <span className="font-medium text-foreground">{remaining}</span> {noun} waiting
        {done > 0 && (
          <>
            {" · "}
            <span className="font-medium text-ok">{done}</span> done this session
          </>
        )}
      </span>
      {done > 0 && (
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <motion.span
            className="block h-full rounded-full bg-ok"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 26 }}
          />
        </span>
      )}
    </div>
  );
}

/** Keyboard legend shown under a queue list on wide screens. */
export function KeyHints({ approve, reject }: { approve?: string; reject?: string }) {
  return (
    <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-surface-2/60 px-3.5 py-2 text-[11px] text-subtle lg:flex">
      <span className="flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
      {approve && <span className="flex items-center gap-1"><Kbd>A</Kbd> {approve}</span>}
      {reject && <span className="flex items-center gap-1"><Kbd>R</Kbd> {reject}</span>}
      <span className="flex items-center gap-1"><Kbd>Esc</Kbd> clear</span>
    </div>
  );
}

/** Detail pane card. `key` it by record id so each record animates in. */
export function DetailCard({
  header,
  children,
  footer,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-border bg-surface shadow-ui-sm"
    >
      <header className="border-b border-border px-5 py-4 sm:px-6">{header}</header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
      {footer && (
        <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2/80 px-5 py-3.5 backdrop-blur sm:px-6">
          {footer}
        </footer>
      )}
    </motion.article>
  );
}

export function DetailSection({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mb-6 last:mb-0", className)}>
      {title && <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-subtle">{title}</h3>}
      {children}
    </section>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-foreground">{children}</dd>
    </div>
  );
}

/** Placeholder in the detail pane when nothing is selected. With `queueEmpty`
 *  there is nothing to pick, so it says so instead of prompting for J. */
export function DetailEmpty({ title, description, queueEmpty = false }: { title: string; description: string; queueEmpty?: boolean }) {
  return (
    <div className="hidden min-h-[420px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-border-strong bg-surface/50 px-8 text-center lg:flex">
      {queueEmpty ? <CheckCircle2 className="size-6 text-ok" /> : <Inbox className="size-6 text-subtle" />}
      <div className="text-[13.5px] font-medium">{queueEmpty ? "Nothing to review here" : title}</div>
      <p className="max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
        {queueEmpty ? "When something in this view needs a decision, it opens here." : description}
      </p>
      {!queueEmpty && (
        <div className="mt-2 flex items-center gap-1 text-[11.5px] text-subtle">
          Press <Kbd>J</Kbd> to start
        </div>
      )}
    </div>
  );
}

/** Initials avatar used in queue rows and detail headers. */
export function Avatar({ initials, tone = "accent", size = "md" }: { initials: string; tone?: "accent" | "warn" | "danger" | "ok" | "neutral"; size?: "md" | "lg" }) {
  const tones = {
    accent: "bg-primary-soft text-primary",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    ok: "bg-ok-soft text-ok",
    neutral: "bg-surface-2 text-muted-foreground",
  } as const;
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        size === "lg" ? "size-11 text-[13px]" : "size-9 text-[11.5px]",
        tones[tone],
      )}
    >
      {initials}
    </span>
  );
}

export function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?"
  );
}
