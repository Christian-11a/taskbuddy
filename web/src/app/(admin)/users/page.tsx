import type { Metadata } from "next";
import { UsersPage } from "@/components/pages/UsersPage";

export const metadata: Metadata = { title: "User Management · TaskBuddy Admin" };

export default function Page() {
  return <UsersPage />;
}
