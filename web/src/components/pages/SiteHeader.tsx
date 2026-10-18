"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GET_APP_HREF } from "@/lib/getApp";

/** React version of the homepage header, linking back to the homepage sections. */
export function SiteHeader({ current }: { current?: "guide" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="TaskBuddy home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/promo/taskbuddy-logo-96.png" alt="" width={42} height={42} />
        <span className="wordmark__text">
          <strong>TaskBuddy</strong>
          <small>Everyday work, sorted.</small>
        </span>
      </Link>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Menu</span>
      </button>
      <nav
        className={open ? "site-nav is-open" : "site-nav"}
        id="site-nav"
        aria-label="Primary navigation"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) close();
        }}
      >
        <Link href="/#stories">How it works</Link>
        <Link href="/#features">Features</Link>
        <Link href="/#services">Services</Link>
        <Link href="/#faq">FAQ</Link>
        <Link href="/guide" aria-current={current === "guide" ? "page" : undefined}>
          Guide
        </Link>
        <Link className="site-nav__cta site-nav__cta--primary site-nav__cta--mobile" href={GET_APP_HREF}>
          Get the app
        </Link>
      </nav>
      <div className="site-nav__actions">
        <Link className="site-nav__cta site-nav__cta--primary" href={GET_APP_HREF}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Get the app
        </Link>
      </div>
    </header>
  );
}
