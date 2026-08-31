"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { DEFAULT_PAGE_PATH, LOGIN_PATH } from "@/lib/routes";

/**
 * "/" is a router, not a page. It waits for the stored session to be checked,
 * then sends the browser to the dashboard or the login screen. Deliberately
 * client-side: the session lives in localStorage, which the server cannot see,
 * so a server redirect here would always guess wrong for signed-in admins.
 */
export default function Page() {
  const { isLoggedIn, sessionRestored } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!sessionRestored) return;
    router.replace(isLoggedIn ? DEFAULT_PAGE_PATH : LOGIN_PATH);
  }, [sessionRestored, isLoggedIn, router]);

  return (
    <div
      className="flex items-center justify-center h-screen"
      style={{ background: "var(--bg-main)", color: "var(--text-muted)", fontSize: "var(--fs-md)" }}
    >
      Loading…
    </div>
  );
}
