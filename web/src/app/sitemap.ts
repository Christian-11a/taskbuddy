import type { MetadataRoute } from "next";

const SITE_URL = "https://taskbuddy-nine-zeta.vercel.app";

/**
 * Only "/" belongs here. `/account*` is disallowed in robots.ts (session-gated
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
  ];
}
