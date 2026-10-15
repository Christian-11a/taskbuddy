import { describe, expect, it } from "vitest";
import { adminApiRewrites, normalizeProxyTarget, serverApiUrl } from "./apiBase";

const TARGET = "https://taskbuddy-kpek.onrender.com";

describe("adminApiRewrites", () => {
  it("adds no rewrite when ADMIN_API_PROXY_TARGET is not set", () => {
    expect(adminApiRewrites({ publicApiUrl: undefined, proxyTarget: undefined })).toEqual([]);
    expect(adminApiRewrites({ publicApiUrl: TARGET, proxyTarget: undefined })).toEqual([]);
  });

  it("treats a blank ADMIN_API_PROXY_TARGET as not set", () => {
    expect(adminApiRewrites({ publicApiUrl: TARGET, proxyTarget: "   " })).toEqual([]);
  });

  it("forwards /backend/* to the API target when the proxy target is set", () => {
    expect(
      adminApiRewrites({ publicApiUrl: "/backend", proxyTarget: TARGET }),
    ).toEqual([{ source: "/backend/:path*", destination: `${TARGET}/:path*` }]);
  });

  it("drops a trailing slash from the proxy target so paths do not double up", () => {
    expect(
      adminApiRewrites({ publicApiUrl: "/backend", proxyTarget: `${TARGET}/` }),
    ).toEqual([{ source: "/backend/:path*", destination: `${TARGET}/:path*` }]);
  });

  it("refuses a relative API URL with no proxy target, instead of building a broken console", () => {
    expect(() => adminApiRewrites({ publicApiUrl: "/backend", proxyTarget: undefined })).toThrow(
      /ADMIN_API_PROXY_TARGET/,
    );
  });

  it("refuses a relative API URL other than the proxy path", () => {
    expect(() => adminApiRewrites({ publicApiUrl: "/elsewhere", proxyTarget: TARGET })).toThrow(
      /"\/backend"/,
    );
  });

  it("refuses a proxy target that is not an absolute http(s) URL", () => {
    expect(() => adminApiRewrites({ publicApiUrl: "/backend", proxyTarget: "taskbuddy-kpek.onrender.com" })).toThrow(
      /ADMIN_API_PROXY_TARGET/,
    );
    expect(() => adminApiRewrites({ publicApiUrl: "/backend", proxyTarget: "ftp://example.com" })).toThrow(
      /ADMIN_API_PROXY_TARGET/,
    );
  });
});

describe("normalizeProxyTarget", () => {
  it("accepts http for a local API and strips trailing slashes", () => {
    expect(normalizeProxyTarget("http://127.0.0.1:3001//")).toBe("http://127.0.0.1:3001");
  });
});

describe("serverApiUrl", () => {
  it("keeps the local default when NEXT_PUBLIC_API_URL is unset", () => {
    expect(serverApiUrl(undefined, undefined)).toBe("http://localhost:3001");
  });

  it("uses an absolute NEXT_PUBLIC_API_URL as it is, ignoring the proxy target", () => {
    expect(serverApiUrl("https://api.example.com", TARGET)).toBe("https://api.example.com");
  });

  it("uses the absolute proxy target on the server when NEXT_PUBLIC_API_URL is the same-origin path", () => {
    // Server-side fetch() cannot resolve "/backend", so the route handlers and
    // server components call the API directly.
    expect(serverApiUrl("/backend", `${TARGET}/`)).toBe(TARGET);
  });

  it("returns the relative value when no proxy target exists, so the misconfiguration fails loudly", () => {
    expect(serverApiUrl("/backend", undefined)).toBe("/backend");
  });
});
