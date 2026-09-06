import type { MetadataRoute } from "next";

/**
 * The public promo site (/) is meant to be found on Google — the whole point
 * of migrating it here. /admin/* holds real user PII (names, emails, phone
 * numbers, suspension reasons) and /account/* is a signed-in area, neither of
 * which belong in a search index, so those stay disallowed. Belt-and-suspenders
 * with the `robots: { index: false }` in admin/layout.tsx's metadata: this file
 * stops well-behaved crawlers from even requesting admin pages, the meta tag
 * stops one from being indexed if something links to it directly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: ["/admin", "/account"] },
  };
}
