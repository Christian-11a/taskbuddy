"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

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

  const btnStyle = (active: boolean): React.CSSProperties => ({
    minWidth: 28,
    height: 28,
    border: `1px solid ${active ? "#2b7f8b" : "var(--border-md)"}`,
    background: active ? "rgba(34,195,214,0.15)" : "var(--chip-bg)",
    color: active ? "var(--indigo-light)" : "var(--text-light)",
    borderRadius: 7,
    fontSize: 10.5,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: "11px 14px", borderTop: "1px solid var(--card-border)", color: "var(--text-muted)", fontSize: 10.5 }}>
      <span>Showing {from}–{to} of {total.toLocaleString()} {itemLabel}</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="Previous page"
            className="flex items-center justify-center disabled:opacity-40"
            style={btnStyle(false)}
          >
            <ChevronLeft size={12} />
          </button>
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} style={{ padding: "0 4px", fontSize: 10.5 }}>…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
                style={btnStyle(p === page)}
              >
                {p}
              </button>
            ),
          )}
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            aria-label="Next page"
            className="flex items-center justify-center disabled:opacity-40"
            style={btnStyle(false)}
          >
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
