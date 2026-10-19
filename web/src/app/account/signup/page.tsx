import { redirect } from "next/navigation";
import { GET_APP_HREF } from "@/lib/getApp";

/** Web sign-up is hidden (mobile-only marketplace); send visitors to Get the app. */
export default function AccountSignupPage() {
  redirect(GET_APP_HREF);
}
