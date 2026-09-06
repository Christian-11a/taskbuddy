import { redirect } from "next/navigation";

/** Same idea as account/login/page.tsx, for the Sign Up panel. */
export default function AccountSignupPage() {
  redirect("/#signup");
}
