import { beforeEach, describe, expect, it } from "vitest";
import { clearAdminSession, getAdminSession, setAdminSession } from "./session";

describe("admin session", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAdminSession();
  });

  it("keeps the admin identity and CSRF token only in memory", () => {
    setAdminSession({
      csrfToken: "csrf-123",
      adminProfile: { id: "admin-1", name: "Ana Cruz", email: "ana@taskbuddy.io" },
    });

    expect(getAdminSession()).toEqual({
      csrfToken: "csrf-123",
      adminProfile: { id: "admin-1", name: "Ana Cruz", email: "ana@taskbuddy.io" },
    });
    expect(localStorage.getItem("tb-admin-session")).toBeNull();
  });

  it("clears the in-memory identity and CSRF token", () => {
    setAdminSession({
      csrfToken: "csrf-123",
      adminProfile: { id: "admin-1", name: "Ana Cruz", email: "ana@taskbuddy.io" },
    });

    clearAdminSession();

    expect(getAdminSession()).toBeNull();
  });
});
