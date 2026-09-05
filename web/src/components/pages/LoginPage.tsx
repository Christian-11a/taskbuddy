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
    <div className="login-page flex min-h-screen w-full items-center justify-center overflow-hidden p-6" style={{ background: "var(--login-panel)" }}>
      {/* A single centered card, not a split hero-panel-plus-form template. The
          previous layout paired a gradient brand panel with the form — the
          gradient contradicted this app's own rule for --brand-solid ("one
          flat colour, because a gradient here communicated nothing about
          state") and the split-panel shape is the generic admin-login
          template every dashboard starter ships with. This card carries the
          brand mark itself instead of a decorative field beside it. */}
      <main className="w-full" style={{ maxWidth: 440 }}>
      <div style={{ background: "var(--login-card)", border: "1px solid var(--login-card-border)", borderRadius: "var(--r-lg)", padding: "var(--sp-10) var(--sp-8)" }}>
        <div className="flex flex-col items-center text-center" style={{ marginBottom: "var(--sp-6)" }}>
          <Image src="/taskbuddy-logo.png" alt="" width={56} height={56} style={{ borderRadius: "var(--r-md)", objectFit: "cover", marginBottom: "var(--sp-3)" }} />
          <div className="text-white font-bold" style={{ fontSize: "var(--fs-lg)" }}>TaskBuddy</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--indigo-light)" }}>Admin Console</div>
        </div>

        <h1 className="text-white font-bold text-center" style={{ fontSize: "var(--fs-3xl)", letterSpacing: "-0.035em" }}>Sign in</h1>
        <p className="text-center" style={{ fontSize: "var(--fs-md)", color: "var(--text-muted)", marginTop: 6, marginBottom: 30, lineHeight: 1.5 }}>
          Restricted to authorized TaskBuddy administrators.
        </p>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", padding: "12px 15px", fontSize: "var(--fs-sm)", color: "#f87171", lineHeight: 1.45 }}>
            <AlertCircle size={15} style={{ marginTop: 1, flexShrink: 0 }} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <label htmlFor={emailId} className="block font-medium" style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginBottom: 8 }}>Admin email</label>
            <div className="relative">
              <span className="absolute top-1/2 -translate-y-1/2 left-4 opacity-50"><Mail size={16} /></span>
              <input
                id={emailId}
                type="email"
                autoComplete="username"
                placeholder="admin@taskbuddy.io"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                className="w-full text-white outline-none"
                style={{ background: "var(--login-input)", border: `1px solid ${error ? "var(--danger-border)" : "var(--border-md)"}`, borderRadius: "var(--r-md)", padding: "13px 16px 13px 40px", fontSize: "var(--fs-md)", fontFamily: "inherit" }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 26 }}>
            <label htmlFor={passwordId} className="block font-medium" style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginBottom: 8 }}>Password</label>
            <div className="relative">
              <span className="absolute top-1/2 -translate-y-1/2 left-4 opacity-50"><Lock size={16} /></span>
              <input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full text-white outline-none"
                style={{ background: "var(--login-input)", border: `1px solid ${error ? "var(--danger-border)" : "var(--border-md)"}`, borderRadius: "var(--r-md)", padding: "13px 16px 13px 40px", fontSize: "var(--fs-md)", fontFamily: "inherit" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
            style={{ padding: "var(--sp-4)", borderRadius: "var(--r-md)", fontSize: "var(--fs-lg)", cursor: submitting ? "wait" : "pointer" }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)", marginTop: 30, paddingTop: "var(--sp-4)", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          TaskBuddy Admin Console
        </div>
      </div>
      </main>
    </div>
  );
}
