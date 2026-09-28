import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import { PreviewShell } from "./PreviewShell";
import { BodyClass } from "@/components/admin/BodyClass";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata = { title: "Admin preview (dev)", robots: { index: false, follow: false } };

/**
 * Dev-only visual preview of the Admin Console with sample data — no backend,
 * no session. Returns 404 in production builds.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<{ theme?: string; collapsed?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { page } = await params;
  const { theme, collapsed } = await searchParams;
  return (
    <div className={inter.variable}>
      <BodyClass className={inter.variable} />
      <PreviewShell page={page} dark={theme === "dark"} collapsed={collapsed === "1"} />
    </div>
  );
}
