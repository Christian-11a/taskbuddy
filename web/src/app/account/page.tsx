import "../../styles/promo.css";
import { ACCOUNT_MARKUP } from "@/components/pages/AccountPage.markup";

export const metadata = {
  title: "Get the app | TaskBuddy",
  description: "TaskBuddy works from the mobile app.",
};

// Web sign-in is hidden (the marketplace is mobile-only), so this page no
// longer depends on a session: everyone sees the same "Get the app" message.
export default function AccountPage() {
  return (
    <div className="promo-site">
      <div dangerouslySetInnerHTML={{ __html: ACCOUNT_MARKUP }} />
    </div>
  );
}
