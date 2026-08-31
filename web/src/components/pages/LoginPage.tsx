"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { validateEmail, validateRequired } from "@/lib/validation";

export function LoginPage() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Stable across server/client render, so htmlFor/id can be wired without
  // a hydration mismatch. The labels were visual only before this.
  const emailId = useId();
  const passwordId = useId();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const invalid = validateEmail(email, "Admin email") ?? validateRequired(password, "Password");
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);
    const ok = await login(email.trim(), password);
    setSubmitting(false);
    if (!ok) setError("Invalid email or password. Check your credentials and try again.");
  };

  return (
    /* A sign-in screen for staff who use this console daily — not a pitch.
       The marketing hero, capability bullets, and ambient glows that used to
       occupy 58% of the viewport sold the product to people who have already
       bought it; what an admin needs here is the form and a clear failure
       message. Stays dark in both themes by design (see globals.css). */
    <div className="login-page flex h-screen w-full overflow-hidden items-center justify-center p-6" style={{ background: "#080d12" }}>
      <main style={{ width: "100%", maxWidth: 372 }}>
        <div className="flex items-center gap-2.5 mb-9">
          {/* decorative: the adjacent wordmark already carries the brand name */}
          <Image src="/taskbuddy-logo.png" alt="" width={34} height={34} style={{ borderRadius: "var(--r-md)", objectFit: "cover" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: "var(--fs-md)", letterSpacing: "-0.01em" }}>TaskBuddy</div>
            <div style={{ fontSize: "var(--fs-2xs)", color: "var(--indigo-light)" }}>Admin Console</div>
          </div>
        </div>

        <h1 className="text-white font-bold" style={{ fontSize: "var(--fs-3xl)", letterSpacing: "-0.035em" }}>Sign in</h1>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: 6, marginBottom: 26, lineHeight: 1.5 }}>
          Restricted to authorized TaskBuddy administrators.
        </p>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", padding: "10px 13px", fontSize: "var(--fs-xs)", color: "#f87171", lineHeight: 1.45 }}>
            <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <label htmlFor={emailId} className="block font-medium" style={{ fontSize: "var(--fs-xs)", color: "#9ca3af", marginBottom: 7 }}>Admin email</label>
            <div className="relative">
              <span className="absolute top-1/2 -translate-y-1/2 left-3.5 opacity-50"><Mail size={14} color="#6b7280" /></span>
              <input
                id={emailId}
                type="email"
                autoComplete="username"
                placeholder="admin@taskbuddy.io"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className="w-full text-white outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: "var(--r-md)", padding: "11px 14px 11px 36px", fontSize: "var(--fs-sm)", fontFamily: "inherit" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <label htmlFor={passwordId} className="block font-medium" style={{ fontSize: "var(--fs-xs)", color: "#9ca3af", marginBottom: 7 }}>Password</label>
            <div className="relative">
              <span className="absolute top-1/2 -translate-y-1/2 left-3.5 opacity-50"><Lock size={14} color="#6b7280" /></span>
              <input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full text-white outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: "var(--r-md)", padding: "11px 14px 11px 36px", fontSize: "var(--fs-sm)", fontFamily: "inherit" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
            style={{ padding: "var(--sp-3)", borderRadius: "var(--r-md)", fontSize: "var(--fs-md)", cursor: submitting ? "wait" : "pointer" }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-muted)", marginTop: 28, paddingTop: "var(--sp-4)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          TaskBuddy Admin Console v2.1
        </div>
      </main>
    </div>
  );
}
