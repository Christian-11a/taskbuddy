import { redirect } from "next/navigation";
import "../../styles/promo.css";
import { ACCOUNT_MARKUP } from "@/components/pages/AccountPage.markup";
import { API_URL, getAccessToken } from "../api/auth/_session";

export const metadata = {
  title: "Your account | TaskBuddy",
  description: "Your TaskBuddy account is ready.",
};

async function getProfile(): Promise<{ google_signup_pending?: boolean } | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.profile ?? null;
}

export default async function AccountPage() {
  const profile = await getProfile();
  if (!profile) {
    redirect("/#login");
  }
  // A first-time Google signup doesn't have a role yet — finish that before
  // showing the handoff page, same as a fresh email signup would have picked
  // a role on the Sign Up panel itself.
  if (profile.google_signup_pending) {
    redirect("/account/complete-profile");
  }

  return (
    <div className="promo-site">
      <div dangerouslySetInnerHTML={{ __html: ACCOUNT_MARKUP }} />
    </div>
  );
}
