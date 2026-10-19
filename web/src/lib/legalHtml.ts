import { PRIVACY_CONTENT, TERMS_CONTENT, type LegalDoc } from "./legalText";

export type LegalDocKey = "terms" | "privacy";

const DOCS: Record<LegalDocKey, LegalDoc> = {
  terms: TERMS_CONTENT,
  privacy: PRIVACY_CONTENT,
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped doc title, e.g. "Terms &amp; Conditions". */
export function legalTitleHtml(doc: LegalDocKey): string {
  return escapeHtml(DOCS[doc].title);
}

/**
 * Renders only the title/heading/body fields of the shared legal text, so
 * source comments (such as the draft/legal-review note) can never reach a page.
 */
export function renderLegalBody(doc: LegalDocKey, extraClass = ""): string {
  const cls = extraClass ? `auth-doc-body ${extraClass}` : "auth-doc-body";
  const sections = DOCS[doc].sections
    .map(
      (s) =>
        `<div class="auth-doc-section"><h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body)}</p></div>`,
    )
    .join("\n");
  return `<div class="${cls}">\n${sections}\n</div>`;
}

/**
 * Replaces the legal body inside each sign-up modal doc panel of the home
 * markup with the shared text. Throws if a panel is not found exactly once.
 */
export function injectLegalBodies(markup: string): string {
  let out = markup;
  for (const doc of ["terms", "privacy"] as const) {
    const marker = `data-doc="${doc}"`;
    const block = out.indexOf(marker);
    if (block < 0 || out.indexOf(marker, block + 1) >= 0) {
      throw new Error(`Expected exactly one "${marker}" panel in home markup`);
    }
    const start = out.indexOf('<div class="auth-doc-body">', block);
    const end = out.indexOf("<button", start);
    if (start < 0 || end < 0) throw new Error(`Legal body for "${doc}" not found in home markup`);
    out = out.slice(0, start) + renderLegalBody(doc) + "\n              " + out.slice(end);
  }
  return out;
}
