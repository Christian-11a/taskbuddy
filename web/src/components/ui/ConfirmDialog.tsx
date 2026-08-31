"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Plain description, e.g. "Cancel booking BK-0042?" */
  message: string;
  /** Extra content below the message — a reason/note field, for example. */
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red styling + warning icon for destructive actions (the default —
   *  every current caller cancels/suspends/rejects something). */
  danger?: boolean;
  /** Disables both buttons and swaps the confirm label to a "…ing" state,
   *  and blocks Escape/backdrop-close so an in-flight request can't be
   *  abandoned mid-air from the caller's point of view. */
  busy?: boolean;
  /** Disables just the confirm button (e.g. a required reason is empty) —
   *  independent of `busy` so the dialog can still be dismissed. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shared confirmation modal for the console's destructive actions (cancel
 * booking, reject verification, …). Centralising this in one place — rather
 * than each page re-inventing its own inline prompt — means every destructive
 * action gets the same Escape-to-close, backdrop-click-to-close, and
 * focus-on-open behavior for free.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Portals need a browser document; this flips true after mount so the
  // server-rendered pass (which has no document.body to portal into) and the
  // client's first render stay identical, avoiding a hydration mismatch.
  const [mounted, setMounted] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect --
     Same documented exception as AppContext's session restore: syncing from
     "is this running in a browser yet" isn't state derived from props/state,
     it's an external fact the server can't know — reading it during render
     instead would just move the hydration mismatch, not remove it. */
  useEffect(() => {
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open) return;
    // Remember what had focus so it can be handed back on close — otherwise
    // dismissing the dialog drops focus to the top of the document and a
    // keyboard user has to tab all the way back to where they were.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        onCancel();
        return;
      }
      // Focus trap: without this, Tab walks straight out of the dialog and
      // into the page behind it, which is still fully interactive — a
      // keyboard user could "Cancel" the dialog by tabbing away and clicking
      // something destructive underneath.
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Wrap around at both ends, including when focus has escaped already.
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    // Focus the dialog itself so Escape/Tab work immediately without a click.
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on open/busy transitions, not on every onCancel identity change
  }, [open, busy]);

  if (!open || !mounted) return null;

  // Rendered via a portal straight into <body>, not wherever the caller
  // happens to sit in the tree. A `position: fixed` element inside any
  // ancestor with a CSS `transform` (Sidebar's slide/collapse animation, for
  // one) stops being fixed to the viewport and becomes fixed to that
  // ancestor instead — the portal sidesteps the whole class of bug rather
  // than requiring every future caller to know not to nest this under a
  // transformed element.
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center theme-portal"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 200, padding: 16 }}
      onClick={() => !busy && onCancel()}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl outline-none"
        style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", width: "100%", maxWidth: 380, padding: "var(--sp-5)", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          {danger && (
            <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 32, height: 32, background: "rgba(239,68,68,0.15)" }}>
              <AlertTriangle size={15} style={{ color: "var(--danger-text)" }} />
            </div>
          )}
          <div>
            <div id="confirm-dialog-title" className="text-white font-semibold" style={{ fontSize: "var(--fs-md)" }}>{title}</div>
            <div id="confirm-dialog-message" style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--sp-1)" }}>{message}</div>
          </div>
        </div>

        {children && <div className="mb-4">{children}</div>}

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="font-semibold transition-colors disabled:opacity-40"
            style={{ background: "transparent", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "7px 14px", fontSize: "var(--fs-xs)", color: "var(--text-light)", cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            autoFocus
            className="font-semibold transition-colors disabled:opacity-40"
            style={
              danger
                ? { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: "var(--r-md)", padding: "7px 14px", fontSize: "var(--fs-xs)", color: "var(--danger-text)", cursor: busy || confirmDisabled ? "default" : "pointer", fontFamily: "inherit" }
                : { background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.4)", borderRadius: "var(--r-md)", padding: "7px 14px", fontSize: "var(--fs-xs)", color: "var(--indigo-light)", cursor: busy || confirmDisabled ? "default" : "pointer", fontFamily: "inherit" }
            }
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
