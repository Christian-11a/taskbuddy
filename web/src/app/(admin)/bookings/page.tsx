import type { Metadata } from "next";
import { BookingsPage } from "@/components/pages/BookingsPage";

export const metadata: Metadata = { title: "Bookings · TaskBuddy Admin" };

export default function Page() {
  return <BookingsPage />;
}
