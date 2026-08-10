import type { MetadataRoute } from "next";

/**
 * Blocks every crawler. This is an internal admin console holding real user
 * PII (names, emails, phone numbers, suspension reasons) — there is no
 * legitimate reason for it to appear in a search index. Belt-and-suspenders
 * with the `robots: { index: false }` in app/layout.tsx metadata: this file
 * stops well-behaved crawlers from even requesting pages, the meta tag stops
 * a page from being indexed if something links to it directly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
