// ─── Export anonymization ─────────────────────────────────────────────────────
// Masks personal details in CSV exports when the admin's "Anonymize exports"
// preference is on. Client-side only, like the export itself: the console and
// the API still show full values. Ids, amounts, statuses, dates and cities are
// left alone so an anonymized export stays useful for reporting.

/** "Maria Dela Cruz" → "M. D. C."; empty stays empty. */
export function maskName(value: string | null | undefined): string {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.map((p) => `${Array.from(p)[0].toUpperCase()}.`).join(" ");
}

/** "maria@example.com" → "m***@example.com". The domain is kept for grouping. */
export function maskEmail(value: string | null | undefined): string {
  const email = (value ?? "").trim();
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${Array.from(email)[0]}***${email.slice(at)}`;
}

/** "+63 917 123 4567" → "***67": only the last two digits survive. */
export function maskPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `***${digits.slice(-2)}`;
}

/**
 * Returns the masking helpers for one export. With anonymization off every
 * helper returns the value unchanged, so call sites stay a single code path.
 */
export function exportMasks(anonymize: boolean) {
  const keep = (v: string | null | undefined) => v;
  return anonymize
    ? { name: maskName, email: maskEmail, phone: maskPhone }
    : { name: keep, email: keep, phone: keep };
}
