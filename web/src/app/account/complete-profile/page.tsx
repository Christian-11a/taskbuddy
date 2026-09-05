import { redirect } from "next/navigation";
import "../../../styles/promo.css";
import { API_URL, getAccessToken } from "../../api/auth/_session";
import { CompleteProfileForm } from "./CompleteProfileForm";

export const metadata = {
  title: "Finish setting up your account | TaskBuddy",
};

export default async function CompleteGoogleProfilePage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/#login");

  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res?.ok) redirect("/#login");
  const data = await res.json().catch(() => null);

  // Nothing left to complete — send them to the real handoff page instead of
  // showing a role picker they already resolved.
  if (!data?.profile?.google_signup_pending) redirect("/account");

  return (
    <div className="promo-site">
      <CompleteProfileForm />
    </div>
  );
}
