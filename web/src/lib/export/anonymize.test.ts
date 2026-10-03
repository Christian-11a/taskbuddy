import { describe, expect, it } from "vitest";
import { exportMasks, maskEmail, maskName, maskPhone } from "./anonymize";

describe("export anonymization", () => {
  it("reduces names to initials", () => {
    expect(maskName("Maria Dela Cruz")).toBe("M. D. C.");
    expect(maskName("  mal  ")).toBe("M.");
    expect(maskName("")).toBe("");
    expect(maskName(null)).toBe("");
    expect(maskName(undefined)).toBe("");
  });

  it("keeps only the first character and domain of an email", () => {
    expect(maskEmail("maria@example.com")).toBe("m***@example.com");
    expect(maskEmail("")).toBe("");
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@example.com")).toBe("***");
  });

  it("keeps only the last two phone digits", () => {
    expect(maskPhone("+63 917 123 4567")).toBe("***67");
    expect(maskPhone("")).toBe("");
    expect(maskPhone("n/a")).toBe("");
  });

  it("returns values unchanged when anonymization is off", () => {
    const off = exportMasks(false);
    expect(off.name("Maria Cruz")).toBe("Maria Cruz");
    expect(off.email("maria@example.com")).toBe("maria@example.com");
    expect(off.phone("0917 123 4567")).toBe("0917 123 4567");
  });

  it("masks every kind when anonymization is on", () => {
    const on = exportMasks(true);
    expect(on.name("Maria Cruz")).toBe("M. C.");
    expect(on.email("maria@example.com")).toBe("m***@example.com");
    expect(on.phone("0917 123 4567")).toBe("***67");
  });
});
