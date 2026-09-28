import { LegalPage } from "@/components/pages/LegalPage";

export const metadata = {
  title: "Privacy Policy | TaskBuddy",
  description: "How TaskBuddy collects, uses, and protects your personal data under the Data Privacy Act of 2012 (RA 10173).",
};

export default function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}
