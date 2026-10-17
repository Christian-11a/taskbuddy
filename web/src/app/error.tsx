"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "../styles/promo.css";
import { AlertTriangle } from "lucide-react";

/**
 * Catches any render/runtime error thrown below the root layout. Without this,
 * a single component throwing takes the whole console to a blank screen (or
 * Next's raw stack trace in production), with no way back other than the
 * browser's own reload button.
 *
 * This one file serves every route. Admin paths keep the admin console
 * message; everything else gets the public promo-style page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || (pathname?.startsWith("/admin/") ?? false);

  useEffect(() => {
    // No error-reporting service is wired up yet, so the console is the only
    // place this survives. Keeps the digest, which is the one handle you get
    // on a production error whose message has been stripped.
    console.error("Admin console error:", error);
  }, [error]);

  return isAdmin ? (
    <AdminError error={error} reset={reset} />
  ) : (
    <PublicError error={error} reset={reset} />
  );
}

function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          href="/admin/dashboard"
          className="font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "9px 18px", fontSize: "var(--fs-md)", color: "var(--text-light)", textDecoration: "none" }}
        >
          Back to dashboard
        </a>
      </div>
    </div>
  );
}

function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="promo-site">
      <div className="account-shell">
        <div className="account-topbar">
          <Link className="wordmark" href="/" aria-label="TaskBuddy home">
            <img src="/promo/taskbuddy-logo-96.png" alt="" width={42} height={42} />
            <span className="wordmark__text">
              <strong>TaskBuddy</strong>
              <small>Everyday work, sorted.</small>
            </span>
          </Link>
        </div>
        <main className="account-main">
          <div className="account-card">
            <p className="eyebrow">Something went wrong</p>
            <h1 className="account-heading">This page didn&apos;t load.</h1>
            <p className="account-lede">Please try again.</p>
            {error.digest && (
              <p className="account-lede" style={{ fontFamily: "monospace", fontSize: ".8rem" }}>Ref: {error.digest}</p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", justifyContent: "center" }}>
              <button type="button" className="button" onClick={reset}>Try again</button>
              <Link className="button button--quiet" href="/">Back to homepage</Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
