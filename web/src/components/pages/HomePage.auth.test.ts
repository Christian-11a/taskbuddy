import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_MARKUP } from "./HomePage.markup";

const authScript = readFileSync(path.resolve("public/promo/auth.js"), "utf8");

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
});
