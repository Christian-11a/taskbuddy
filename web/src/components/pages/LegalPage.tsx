import "../../styles/promo.css";
import { HOME_MARKUP } from "./HomePage.markup";

export type LegalDoc = "terms" | "privacy";

const TITLES: Record<LegalDoc, string> = {
  terms: "Terms &amp; Conditions",
  privacy: "Privacy Policy",
};

/**
 * The document text lives once, in the sign-up modal's doc panel inside
 * HOME_MARKUP (where "I agree" ticks the matching consent box). These
 * standalone pages reuse that exact body so the two can never drift apart.
 */
function docBody(doc: LegalDoc): string {
  const block = HOME_MARKUP.indexOf(`data-doc="${doc}"`);
  const start = HOME_MARKUP.indexOf('<div class="auth-doc-body">', block);
  const end = HOME_MARKUP.indexOf("<button", start);
  if (block < 0 || start < 0 || end < 0) {
    throw new Error(`Legal text for "${doc}" not found in HOME_MARKUP`);
  }
  return HOME_MARKUP.slice(start, end).replace('class="auth-doc-body"', 'class="auth-doc-body legal-body"');
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const other: LegalDoc = doc === "terms" ? "privacy" : "terms";
  const markup = `
    <div class="account-shell">
      <div class="account-topbar">
        <a class="wordmark" href="/" aria-label="TaskBuddy home"><img src="/promo/taskbuddy-logo-96.png" alt="" width="42" height="42" /><span class="wordmark__text"><strong>TaskBuddy</strong><small>Everyday work, sorted.</small></span></a>
      </div>
      <main class="account-main">
        <article class="account-card legal-card">
          <p class="eyebrow">Legal</p>
          <h1 class="account-heading">${TITLES[doc]}</h1>
          ${docBody(doc)}
          <nav class="legal-links" aria-label="Legal pages">
            <a class="button button--quiet" href="/">Back to homepage</a>
            <a class="button button--quiet" href="/${other}">${TITLES[other]}</a>
          </nav>
        </article>
      </main>
    </div>`;
  return (
    <div className="promo-site">
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  );
}
