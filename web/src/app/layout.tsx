import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { ToastProvider } from "@/components/ui/Toast";

/** Self-hosted at build time — see the note in globals.css for why this
 *  replaced the stylesheet @import. */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  // `template` gives each route its own tab title (see the per-page metadata
  // exports) while keeping the product name as a suffix.
  title: {
    default: "TaskBuddy Admin Console",
    template: "%s",
  },
  description: "Admin dashboard for TaskBuddy platform management",
  // Belt-and-suspenders with app/robots.ts — this stops indexing even if a
  // page gets linked to directly from somewhere robots.txt doesn't cover.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      {/* AppProvider lives here rather than in a page so its state — session,
          the loaded data set, preferences — survives client-side navigation
          between routes. Mounted per-page it would refetch everything on every
          sidebar click. */}
      {/* suppressHydrationWarning: browser extensions (Grammarly, Dashlane,
          etc.) inject their own attributes onto <body> before React
          hydrates — data-gr-ext-installed and similar. React sees the
          server's clean HTML not matching the client's now-decorated DOM and
          flags a hydration mismatch that isn't actually one; nothing we
          render is different between server and client. This only silences
          mismatches on this exact node, not React's real hydration checks
          elsewhere in the tree. */}
      {/* ToastProvider wraps AppProvider so anything inside the app — pages
          and context alike — can report action feedback. */}
      <body suppressHydrationWarning>
        <ToastProvider>
          <AppProvider>{children}</AppProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
