import type { Metadata } from "next";
import { CredentialsPage } from "@/components/pages/CredentialsPage";

export const metadata: Metadata = { title: "Credentials · TaskBuddy Admin" };

export default function Page() {
  return <CredentialsPage />;
}
