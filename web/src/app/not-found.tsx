import Link from "next/link";
import { Compass } from "lucide-react";

/** Now that pages have real URLs, a mistyped one is reachable — so it needs an
 *  answer other than Next's default black-and-white 404. */
export default function NotFound() {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen px-6 text-center"
      style={{ background: "var(--bg-main)" }}
    >
      <div
        className="flex items-center justify-center rounded-2xl mb-4"
        style={{ width: 52, height: 52, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }}
      >
        <Compass size={22} style={{ color: "var(--indigo-light)" }} />
      </div>
      <div className="text-white font-bold mb-2" style={{ fontSize: 18 }}>Page not found</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 380, marginBottom: 20 }}>
        That URL doesn&apos;t match any page in the admin console.
      </div>
      <Link
        href="/dashboard"
        className="font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(172deg, #6363f1 0%, #8b5cf6 100%)", borderRadius: 11, padding: "9px 18px", fontSize: 13, textDecoration: "none" }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
