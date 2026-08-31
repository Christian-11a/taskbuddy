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
    <div className="login-page flex h-screen w-full overflow-hidden" style={{ background: "#080d12" }}>
      {/* Left Panel */}
      <div
        className="hidden lg:flex flex-col p-12 relative overflow-hidden"
        style={{
          flex: "0 0 58%",
          background: "radial-gradient(circle at 12% 16%, rgba(50,211,228,.22), transparent 28%), linear-gradient(145deg, #0b2029 0%, #0d3038 48%, #0b121a 100%)",
        }}
      >
        <div className="absolute pointer-events-none" style={{ top: -65, right: -65, width: 261, height: 261, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,195,214,.20), transparent 70%)" }} />
        <div className="absolute pointer-events-none" style={{ bottom: -40, left: -50, width: 209, height: 209, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,.12), transparent 70%)" }} />

        <div className="flex items-center gap-2.5 mb-auto relative z-10">
          {/* decorative: the adjacent "TaskBuddy" text label already carries the brand name */}
          <Image src="/taskbuddy-logo.png" alt="" width={33} height={33} style={{ borderRadius: 11, objectFit: "cover" }} />
          <div>
            <div className="text-white font-bold" style={{ fontSize: 13 }}>TaskBuddy</div>
            <div style={{ fontSize: 9.8, color: "var(--indigo-light)" }}>Hire with confidence, pay with ease</div>
          </div>
        </div>

        <div className="my-auto relative z-10">
          <h1 className="text-white font-extrabold leading-tight mb-4" style={{ fontSize: 42, letterSpacing: "-0.055em", maxWidth: 440 }}>The quiet center of a busy marketplace.</h1>
          <p className="leading-relaxed mb-6" style={{ fontSize: 13, color: "#a9cbd0", maxWidth: 310 }}>
            Manage users, verify service providers, monitor transactions, and oversee all platform activity from one central dashboard.
          </p>
          {["Provider verification queue", "User and account management", "Transaction and escrow monitoring", "Analytics and reporting"].map((feat, i) => (
            <div key={feat} className="flex items-center gap-3 font-medium mb-2.5" style={{ background: "rgba(255,255,255,0.065)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "11px 13px", fontSize: 11.4, color: "#cfeef3", maxWidth: 340 }}><span style={{ color: "#55d4df", fontSize: 10, fontWeight: 800 }}>0{i + 1}</span>{feat}</div>
          ))}
        </div>
        <div style={{ fontSize: 9.8, color: "var(--text-muted)" }} className="relative z-10">TaskBuddy Admin Console v2.1 · Restricted Access</div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-10" style={{ background: "#080d12" }}>
        <div className="rounded-3xl p-7 lg:p-9" style={{ width: "100%", maxWidth: 430, background: "rgba(17,24,32,.86)", border: "1px solid rgba(120,150,170,.16)", boxShadow: "0 24px 70px rgba(0,0,0,.28)" }}>
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8 justify-center">
            {/* decorative: the adjacent "TaskBuddy" text label already carries the brand name */}
          <Image src="/taskbuddy-logo.png" alt="" width={33} height={33} style={{ borderRadius: 11, objectFit: "cover" }} />
            <div className="text-white font-bold" style={{ fontSize: 16 }}>TaskBuddy Admin</div>
          </div>

          <div className="mb-1" style={{ fontSize: 10, color: "#55d4df", letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 700 }}>TaskBuddy / Admin</div>
          <h2 className="text-white font-bold mb-1" style={{ fontSize: 25, letterSpacing: "-0.035em" }}>Welcome back</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 26 }}>This portal is restricted to authorized administrators only.</p>

          {error && (
            <div className="flex items-center gap-2 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", padding: "10px 13px", fontSize: 11.4, color: "#f87171" }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor={emailId} className="block font-medium" style={{ fontSize: 11.4, color: "#9ca3af", marginBottom: 7 }}>Admin Email</label>
              <div className="relative">
                <span className="absolute top-1/2 -translate-y-1/2 left-3.5 opacity-50"><Mail size={14} color="#6b7280" /></span>
                <input
                  id={emailId}
                  type="email"
                  placeholder="admin@taskbuddy.io"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full text-white outline-none transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 13, padding: "11px 14px 11px 36px", fontSize: 12.2, fontFamily: "inherit" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label htmlFor={passwordId} className="block font-medium" style={{ fontSize: 11.4, color: "#9ca3af", marginBottom: 7 }}>Password</label>
              <div className="relative">
                <span className="absolute top-1/2 -translate-y-1/2 left-3.5 opacity-50"><Lock size={14} color="#6b7280" /></span>
                <input
                  id={passwordId}
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="w-full text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 13, padding: "11px 14px 11px 36px", fontSize: 12.2, fontFamily: "inherit" }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full font-semibold text-white transition-opacity hover:opacity-90"
              style={{ padding: 12, borderRadius: 13, border: "none", cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.7 : 1, background: "linear-gradient(172deg, #22c3d6 0%, #38bdf8 100%)", boxShadow: "0 3px 8px rgba(34,195,214,0.4)", fontSize: 13, fontFamily: "inherit" }}
            >
              {submitting ? "Signing in…" : "Sign In to Admin Console"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
