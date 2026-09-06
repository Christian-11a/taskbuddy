import type { Metadata } from "next";
import { DashboardPage } from "@/components/pages/DashboardPage";

export const metadata: Metadata = { title: "Overview · TaskBuddy Admin" };

export default function Page() {
  return <DashboardPage />;
}
