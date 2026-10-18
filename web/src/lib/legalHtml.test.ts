import { describe, expect, it } from "vitest";
import { escapeHtml, injectLegalBodies, legalTitleHtml, renderLegalBody } from "./legalHtml";
import { PRIVACY_CONTENT, TERMS_CONTENT } from "./legalText";
import { HOME_MARKUP } from "@/components/pages/HomePage.markup";

const NOTE = /draft|legal review|counsel|todo/i;

describe("legalHtml", () => {
  it("renders every section of both documents", () => {
    for (const [key, doc] of [["terms", TERMS_CONTENT], ["privacy", PRIVACY_CONTENT]] as const) {
      const html = renderLegalBody(key);
      expect((html.match(/<h2>/g) ?? []).length).toBe(doc.sections.length);
      for (const s of doc.sections) expect(html).toContain(`<h2>${escapeHtml(s.heading)}</h2>`);
    }
    expect(legalTitleHtml("terms")).toBe("Terms &amp; Conditions");
  });

  it("escapes HTML", () => {
    expect(escapeHtml(`<b onclick="x">&'</b>`)).toBe("&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;");
    expect(renderLegalBody("terms")).not.toMatch(/<(script|b)\b/);
  });

  it("never outputs the draft / legal-review note", () => {
    expect(renderLegalBody("terms")).not.toMatch(NOTE);
    expect(renderLegalBody("privacy")).not.toMatch(NOTE);
  });

  it("replaces the home modal bodies with the shared text", () => {
    const html = injectLegalBodies(HOME_MARKUP);
    expect(html).toContain("1. Nature of the platform");
    expect(html).toContain("Your Rights (RA 10173)");
    expect(html).not.toContain("Platform Facilitator");
    expect(html).not.toMatch(NOTE);
    expect(html.match(/data-doc-accept="terms"/g)).toHaveLength(1);
  });
});
