"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
    <>
      <div
        className="fixed inset-0"
        style={{
          background: "rgba(3,7,11,0.56)",
          zIndex: 150,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease",
        }}
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
        className="fixed top-0 right-0 h-full flex flex-col outline-none theme-portal"
        style={{
          width: "min(520px, 92vw)",
          background: "var(--panel-bg)",
          borderLeft: "1px solid var(--panel-border)",
          zIndex: 160,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s ease",
          boxShadow: "-24px 0 60px rgba(0,0,0,0.34)",
        }}
      >
        <div className="flex items-center justify-between flex-shrink-0" style={{ padding: "20px 22px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div id="review-drawer-title" className="text-white font-bold" style={{ fontSize: 17 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            style={{ width: 30, height: 30, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 22px" }}>
          {children}
        </div>

        {footer && (
          <div className="flex-shrink-0 flex gap-2" style={{ padding: "14px 22px 18px", borderTop: "1px solid var(--border)", background: "var(--bg-header)" }}>
            {footer}
          </div>
        )}
      </aside>
    </>,
    document.body,
  );
}

/** Field label + value pair, matching the drawer's detail-grid style. */
export function DrawerField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 12, color: "var(--text-light)" }}>{value}</div>
    </div>
  );
}

/** Section wrapper with consistent spacing/divider inside a drawer body. */
export function DrawerSection({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}
