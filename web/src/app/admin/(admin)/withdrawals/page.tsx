import type { Metadata } from "next";
import { WithdrawalsPage } from "@/components/pages/WithdrawalsPage";

export const metadata: Metadata = { title: "Failed payouts · TaskBuddy Admin" };

export default function Page() { return <WithdrawalsPage />; }
