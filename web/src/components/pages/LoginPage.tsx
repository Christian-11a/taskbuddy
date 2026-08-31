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
    <div className="login-page flex min-h-screen w-full overflow-hidden" style={{ background: "#080d12" }}>
      <aside className="login-brand-panel hidden lg:flex flex-col justify-between p-12" style={{ flex: "0 0 47%", background: "linear-gradient(112deg, #10383f 0%, #10505b 58%, #24508b 100%)", borderRight: "1px solid rgba(255,255,255,.12)" }}>
        <div className="flex items-center gap-2.5"><Image src="/taskbuddy-logo.png" alt="" width={36} height={36} style={{ borderRadius: "var(--r-md)", objectFit: "cover" }} /><div><div className="text-white font-bold" style={{ fontSize: "var(--fs-md)" }}>TaskBuddy</div><div style={{ fontSize: "var(--fs-2xs)", color: "#9de2e4" }}>Admin Console</div></div></div>
        <div style={{ maxWidth: 420 }}><div style={{ fontSize: "var(--fs-xs)", color: "#9de2e4", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, marginBottom: "var(--sp-4)" }}>Marketplace operations</div><h2 className="text-white font-bold" style={{ fontSize: "clamp(2.4rem, 4vw, 4.2rem)", lineHeight: 1.02, letterSpacing: "-0.06em" }}>Keep every service moving.</h2><p style={{ color: "#c1dfe1", fontSize: "var(--fs-md)", lineHeight: 1.6, marginTop: "var(--sp-5)", maxWidth: 360 }}>One place to verify providers, protect payments, and keep the TaskBuddy marketplace healthy.</p><div className="flex gap-8" style={{ marginTop: "var(--sp-8)", paddingTop: "var(--sp-5)", borderTop: "1px solid rgba(255,255,255,.16)" }}><div><div className="text-white font-bold" style={{ fontSize: "var(--fs-xl)" }}>17</div><div style={{ color: "#9fc4c7", fontSize: "var(--fs-xs)" }}>users</div></div><div><div className="text-white font-bold" style={{ fontSize: "var(--fs-xl)" }}>10</div><div style={{ color: "#9fc4c7", fontSize: "var(--fs-xs)" }}>bookings this month</div></div><div><div className="text-white font-bold" style={{ fontSize: "var(--fs-xl)" }}>1</div><div style={{ color: "#9fc4c7", fontSize: "var(--fs-xs)" }}>needs review</div></div></div></div>
        <div aria-hidden="true" />
      </aside>
      <main className="flex flex-1 items-center justify-center p-6 lg:p-12">
      <div style={{ width: "100%", maxWidth: 372 }}>
        <div className="flex items-center gap-2.5 mb-9 lg:hidden">
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
          TaskBuddy v1
        </div>
      </div>
      </main>
    </div>
  );
}
