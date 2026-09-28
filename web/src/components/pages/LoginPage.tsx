"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { LoginFailure } from "@/lib/services";
import { validateEmail, validateRequired } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Field = "email" | "password" | "both";

/** Each failure says what actually happened, so nobody retries a password
 *  that was never the problem (and extends a rate-limit block doing it). */
function failureMessage(reason: LoginFailure, retryAfterSeconds?: number): string {
  switch (reason) {
    case "rate_limited":
      return retryAfterSeconds !== undefined
        ? `Too many sign-in attempts. Try again in ${Math.ceil(retryAfterSeconds)} seconds.`
        : "Too many sign-in attempts. Wait a minute, then try again.";
    case "network":
      return "Can't reach the TaskBuddy server. Check your connection (or that the API is running), then try again.";
    case "server":
      return "The server had a problem signing you in. Try again in a moment.";
    default:
      return "Invalid email or password. Check your credentials and try again.";
  }
}

export function LoginPage() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<Field | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // Stable across server/client render, so htmlFor/id can be wired without
  // a hydration mismatch.
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const capsId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const clearError = () => {
    setError("");
    setErrorField(null);
  };

  const fail = (message: string, field: Field | null) => {
    setError(message);
    setErrorField(field);
    // Put the cursor where the fix goes instead of leaving focus on the page.
    if (field === "password") passwordRef.current?.focus();
    else if (field) emailRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    const emailProblem = validateEmail(email, "Admin email");
    if (emailProblem) return fail(emailProblem, "email");
    const passwordProblem = validateRequired(password, "Password");
    if (passwordProblem) return fail(passwordProblem, "password");

    setSubmitting(true);
    const result = await login(email.trim(), password);
    setSubmitting(false);
    if (!result.ok) {
      fail(failureMessage(result.reason, result.retryAfterSeconds), result.reason === "credentials" ? "both" : null);
    }
  };

  const invalid = (field: "email" | "password") => errorField === field || errorField === "both";
  // 16px on phones stops iOS zooming into the field on focus.
  const fieldClass = cn(inputClass, "login-input h-11 pl-10 text-[16px] sm:text-[14px]");

  return (
    <div className="login-page ui-root relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4 text-foreground sm:p-6">
      {/* Quiet backdrop: a soft accent glow and a faint grid, so the card
          isn't floating on a flat void. Purely decorative. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
          style={{
            backgroundImage:
              "linear-gradient(var(--ui-border) 1px, transparent 1px), linear-gradient(90deg, var(--ui-border) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <main className="relative w-full max-w-[420px] motion-safe:animate-[ui-pop-in_320ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="rounded-[16px] border border-border bg-surface px-6 py-8 shadow-ui-lg sm:px-8 sm:py-9">
          <div className="mb-7 flex items-center gap-3">
            <Image src="/taskbuddy-logo.png" alt="" width={44} height={44} className="rounded-[10px] object-cover" />
            <div>
              <div className="text-[15px] font-semibold leading-tight tracking-tight">TaskBuddy</div>
              <div className="text-[12.5px] text-muted-foreground">Admin Console</div>
            </div>
          </div>

          <h1 className="text-[24px] font-semibold tracking-[-0.025em]">Sign in</h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            Restricted to authorized TaskBuddy administrators.
          </p>

          {error && (
            <div
              id={errorId}
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-3 text-[13px] leading-snug text-danger"
            >
              <AlertCircle className="mt-px size-4 shrink-0" aria-hidden="true" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor={emailId} className="mb-1.5 block text-[12.5px] font-medium">
                Admin email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                <input
                  ref={emailRef}
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  placeholder="name@example.com"
                  value={email}
                  aria-invalid={invalid("email")}
                  aria-describedby={invalid("email") && error ? errorId : undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor={passwordId} className="mb-1.5 block text-[12.5px] font-medium">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                <input
                  ref={passwordRef}
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  aria-invalid={invalid("password")}
                  aria-describedby={[invalid("password") && error ? errorId : "", capsLock ? capsId : ""].filter(Boolean).join(" ") || undefined}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                  onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                  onBlur={() => setCapsLock(false)}
                  className={cn(fieldClass, "pr-11")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {capsLock && (
                <p id={capsId} className="mt-1.5 text-[12px] font-medium text-warn">
                  Caps Lock is on.
                </p>
              )}
            </div>

            <Button type="submit" size="lg" disabled={submitting} className="mt-2 h-11 w-full text-[14px]">
              {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-muted-foreground">
            Forgot your password? Ask the TaskBuddy platform owner to reset it.
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 px-1 text-[12px] text-muted-foreground">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> TaskBuddy website
          </Link>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" /> Authorized use only
          </span>
        </div>
      </main>
    </div>
  );
}
