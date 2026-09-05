import type { Metadata } from "next";
import { WithdrawalsPage } from "@/components/pages/WithdrawalsPage";

export const metadata: Metadata = { title: "Withdrawals · TaskBuddy Admin" };

export default function Page() { return <WithdrawalsPage />; }
