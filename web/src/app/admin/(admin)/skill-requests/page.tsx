import type { Metadata } from "next";
import { SkillRequestsPage } from "@/components/pages/SkillRequestsPage";

export const metadata: Metadata = { title: "Service requests · TaskBuddy Admin" };

export default function Page() {
  return <SkillRequestsPage />;
}
