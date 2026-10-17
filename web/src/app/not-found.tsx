"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "../styles/promo.css";
import { Compass } from "lucide-react";

/** Now that pages have real URLs, a mistyped one is reachable — so it needs an
 *  answer other than Next's default black-and-white 404.
 *
 *  This one file serves every unmatched URL. Admin paths keep the admin console
 *  message; everything else gets the public promo-style page. */
export default function NotFound() {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || (pathname?.startsWith("/admin/") ?? false);
  return isAdmin ? <AdminNotFound /> : <PublicNotFound />;
}

function AdminNotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen px-6 text-center"
      style={{ background: "var(--bg-main)" }}
    >
      <div
        className="flex items-center justify-center rounded-2xl mb-4"
        style={{ width: 52, height: 52, background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.2)" }}
      >
        <Compass size={22} style={{ color: "var(--indigo-light)" }} />
      </div>
      <div className="text-white font-bold mb-2" style={{ fontSize: "var(--fs-xl)" }}>Page not found</div>
      <div style={{ fontSize: "var(--fs-md)", color: "var(--text-muted)", maxWidth: 380, marginBottom: "var(--sp-5)" }}>
        That URL doesn&apos;t match any page in the admin console.
      </div>
      <Link
        href="/admin/dashboard"
        className="btn-primary inline-block"
        style={{ borderRadius: "var(--r-md)", padding: "9px 18px", fontSize: "var(--fs-md)", textDecoration: "none" }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}

function PublicNotFound() {
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
            <p className="eyebrow">Page not found</p>
            <h1 className="account-heading">We couldn&apos;t find that page.</h1>
            <p className="account-lede">The link may be old or mistyped.</p>
            <Link className="button button--quiet" href="/">Back to homepage</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
