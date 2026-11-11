import { formatCurrency, formatDate } from "@/lib/adapters";
import { monthLabel } from "@/lib/services/monthSeries";
import { RATING_UNAVAILABLE, type BreakdownRow, type PlatformReport, type ProviderJobRow, type ProviderReport } from "@/lib/reports/build";

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  html, body { background: #fff !important; color: #000 !important; height: auto !important; }
  .app-shell { display: block !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  .app-shell > aside, .app-shell > .ui-overlay, .app-shell header.sticky, .report-screen, .no-print, [role="dialog"], [role="alertdialog"] { display: none !important; }
  .app-shell > div, .app-shell main { display: block !important; height: auto !important; overflow: visible !important; padding: 0 !important; }
  .report-print {
    display: block !important; position: static !important; width: auto !important; height: auto !important;
    overflow: visible !important; clip: auto !important; color: #000 !important; background: #fff !important;
  }
  .report-print, .report-print * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
  .report-print img { background: transparent !important; }
  .report-print table { width: 100%; border-collapse: collapse; margin: 0 0 14px; }
  .report-print th, .report-print td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; text-align: left; }
  .report-print tr { break-inside: avoid; }
  .report-print h1 { font-size: 18px; margin: 8px 0 4px; }
}
@media screen {
  .report-print {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
}
`;

export interface PrintSection {
  title: string;
  headers: string[];
  rows: string[][];
}

function money(n: number): string {
  return formatCurrency(n);
}

export function platformPrintSections(report: PlatformReport): { totals: [string, string][]; sections: PrintSection[] } {
  return {
    totals: [
      ["Bookings", String(report.bookings)],
      ["Completed", String(report.completed)],
      ["Cancelled", String(report.cancelled)],
      ["Disputed", String(report.disputed)],
      ["Gross released payments", money(report.money.grossReleased)],
      ["TaskBuddy commission", money(report.money.commission)],
      ["Provider payouts", money(report.money.providerPayouts)],
      ["Refunds", money(report.money.refunds)],
    ],
    sections: [
      breakdownSection("By service category", "Category", report.byCategory),
      breakdownSection("By month", "Month", report.byMonth, true),
    ],
  };
}

export function providerPrintSections(report: ProviderReport): { totals: [string, string][]; sections: PrintSection[] } {
  return {
    totals: [
      ["Jobs", String(report.jobs)],
      ["Completed", String(report.completed)],
      ["Cancelled", String(report.cancelled)],
      ["Disputed", String(report.disputed)],
      ["Gross earned", money(report.grossEarned)],
      ["Platform fee", money(report.platformFee)],
      ["Net received", money(report.netReceived)],
      ["Average rating", RATING_UNAVAILABLE],
    ],
    sections: [
      {
        title: "Jobs in the period",
        headers: ["Date", "Client", "Service", "Amount", "Fee", "Status"],
        rows: report.jobRows.map((row) => jobCells(row)),
      },
      breakdownSection("By month", "Month", report.byMonth, true),
    ],
  };
}

function jobCells(row: ProviderJobRow): string[] {
  return [formatDate(row.date), row.client, row.service, money(row.amount), money(row.fee), row.status];
}

function breakdownSection(title: string, first: string, rows: BreakdownRow[], month = false): PrintSection {
  return {
    title,
    headers: [first, "Bookings", "Gross released", "Commission", "Provider payouts", "Refunds"],
    rows: rows.map((row) => [
      month ? monthLabel(row.label, true) : row.label,
      String(row.bookings),
      money(row.grossReleased),
      money(row.commission),
      money(row.providerPayouts),
      money(row.refunds),
    ]),
  };
}

export function ReportPrintView({
  title,
  periodLabel,
  filtersLabel,
  generatedLabel,
  totals,
  sections,
}: {
  title: string;
  periodLabel: string;
  filtersLabel: string;
  generatedLabel: string;
  totals: [string, string][];
  sections: PrintSection[];
}) {
  return (
    <section className="report-print" role="region" aria-label="Printable report" aria-hidden="true">
      <style>{PRINT_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/promo/taskbuddy-logo-96.png" alt="" width={42} height={42} />
        <div>
          <strong>TaskBuddy</strong>
          <div style={{ fontSize: 12 }}>Admin report</div>
        </div>
      </div>
      <h1>{title}</h1>
      <p>Period: {periodLabel}</p>
      <p>{filtersLabel}</p>
      <p>{generatedLabel}</p>
      <h2>Totals</h2>
      <table aria-label="Totals">
        <tbody>
          {totals.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sections.map((section) => (
        <div key={section.title}>
          <h2>{section.title}</h2>
          {section.rows.length === 0 ? (
            <p>No rows in this period.</p>
          ) : (
            <table aria-label={section.title}>
              <thead>
                <tr>
                  {section.headers.map((header) => (
                    <th key={header} scope="col">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </section>
  );
}
