import { describe, it, expect } from "vitest";
import {
  validateRequired,
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordChange,
  validateDurationDays,
} from "./validation";

describe("validateRequired", () => {
  it("rejects empty and whitespace-only values", () => {
    expect(validateRequired("", "Field")).toBe("Field is required.");
    expect(validateRequired("   ", "Field")).toBe("Field is required.");
  });
  it("accepts non-empty values", () => {
    expect(validateRequired("x", "Field")).toBeNull();
  });
});

describe("validateEmail", () => {
  it("rejects empty", () => {
    expect(validateEmail("")).toBe("Email is required.");
  });
  it("rejects malformed addresses", () => {
    for (const bad of ["plain", "a@b", "a@b.c", "a b@c.com", "a@b c.com", "@x.com", "a@.com"]) {
      expect(validateEmail(bad), bad).toBe("Email must be a valid email address.");
    }
  });
  it("accepts valid addresses (with surrounding whitespace tolerated)", () => {
    expect(validateEmail("admin@taskbuddy.io")).toBeNull();
    expect(validateEmail("  admin@taskbuddy.io  ")).toBeNull();
    expect(validateEmail("first.last+tag@sub.domain.co")).toBeNull();
  });
  it("uses the given label", () => {
    expect(validateEmail("bad", "Support email")).toBe("Support email must be a valid email address.");
  });
});

describe("validateName", () => {
  it("rejects empty, too-short, and too-long values", () => {
    expect(validateName("")).toBe("Name is required.");
    expect(validateName("A")).toBe("Name must be at least 2 characters.");
    expect(validateName("x".repeat(121))).toBe("Name must be 120 characters or fewer.");
  });
  it("accepts a normal name", () => {
    expect(validateName("Super Admin")).toBeNull();
  });
});

describe("validatePassword", () => {
  it("rejects empty, short, letter-only, and number-only passwords", () => {
    expect(validatePassword("")).toBe("Password is required.");
    expect(validatePassword("Ab1")).toBe("Password must be at least 8 characters.");
    expect(validatePassword("abcdefgh")).toBe("Password must contain at least one number.");
    expect(validatePassword("12345678")).toBe("Password must contain at least one letter.");
  });
  it("accepts a password with letters and numbers", () => {
    expect(validatePassword("Admin123!")).toBeNull();
  });
});

describe("validatePasswordChange", () => {
  it("requires the current password", () => {
    const e = validatePasswordChange("", "NewPass123", "NewPass123");
    expect(e.currentPassword).toBe("Enter your current password to set a new one.");
  });
  it("applies strength rules to the new password", () => {
    const e = validatePasswordChange("old", "short", "short");
    expect(e.newPassword).toBe("New password must be at least 8 characters.");
  });
  it("rejects reusing the current password", () => {
    const e = validatePasswordChange("Admin123!", "Admin123!", "Admin123!");
    expect(e.newPassword).toBe("New password must be different from the current password.");
  });
  it("requires the confirmation to match", () => {
    const e = validatePasswordChange("old", "NewPass123", "Different123");
    expect(e.confirmPassword).toBe("Passwords do not match.");
  });
  it("passes a valid change", () => {
    expect(validatePasswordChange("Admin123!", "NewPass123!", "NewPass123!")).toEqual({});
  });
});

describe("validateDurationDays", () => {
  it("treats empty/whitespace as valid (indefinite)", () => {
    expect(validateDurationDays("")).toBeNull();
    expect(validateDurationDays("   ")).toBeNull();
  });
  it("accepts a normal positive integer", () => {
    expect(validateDurationDays("7")).toBeNull();
    expect(validateDurationDays("3650")).toBeNull();
  });
  it("rejects zero and negative values", () => {
    expect(validateDurationDays("0")).toBe("Duration must be at least 1 day.");
    expect(validateDurationDays("-5")).toBe("Duration must be at least 1 day.");
  });
  it("rejects non-integer values, including scientific notation a number input accepts", () => {
    expect(validateDurationDays("1.5")).toBe("Duration must be a whole number of days.");
    expect(validateDurationDays("1e5")).toBe("Duration must be 3650 days or fewer.");
    expect(validateDurationDays("abc")).toBe("Duration must be a whole number of days.");
  });
  it("rejects values past the sanity ceiling", () => {
    expect(validateDurationDays("3651")).toBe("Duration must be 3650 days or fewer.");
  });
});
