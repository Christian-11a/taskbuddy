"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** The detail body — grid of fields, documents, notes, etc. */
  children: React.ReactNode;
  /** Footer actions (approve/reject, resolve, etc.) — rendered as a row of
   *  buttons, same slot pattern as ConfirmDialog. */
  footer?: React.ReactNode;
}

/**
 * Shared slide-out review panel for Verifications/Disputes/Users — the
 * "open a record, see everything, act on it" pattern used across the admin
 * console, instead of each page hand-rolling its own inline expand. Modeled
 * on ConfirmDialog's portal + focus-trap + Escape behavior for consistency.
 */
export function ReviewDrawer({ open, title, subtitle, onClose, children, footer }: ReviewDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- same documented exception as ConfirmDialog */
  useEffect(() => {
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on the open transition, not on every onClose identity change (same as ConfirmDialog); including onClose here re-focuses the panel on every parent re-render, stealing focus from anything the admin is typing into inside the drawer
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className="ui-root theme-portal">
      <div
        className={cn(
          "fixed inset-0 z-[150] bg-overlay backdrop-blur-[1px] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-drawer-title"
        aria-hidden={!open}
        inert={!open ? true : undefined}
        tabIndex={-1}
        className={cn(
          "fixed right-0 top-0 z-[160] flex h-full w-[min(540px,94vw)] flex-col border-l border-border bg-popover text-popover-foreground shadow-ui-lg outline-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div id="review-drawer-title" className="truncate text-[17px] font-semibold tracking-tight text-foreground">{title}</div>
            {subtitle && <div className="mt-1 text-[12px] text-muted-foreground">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="flex shrink-0 gap-2 border-t border-border bg-surface-2 px-6 py-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

/** Field label + value pair, matching the drawer's detail-grid style. */
export function DrawerField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">{label}</div>
      <div className="break-words text-[13px] text-foreground">{value}</div>
    </div>
  );
}

/** Section wrapper with consistent spacing/divider inside a drawer body. */
export function DrawerSection({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <section className="mb-5 border-b border-border pb-5 last:mb-0 last:border-b-0 last:pb-0">
      {title && <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</h3>}
      {children}
    </section>
  );
}
