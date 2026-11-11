import { addMonths } from "@/lib/services/monthSeries";
import type { RangePreset, ReportPeriod, ReportQuery, ReportStatus, ReportTab } from "./types";

const TABS: ReportTab[] = ["platform", "provider"];
const PRESETS: RangePreset[] = ["this", "3", "6", "12", "custom"];
const STATUSES: ReportStatus[] = ["all", "completed", "cancelled", "disputed"];

export const DEFAULT_REPORT_QUERY: ReportQuery = {
  tab: "platform",
  preset: "12",
  from: "",
  to: "",
  status: "all",
  category: "all",
  providerId: "",
};

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** UTC calendar day, matching the month keys the rest of the console uses. */
export function utcDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function inRange(iso: string | null | undefined, from: string, to: string): boolean {
  const day = utcDay(iso);
  return day.length === 10 && day >= from && day <= to;
}

/**
 * Inclusive period for a preset. "This month" and "Last N months" end today (UTC)
 * and start on the first of the earliest month in the window. Custom uses the
 * two dates, swapped when they were entered backwards.
 */
export function periodFor(preset: RangePreset, from: string, to: string, now: Date): ReportPeriod {
  const today = now.toISOString().slice(0, 10);
  if (preset === "custom") {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : today;
    return start <= end ? { from: start, to: end } : { from: end, to: start };
  }
  if (preset === "this") return { from: `${today.slice(0, 7)}-01`, to: today };
  const months = preset === "3" ? 3 : preset === "6" ? 6 : 12;
  const startMonth = addMonths(today.slice(0, 7), -(months - 1));
  return { from: `${startMonth}-01`, to: today };
}

/** Every "YYYY-MM" touched by the period, oldest first. Capped so a bad pair cannot loop. */
export function monthsInRange(from: string, to: string): string[] {
  const start = from.slice(0, 7);
  const end = to.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) return [];
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end && months.length < 36) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

export function parseReportQuery(params: URLSearchParams): ReportQuery {
  return {
    tab: pick(params.get("tab"), TABS, DEFAULT_REPORT_QUERY.tab),
    preset: pick(params.get("preset"), PRESETS, DEFAULT_REPORT_QUERY.preset),
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    status: pick(params.get("status"), STATUSES, DEFAULT_REPORT_QUERY.status),
    category: params.get("category") || "all",
    providerId: params.get("provider") ?? "",
  };
}

export function serializeReportQuery(query: ReportQuery, period: ReportPeriod): string {
  const params = new URLSearchParams();
  params.set("tab", query.tab);
  params.set("preset", query.preset);
  params.set("from", query.preset === "custom" ? period.from : period.from);
  params.set("to", period.to);
  params.set("status", query.status);
  params.set("category", query.category);
  if (query.providerId) params.set("provider", query.providerId);
  return params.toString();
}

export function readReportQuery(search: string): ReportQuery {
  return parseReportQuery(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search));
}
