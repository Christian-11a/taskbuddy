import type { Metadata } from "next";
import { AppProvider } from "@/context/AppContext";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: {
    default: "TaskBuddy Admin Console",
    template: "%s",
  },
  description: "Admin dashboard for TaskBuddy platform management",
  // Belt-and-suspenders with app/robots.ts — this stops indexing even if a
  // page gets linked to directly from somewhere robots.txt doesn't cover.
  robots: { index: false, follow: false },
};

/**
 * Scopes admin session/domain state to /admin/* only. AppProvider lives here
 * (not the root layout) precisely so a public-site visit never fires an
 * admin session-restore call — see the note in the root layout.
 */
export default function AdminSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <AppProvider>{children}</AppProvider>
    </ToastProvider>
  );
}
