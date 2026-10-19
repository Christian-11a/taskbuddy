import "../../styles/promo.css";
import { legalTitleHtml, renderLegalBody } from "@/lib/legalHtml";

export type LegalDoc = "terms" | "privacy";

// Text comes from the shared module (src/lib/legalText.ts, copied from the app).

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
          <h1 class="account-heading">${legalTitleHtml(doc)}</h1>
          ${renderLegalBody(doc, "legal-body")}
          <nav class="legal-links" aria-label="Legal pages">
            <a class="button button--quiet" href="/">Back to homepage</a>
            <a class="button button--quiet" href="/${other}">${legalTitleHtml(other)}</a>
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
