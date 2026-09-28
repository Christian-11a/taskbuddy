import { Calculator } from "lucide-react";

/**
 * Shown on Dashboard and Reports while /admin/analytics/summary is failing and
 * the figures are rebuilt in the browser from the list endpoints. Same
 * formulas as the server, so it's a note rather than a warning.
 */
export function AnalyticsSourceNote() {
  return (
    <div role="note" className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-info/25 bg-info-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-info">
      <Calculator className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        The analytics service is down, so these figures are calculated in your browser from the raw records, using the same
        formulas as the server. They switch back automatically once it recovers.
      </span>
    </div>
  );
}
