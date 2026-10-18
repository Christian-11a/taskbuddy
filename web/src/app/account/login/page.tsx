import { redirect } from "next/navigation";
import { GET_APP_HREF } from "@/lib/getApp";

/** Web sign-in is hidden (mobile-only marketplace); send visitors to Get the app. */
export default function AccountLoginPage() {
  redirect(GET_APP_HREF);
}
