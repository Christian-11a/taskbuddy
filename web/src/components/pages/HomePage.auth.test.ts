import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_MARKUP } from "./HomePage.markup";

const authScript = readFileSync(path.resolve("public/promo/auth.js"), "utf8");
const originalFetch = window.fetch;

describe("signup document dialog", () => {
  const windowListeners = vi.spyOn(window, "addEventListener");
  const documentListeners = vi.spyOn(document, "addEventListener");

  afterAll(() => {
    windowListeners.mockRestore();
    documentListeners.mockRestore();
  });

  beforeEach(() => {
    windowListeners.mockClear();
    documentListeners.mockClear();
    window.history.replaceState(null, "", "/#signup");
    document.body.innerHTML = HOME_MARKUP;
    runInNewContext(authScript, {
      window,
      document,
      history: window.history,
      URLSearchParams,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => window.fetch(input, init),
    });
  });

  afterEach(() => {
    for (const [type, listener, options] of windowListeners.mock.calls) {
      window.removeEventListener(type, listener, options);
    }
    for (const [type, listener, options] of documentListeners.mock.calls) {
      document.removeEventListener(type, listener, options);
    }
    document.body.innerHTML = "";
    document.documentElement.classList.remove("has-modal-open");
    document.body.classList.remove("has-modal-open");
    window.fetch = originalFetch;
    window.history.replaceState(null, "", "/");
  });

  it.each([
    ["terms", "Terms & Conditions"],
    ["privacy", "Privacy Policy"],
  ])("names the %s dialog after its visible heading and preserves Back/Close", (doc, title) => {
    const modal = document.querySelector<HTMLElement>(".auth-modal")!;
    const overlay = document.querySelector<HTMLElement>("[data-auth-overlay]")!;
    const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

    click(`[data-open-doc="${doc}"]`);
    expect(modal).toHaveAccessibleName(title);
    expect(document.getElementById(modal.getAttribute("aria-labelledby")!)?.closest("[hidden]")).toBeNull();
    expect(document.querySelectorAll("#auth-modal-heading")).toHaveLength(1);

    click("[data-doc-back]");
    expect(modal).toHaveAccessibleName("Create account");
    expect(document.getElementById("panel-signup")).not.toHaveAttribute("hidden");

    click(`[data-open-doc="${doc}"]`);
    expect(modal).toHaveAccessibleName(title);
    click("[data-close-modal]");
    expect(overlay.hidden).toBe(true);
  });

  it("loads active provider categories with their backend IDs", async () => {
    window.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 6, name: "Electrical" }, { id: 9, name: "Painting" }],
    }) as typeof fetch;
    document.querySelector<HTMLElement>('[data-role-option="provider"]')!.click();

    await vi.waitFor(() => {
      const options = Array.from(document.querySelectorAll<HTMLOptionElement>("#signup-category option"));
      expect(options.map((option) => [option.value, option.textContent])).toEqual([
        ["", "Select your skill…"],
        ["6", "Electrical"],
        ["9", "Painting"],
      ]);
    });
    expect(window.fetch).toHaveBeenCalledWith("/api/categories", undefined);
  });

  it("blocks provider sign-up when categories cannot be loaded", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: false }) as typeof fetch;
    document.querySelector<HTMLElement>('[data-role-option="provider"]')!.click();

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLSelectElement>("#signup-category")!.disabled).toBe(true);
      expect(document.querySelector("[data-signup-status]")?.textContent).toContain("Could not load skill categories.");
    });
  });
});
