import { describe, expect, it } from "vitest";
import { resolveInitialTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("uses the stored preference when there is one", () => {
    expect(resolveInitialTheme(true, false)).toBe(true);
    expect(resolveInitialTheme(false, true)).toBe(false);
  });
  it("falls back to the OS setting when nothing is stored", () => {
    expect(resolveInitialTheme(undefined, true)).toBe(true);
    expect(resolveInitialTheme(undefined, false)).toBe(false);
  });
});
