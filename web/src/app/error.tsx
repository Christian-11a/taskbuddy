"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Catches any render/runtime error thrown below the root layout. Without this,
 * a single component throwing takes the whole console to a blank screen (or
 * Next's raw stack trace in production), with no way back other than the
 * browser's own reload button.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No error-reporting service is wired up yet, so the console is the only
    // place this survives. Keeps the digest, which is the one handle you get
    // on a production error whose message has been stripped.
    console.error("Admin console error:", error);
  }, [error]);

  return (
    <div
      className="flex flex-col items-center justify-center h-screen px-6 text-center"
      style={{ background: "var(--bg-main)" }}
    >
      <div
        className="flex items-center justify-center rounded-2xl mb-4"
        style={{ width: 52, height: 52, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
      >
        <AlertTriangle size={22} style={{ color: "var(--danger-text)" }} />
      </div>
      <div className="text-white font-bold mb-2" style={{ fontSize: "var(--fs-xl)" }}>Something went wrong</div>
      <div style={{ fontSize: "var(--fs-md)", color: "var(--text-muted)", maxWidth: 420, marginBottom: "var(--sp-5)" }}>
        The console hit an unexpected error. Trying again usually clears it — if
        it keeps happening, the details are in the browser console.
        {error.digest && (
          <div style={{ fontSize: "var(--fs-xs)", marginTop: "var(--sp-2)", fontFamily: "monospace" }}>Ref: {error.digest}</div>
        )}
      </div>
      <div className="flex gap-2.5">
        <button
          onClick={reset}
          className="btn-primary"
          style={{ borderRadius: "var(--r-md)", padding: "9px 18px", fontSize: "var(--fs-md)" }}
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "9px 18px", fontSize: "var(--fs-md)", color: "var(--text-light)", textDecoration: "none" }}
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
