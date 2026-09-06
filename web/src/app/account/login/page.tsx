import { redirect } from "next/navigation";

/**
 * A stable, shareable URL for the Sign In panel. Redirects to the homepage
 * with the hash that already drives the auth modal (see HomePage's ported
 * auth.js) — reuses the exact validated mechanism instead of a second
 * implementation of "modal over the homepage."
 */
export default function AccountLoginPage() {
  redirect("/#login");
}
