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
import { cn } from "@/lib/utils";

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
          <div className="ui-root theme-portal fixed bottom-5 right-5 z-[300] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                // Errors interrupt (assertive); successes are announced politely.
                role={t.kind === "error" ? "alert" : "status"}
                className="relative flex items-start gap-2.5 overflow-hidden rounded-[12px] border border-border bg-popover py-3 pl-3.5 pr-3 text-[13px] text-foreground shadow-ui-lg motion-safe:animate-[ui-toast-in_260ms_cubic-bezier(0.16,1,0.3,1)]"
              >
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0 w-[3px]", t.kind === "error" ? "bg-danger" : "bg-ok")}
                />
                {t.kind === "error" ? (
                  <AlertTriangle className="mt-px size-4 shrink-0 text-danger" />
                ) : (
                  <CheckCircle2 className="mt-px size-4 shrink-0 text-ok" />
                )}
                <span className="flex-1 leading-snug">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="-mr-1 -mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-0 left-0 h-[2px] w-full origin-left opacity-40 motion-safe:animate-[ui-toast-timer_linear_forwards]",
                    t.kind === "error" ? "bg-danger" : "bg-ok",
                  )}
                  style={{ animationDuration: `${DISMISS_MS[t.kind]}ms` }}
                />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
