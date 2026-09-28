import type { Metadata } from "next";
import { HomePage } from "@/components/pages/HomePage";

const TITLE = "TaskBuddy | Everyday work, sorted.";
const DESCRIPTION =
  "TaskBuddy connects homeowners in Lipa City with verified local service providers for cleaning, plumbing, handyman, manicure, and pedicure — with escrow-protected payments.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "TaskBuddy",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_PH",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "TaskBuddy: one app for homeowners and service providers" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.jpg"],
  },
};

export default function Page() {
  return <HomePage />;
}
