import type { Metadata } from "next";
import { TransactionsPage } from "@/components/pages/TransactionsPage";

export const metadata: Metadata = { title: "Transactions · TaskBuddy Admin" };

export default function Page() {
  return <TransactionsPage />;
}
