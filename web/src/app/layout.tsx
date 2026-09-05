import type { Metadata } from "next";
import "./globals.css";

/** Self-hosted at build time — see the note in globals.css for why this
 *  replaced the stylesheet @import. */
export const metadata: Metadata = {
  title: {
    default: "TaskBuddy",
    template: "%s",
  },
  description: "TaskBuddy connects Lipa City homeowners with local service providers.",
};

/**
 * Root layout, shared by the public promo site (/, /account/*) and the admin
 * console (/admin/*). Deliberately minimal: AppProvider/ToastProvider (admin
 * session state, domain data, toasts) live in web/src/app/admin/layout.tsx
 * instead, so a public-site visit never fires an admin session-restore call
 * or mounts admin-only state.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (Grammarly, Dashlane,
          etc.) inject their own attributes onto <body> before React
          hydrates — data-gr-ext-installed and similar. React sees the
          server's clean HTML not matching the client's now-decorated DOM and
          flags a hydration mismatch that isn't actually one; nothing we
          render is different between server and client. This only silences
          mismatches on this exact node, not React's real hydration checks
          elsewhere in the tree. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
