// ─── CSV export ───────────────────────────────────────────────────────────────
// Client-side only. Every table the console renders is already fully loaded in
// the browser, so exporting needs no backend endpoint and no extra request —
// it serialises the rows already on screen.

/** RFC 4180 quoting: wrap in quotes when the value contains a comma, quote, or newline. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/**
 * Triggers a browser download of `content` as `filename`.
 *
 * The BOM is deliberate: without it Excel opens UTF-8 CSVs in the system
 * codepage and mangles the peso sign and any non-ASCII name.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** `analytics-2026-08-03.csv` — dated so repeated exports don't overwrite each other. */
export function datedFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().split("T")[0]}.csv`;
}
