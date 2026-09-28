import { LegalPage } from "@/components/pages/LegalPage";

export const metadata = {
  title: "Terms & Conditions | TaskBuddy",
  description: "The terms for using TaskBuddy, the home services platform for Lipa City.",
};

export default function TermsPage() {
  return <LegalPage doc="terms" />;
}
