import { describe, expect, it } from "vitest";
import { resolveInitialTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("uses the stored preference when there is one", () => {
    expect(resolveInitialTheme(true)).toBe(true);
    expect(resolveInitialTheme(false)).toBe(false);
  });
  it("is light when nothing is stored, whatever the operating system prefers", () => {
    expect(resolveInitialTheme(undefined)).toBe(false);
  });
});
