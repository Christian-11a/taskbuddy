import type { NextConfig } from "next";

/**
 * Security headers. Sent on every response — Next.js applies these at the edge,
 * so they cover the static shell and the app routes alike.
 *
 * The console is an admin surface holding user PII and payment records, so the
 * baseline browser protections are worth having even though nothing here is
 * public. Deliberately omitted: HSTS, which Vercel already sets on its own
 * domains and which is dangerous to get wrong on a custom one.
 */
const securityHeaders = [
  // Stops the console being framed by another origin — the clickjacking
  // defence that matters most for a dashboard full of one-click destructive
  // actions (suspend, cancel, resolve dispute).
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must honour the declared Content-Type instead of sniffing it.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak admin URLs (which now carry the page name) to third parties.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses these; deny them rather than leave them to the default.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    // Report-only for now, deliberately: the app uses inline styles throughout
    // (every component sets `style={{…}}`), so an enforcing policy would need
    // 'unsafe-inline' for styles anyway, and Next injects inline scripts for
    // hydration. This surfaces violations in the console without risking a
    // blank page in production; tighten to `Content-Security-Policy` once the
    // report is clean and Next's nonce support is wired up.
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // Supabase Storage serves the verification ID/selfie images.
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      // The backend API this console talks to.
      "connect-src 'self' https://taskbuddy-1d48.onrender.com https://*.supabase.co http://localhost:3001",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
