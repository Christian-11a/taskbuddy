/** Calendar day as YYYY-MM-DD. ISO timestamps keep their date prefix so a timezone cannot shift them. */
export function calendarDay(value: string): string {
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (iso) return iso[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive from/to. Empty bounds are open. A value with no readable date fails a bounded range. */
export function inDateRange(value: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const day = calendarDay(value);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Service name from a history subject `Certificate: <service> - <title>`. Identity rows have none. */
export function certificateCategory(subject: string): string | null {
  const prefix = "Certificate: ";
  if (!subject.startsWith(prefix)) return null;
  const rest = subject.slice(prefix.length);
  const split = rest.indexOf(" - ");
  const name = (split === -1 ? rest : rest.slice(0, split)).trim();
  return name || null;
}
