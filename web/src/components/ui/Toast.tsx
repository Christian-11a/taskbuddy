"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export type ToastKind = "success" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** Transient feedback for an action that already happened. Errors linger
   *  longer than successes — a failure the admin missed is worse than a
   *  success they missed. */
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const DISMISS_MS: Record<ToastKind, number> = { success: 4000, error: 8000 };

/**
 * Action feedback for the console's mutations.
 *
 * Before this, every mutation handler was `try { await … } finally { clear
 * busy state }` with no `catch`: a failed suspend/approve/cancel rejected
 * into nothing, the button snapped back to normal, and the admin was left
 * assuming it worked. Errors now surface here instead of being swallowed.
 *
 * Deliberately separate from `AppContext`'s `loadError` banner: that one is
 * about the page's data being wrong *right now* and needs to stay on screen,
 * whereas these are about an action that just finished and should get out of
 * the way on their own.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  /* eslint-disable react-hooks/set-state-in-effect --
     Portals need a browser document; flipping this after mount keeps the
     server pass and the client's first render identical. Same documented
     exception as ConfirmDialog. */
  useEffect(() => {
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, DISMISS_MS[kind]),
      );
    },
    [],
  );

  // Clear any pending timers if the provider itself goes away.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="fixed flex flex-col gap-2"
            style={{ bottom: 20, right: 20, zIndex: 300, maxWidth: "min(380px, calc(100vw - 40px))" }}
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                // Errors interrupt (assertive); successes are announced politely.
                role={t.kind === "error" ? "alert" : "status"}
                className="flex items-start gap-2.5 rounded-xl"
                style={{
                  background: "var(--panel-bg)",
                  border: `1px solid ${t.kind === "error" ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.3)"}`,
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "var(--text-light)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                }}
              >
                {t.kind === "error" ? (
                  <AlertTriangle size={14} className="flex-shrink-0" style={{ color: "var(--danger-text)", marginTop: 1 }} />
                ) : (
                  <CheckCircle2 size={14} className="flex-shrink-0" style={{ color: "var(--success-text)", marginTop: 1 }} />
                )}
                <span className="flex-1">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="flex-shrink-0 transition-opacity hover:opacity-70"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0, marginTop: 1 }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
