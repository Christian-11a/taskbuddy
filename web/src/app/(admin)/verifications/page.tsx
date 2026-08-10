import type { Metadata } from "next";
import { VerificationsPage } from "@/components/pages/VerificationsPage";

export const metadata: Metadata = { title: "Verifications · TaskBuddy Admin" };

export default function Page() {
  return <VerificationsPage />;
}
