import type { MetadataRoute } from "next";

const SITE_URL = "https://taskbuddy-nine-zeta.vercel.app";

/**
 * "/" plus the two public legal pages. `/account*` is disallowed in robots.ts (session-gated
 * or a redirect into the auth modal) and `/admin/*` holds real user PII —
 * neither should be offered to a crawler at all.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
