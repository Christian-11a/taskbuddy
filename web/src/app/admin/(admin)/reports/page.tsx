import type { Metadata } from "next";
import { ReportsPage } from "@/components/pages/ReportsPage";

export const metadata: Metadata = { title: "Reports & Analytics · TaskBuddy Admin" };

export default function Page() {
  return <ReportsPage />;
}
