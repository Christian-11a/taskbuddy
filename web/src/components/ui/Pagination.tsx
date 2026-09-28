"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Plural label for the count text, e.g. "users", "bookings". */
  itemLabel: string;
}

/**
 * Matches the mockup's `.pagination`/`.pager` — "Showing X–Y of Z" plus a
 * numbered pager with ellipsis for large page counts. Used by every table
 * that can grow past one screenful, so nobody has to scroll a 200-row table
 * to find the bottom.
 */
export function Pagination({ page, pageSize, total, onPageChange, itemLabel }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Show first, last, current ± 1, collapsing the rest into an ellipsis.
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  const btn =
    "grid h-7 min-w-7 place-items-center rounded-[7px] px-1.5 text-[12px] font-medium tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">
      <span className="tabular">
        Showing <span className="font-medium text-foreground">{from}–{to}</span> of {total.toLocaleString()} {itemLabel}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} aria-label="Previous page" className={cn(btn, "hover:bg-accent")}>
            <ChevronLeft className="size-3.5" />
          </button>
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-subtle">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                className={cn(btn, p === page ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
              >
                {p}
              </button>
            ),
          )}
          <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="Next page" className={cn(btn, "hover:bg-accent")}>
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
