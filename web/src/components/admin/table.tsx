"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────── sorting ─────────────────────────── */

export type SortDir = "asc" | "desc";
export interface SortState {
  id: string;
  dir: SortDir;
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Stable sort of `rows` by the column's sort value; empty values sink to the bottom either way. */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort: SortState | null): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.id);
  if (!col?.sortValue) return rows;
  const get = col.sortValue;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((x, y) => {
      const emptyX = x.v === null || x.v === undefined || x.v === "";
      const emptyY = y.v === null || y.v === undefined || y.v === "";
      if (emptyX !== emptyY) return emptyX ? 1 : -1;
      const c = compareValues(x.v, y.v);
      return (sort.dir === "asc" ? c : -c) || x.i - y.i;
    })
    .map((x) => x.row);
}

/** Click cycles a column: ascending → descending → off. */
export function useSort(initial: SortState | null = null) {
  const [sort, setSort] = useState<SortState | null>(initial);
  const toggle = (id: string) =>
    setSort((cur) => (cur?.id !== id ? { id, dir: "asc" } : cur.dir === "asc" ? { id, dir: "desc" } : null));
  return { sort, toggle, setSort };
}

/* ─────────────────────────── table ─────────────────────────── */

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
  /** Hide on narrow screens. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "right";
  width?: number | string;
}

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

export interface Selection {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  isSelectable?: (id: string) => boolean;
  /** Accessible label for a row checkbox. */
  rowLabel: (id: string) => string;
  allLabel: string;
  disabledAll?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  sort,
  onSort,
  selection,
  empty,
  label,
  minWidth = 640,
  rowClassName,
  activeRowId,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: SortState | null;
  onSort?: (id: string) => void;
  selection?: Selection;
  empty?: React.ReactNode;
  label: string;
  minWidth?: number;
  rowClassName?: (row: T) => string | undefined;
  activeRowId?: string | null;
}) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full border-separate border-spacing-0 text-left text-[13px]" style={{ minWidth }}>
        <thead>
          <tr>
            {selection && (
              <th className="sticky top-0 z-[1] w-10 border-b border-border bg-surface-2/70 py-2.5 pl-4 pr-1 backdrop-blur">
                <Checkbox
                  aria-label={selection.allLabel}
                  checked={selection.allSelected}
                  indeterminate={!selection.allSelected && selection.selected.size > 0}
                  onChange={selection.onToggleAll}
                  disabled={selection.disabledAll}
                />
              </th>
            )}
            {columns.map((c) => {
              const active = sort?.id === c.id;
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    "sticky top-0 z-[1] whitespace-nowrap border-b border-border bg-surface-2/70 px-3 py-2.5 text-[11.5px] font-medium text-muted-foreground backdrop-blur first:pl-4 last:pr-4",
                    c.align === "right" && "text-right",
                    c.hideBelow && HIDE[c.hideBelow],
                    c.headerClassName,
                  )}
                >
                  {c.sortValue && onSort ? (
                    <button
                      onClick={() => onSort(c.id)}
                      className={cn(
                        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active && "text-foreground",
                        c.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {c.header}
                      {active ? (
                        sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            const isSelected = selection?.selected.has(id);
            const canSelect = selection && (selection.isSelectable?.(id) ?? true);
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                // Keyboard parity for clickable rows: Tab to a row, Enter/Space opens it.
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  onRowClick && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  "group transition-colors",
                  onRowClick && "cursor-pointer",
                  isSelected || activeRowId === id ? "bg-primary-soft/60" : "hover:bg-accent/70",
                  rowClassName?.(row),
                )}
              >
                {selection && (
                  <td className="w-10 border-b border-border py-2.5 pl-4 pr-1 align-middle" onClick={(e) => e.stopPropagation()}>
                    {canSelect && (
                      <Checkbox aria-label={selection.rowLabel(id)} checked={!!isSelected} onChange={() => selection.onToggle(id)} />
                    )}
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "border-b border-border px-3 py-2.5 align-middle first:pl-4 last:pr-4",
                      c.align === "right" && "text-right",
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && empty}
    </div>
  );
}

/* ─────────────────────────── controls ─────────────────────────── */

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  ...props
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      className="size-4 cursor-pointer rounded-[4px] border-input align-middle accent-[var(--ui-accent)] disabled:cursor-default disabled:opacity-40"
      {...props}
    />
  );
}

/** Compact native select styled to match the console. */
export function SelectFilter({
  value,
  onChange,
  label,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-8 cursor-pointer rounded-[8px] border border-input bg-surface pl-2.5 pr-7 text-[12.5px] text-foreground transition-[border-color,box-shadow] hover:bg-accent focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20",
        value !== "all" && "border-primary/50 bg-primary-soft/50 text-primary",
        className,
      )}
    >
      {children}
    </select>
  );
}

/** Card wrapping a table: toolbar on top, table, pagination below. */
export function TableCard({ toolbar, children, className }: { toolbar?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-[12px] border border-border bg-surface shadow-ui-sm", className)}>
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">{toolbar}</div>}
      {children}
    </section>
  );
}

export function TableEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-14 text-center text-[13px] text-muted-foreground">{children}</div>;
}

/** Floating bar that slides up while rows are selected. */
export function BulkBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  noun: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          role="toolbar"
          aria-label="Bulk actions"
          className="fixed inset-x-4 bottom-5 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-[14px] border border-border bg-popover py-2 pl-4 pr-2 text-[13px] shadow-ui-lg lg:left-[var(--shell-offset)]"
        >
          <span className="tabular font-medium">
            {count} {noun}
            {count === 1 ? "" : "s"} selected
          </span>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          {children}
          <button
            onClick={onClear}
            aria-label="Clear selection"
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A row of labelled figures above a table ("1,284 total · 212 providers"). */
export function SummaryStrip({ items }: { items: { icon?: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 shadow-ui-sm">
          {Icon && <Icon className="size-3.5 text-muted-foreground" />}
          <span className="tabular text-[14px] font-semibold">{value}</span>
          <span className="text-[12px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Rows for the current page. */
export function usePaged<T>(rows: T[], page: number, pageSize: number) {
  return useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
}
