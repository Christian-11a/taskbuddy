import { describe, it, expect } from "vitest";
import { login } from "./index";

/**
 * Live end-to-end check against the real backend, using a real (spare) admin
 * account — not a mock. Skips itself when the credentials aren't provided so
 * it never breaks `npm test` for anyone who hasn't set them.
 *
 * Run it yourself with:
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npx vitest run adminLogin.live
 * (PowerShell: $env:TEST_ADMIN_EMAIL="..."; $env:TEST_ADMIN_PASSWORD="..."; npx vitest run adminLogin.live)
 *
 * Credentials are never written to any file by Claude — only read from the
 * environment you set in your own shell before running this.
 */
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;
const hasCreds = Boolean(email && password);

describe.skipIf(!hasCreds)("admin login — live backend", () => {
  it("signs in with real credentials and returns a profile", async () => {
    const profile = await login(email!, password!);

    expect(profile).not.toBeNull();
    expect(profile?.email).toBe(email);
    expect(typeof profile?.id).toBe("string");
    expect(profile?.id.length).toBeGreaterThan(0);
  });
});
