import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalPage } from "./LegalPage";

describe("LegalPage", () => {
  it("renders the terms from the shared text", () => {
    const html = renderToStaticMarkup(<LegalPage doc="terms" />);
    expect(html).toContain("Terms &amp; Conditions");
    expect(html).toContain("6. Finality of released payments and disclaimer");
    expect(html).not.toMatch(/draft|legal review/i);
  });
  it("renders the privacy policy", () => {
    const html = renderToStaticMarkup(<LegalPage doc="privacy" />);
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Retention");
  });
});
