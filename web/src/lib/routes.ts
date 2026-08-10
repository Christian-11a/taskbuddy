// ─── Routes ───────────────────────────────────────────────────────────────────
// The single place that maps a Page id to its URL and back. Every admin page id
// is already a valid URL slug, so the mapping is mechanical — but keeping it
// here means the sidebar, the header title, and the active-item highlight all
// agree, and a new page needs one entry rather than three scattered edits.

import type { Page } from "@/lib/domain";

export const PAGE_TITLES: Record<Page, string> = {
  dashboard: "Overview",
  verifications: "Verifications",
  users: "User Management",
  transactions: "Transactions",
  disputes: "Disputes",
  bookings: "Bookings",
  "activity-log": "Activity Log",
  "audit-log": "Audit Log",
  reports: "Reports & Analytics",
  settings: "Settings",
};

const PAGES = Object.keys(PAGE_TITLES) as Page[];

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
