"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { LoginPage } from "@/components/pages/LoginPage";
import { DEFAULT_PAGE_PATH } from "@/lib/routes";

export default function Page() {
  const { isLoggedIn, sessionRestored } = useApp();
  const router = useRouter();

  // Someone already signed in has no business on the login screen — send them
  // on. Also covers the redirect after a successful sign-in, so LoginPage
  // itself stays a pure form with no routing knowledge.
  useEffect(() => {
    if (sessionRestored && isLoggedIn) router.replace(DEFAULT_PAGE_PATH);
  }, [sessionRestored, isLoggedIn, router]);

  return <LoginPage />;
}
