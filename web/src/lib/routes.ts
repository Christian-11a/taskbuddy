// ─── Routes ───────────────────────────────────────────────────────────────────
// The single place that maps a Page id to its URL and back. Every admin page id
// is already a valid URL slug, so the mapping is mechanical.

import type { Page } from "@/lib/domain";

// Page ids only — the header shows a static "TaskBuddy Admin" brand label
// rather than a per-page title (each page's own <h1> and browser-tab
// <title> already say what page it is), so this no longer needs display
// strings, just the set of valid slugs.
const PAGES: Page[] = [
  "dashboard",
  "verifications",
  "users",
  "transactions",
  "disputes",
  "bookings",
  "activity-log",
  "audit-log",
  "reports",
  "withdrawals",
  "platform",
  "settings",
];

export function pageToPath(page: Page): string {
  return `/${page}`;
}

/** Null for anything that isn't an admin page (e.g. /login, an unknown URL). */
export function pathToPage(pathname: string): Page | null {
  const slug = pathname.replace(/^\/+|\/+$/g, "");
  return PAGES.find((p) => p === slug) ?? null;
}

/** Where a signed-in admin lands: after login, and from "/". */
export const DEFAULT_PAGE_PATH = pageToPath("dashboard");
export const LOGIN_PATH = "/login";
