import type { Metadata } from "next";
import { DisputesPage } from "@/components/pages/DisputesPage";

export const metadata: Metadata = { title: "Disputes · TaskBuddy Admin" };

export default function Page() {
  return <DisputesPage />;
}
