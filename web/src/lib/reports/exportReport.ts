import { exportMasks } from "@/lib/export/anonymize";
import { toCsv } from "@/lib/export/csv";
import { RATING_UNAVAILABLE, type BreakdownRow, type PlatformReport, type ProviderReport } from "./build";

export interface CsvFile {
  filename: string;
  csv: string;
}

/** "Mark Santos" → "mark-santos". Empty and punctuation-only names fall back to "provider". */
export function reportNameSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "provider";
}

export function platformCsvFilename(from: string, to: string): string {
  return `taskbuddy-platform-${from}_${to}.csv`;
}

export function providerCsvFilename(providerName: string, from: string, to: string): string {
  return `taskbuddy-provider-${reportNameSlug(providerName)}-${from}_${to}.csv`;
}

function blocks(labels: string[], tables: string[]): string {
  return labels.map((label, i) => `${label}\r\n${tables[i]}`).join("\r\n\r\n");
}

function moneyLine(row: BreakdownRow): unknown[] {
  return [row.label, row.bookings, row.grossReleased, row.commission, row.providerPayouts, row.refunds];
}

const BREAKDOWN_HEADERS = ["Bookings", "Gross released payments", "TaskBuddy commission", "Provider payouts", "Refunds"];

export function platformReportCsv(report: PlatformReport, from: string, to: string): CsvFile {
  const summary = toCsv(
    ["Metric", "Value"],
    [
      ["Bookings", report.bookings],
      ["Completed", report.completed],
      ["Cancelled", report.cancelled],
      ["Disputed", report.disputed],
      ["Gross released payments", report.money.grossReleased],
      ["TaskBuddy commission", report.money.commission],
      ["Provider payouts", report.money.providerPayouts],
      ["Refunds", report.money.refunds],
    ],
  );
  const categories = toCsv(["Category", ...BREAKDOWN_HEADERS], report.byCategory.map(moneyLine));
  const months = toCsv(["Month", ...BREAKDOWN_HEADERS], report.byMonth.map(moneyLine));
  return {
    filename: platformCsvFilename(from, to),
    csv: blocks(["SUMMARY", "BY CATEGORY", "BY MONTH"], [summary, categories, months]),
  };
}

export function providerReportCsv(report: ProviderReport, from: string, to: string, anonymize: boolean): CsvFile {
  const mask = exportMasks(anonymize);
  const summary = toCsv(
    ["Metric", "Value"],
    [
      ["Provider", mask.name(report.providerName) ?? ""],
      ["Jobs", report.jobs],
      ["Completed", report.completed],
      ["Cancelled", report.cancelled],
      ["Disputed", report.disputed],
      ["Gross earned", report.grossEarned],
      ["Platform fee", report.platformFee],
      ["Net received", report.netReceived],
      ["Average rating", RATING_UNAVAILABLE],
    ],
  );
  const jobs = toCsv(
    ["Date", "Client", "Service", "Amount", "Fee", "Status"],
    report.jobRows.map((row) => [row.date.slice(0, 10), mask.name(row.client) ?? "", row.service, row.amount, row.fee, row.status]),
  );
  return {
    filename: providerCsvFilename(anonymize ? (mask.name(report.providerName) ?? "") : report.providerName, from, to),
    csv: blocks(["SUMMARY", "JOBS"], [summary, jobs]),
  };
}
