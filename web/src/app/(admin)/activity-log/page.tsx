import type { Metadata } from "next";
import { ActivityLogPage } from "@/components/pages/ActivityLogPage";

export const metadata: Metadata = { title: "Activity Log · TaskBuddy Admin" };

export default function Page() {
  return <ActivityLogPage />;
}
