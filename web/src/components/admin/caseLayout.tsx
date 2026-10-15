"use client";

import { useId, useLayoutEffect, useState, type ComponentType, type ReactNode, type RefObject } from "react";

/**
 * The case detail is two columns once its own pane is at least this wide (px).
 * The pane is measured, not the window: with the case list open, a wide window
 * still leaves the detail too narrow for two columns.
 */
export const TWO_COLUMN_MIN_WIDTH = 640;

/**
 * Whether the element is at least `minWidth` px wide, kept up to date as the
 * pane resizes. Where ResizeObserver does not exist it stays true, so the full
 * layout is shown rather than a cut-down one.
 */
export function useWidthAtLeast(ref: RefObject<HTMLElement | null>, minWidth: number): boolean {
  const [atLeast, setAtLeast] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setAtLeast(width >= minWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, minWidth]);
  return atLeast;
}

/** An evidence card on a case: an icon, a title and a count over its content. */
export function CaseCard({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 overflow-hidden rounded-[12px] border border-border bg-surface shadow-ui-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-surface-2 text-muted-foreground">
            <Icon className="size-3.5" />
          </span>
          <h3 id={headingId} className="truncate text-[13.5px] font-semibold tracking-tight">
            {title}
          </h3>
        </div>
        {count !== undefined && (
          <span className="tabular shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">{count}</span>
        )}
      </header>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}
