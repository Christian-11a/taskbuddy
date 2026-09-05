import { redirect } from "next/navigation";
import "../../styles/promo.css";
import { ACCOUNT_MARKUP } from "@/components/pages/AccountPage.markup";
import { API_URL, getAccessToken } from "../api/auth/_session";

export const metadata = {
  title: "Your account | TaskBuddy",
  description: "Your TaskBuddy account is ready.",
};

async function hasValidSession(): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) return false;

  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => null);

  return !!res?.ok;
}

export default async function AccountPage() {
  if (!(await hasValidSession())) {
    redirect("/#login");
  }

  return (
    <div className="promo-site">
      <div dangerouslySetInnerHTML={{ __html: ACCOUNT_MARKUP }} />
    </div>
  );
}
