// ─── CSV export ───────────────────────────────────────────────────────────────
// Client-side only. Every table the console renders is already fully loaded in
// the browser, so exporting needs no backend endpoint and no extra request —
// it serialises the rows already on screen.

/** Text starting with one of these can be run as a formula by Excel / Sheets. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
/** A plain number (e.g. "-500", "+3.5") cannot carry a formula, so it is left alone. */
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * RFC 4180 quoting: wrap in quotes when the value contains a comma, quote, or newline.
 * Text cells that start with a formula trigger get a leading single quote so
 * spreadsheet apps show them as text (CSV formula injection). Numbers are never prefixed.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = String(value);
  if (FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
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
