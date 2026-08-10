import type { Metadata } from "next";
import { AuditLogPage } from "@/components/pages/AuditLogPage";

export const metadata: Metadata = { title: "Audit Log · TaskBuddy Admin" };

export default function Page() {
  return <AuditLogPage />;
}
