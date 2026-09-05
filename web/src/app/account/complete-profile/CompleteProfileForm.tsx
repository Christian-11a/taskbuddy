"use client";

import { useState } from "react";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "./legalDocs";

const CATEGORY_IDS: Record<string, number> = {
  Plumbing: 1,
  Cleaning: 2,
  Handyman: 3,
  Manicure: 4,
  Pedicure: 5,
};

type Role = "homeowner" | "provider";

export function CompleteProfileForm() {
  const [role, setRole] = useState<Role>("homeowner");
  const [category, setCategory] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [dataCollection, setDataCollection] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [docView, setDocView] = useState<"terms" | "privacy" | null>(null);

  const isProvider = role === "provider";
  const consentsValid = terms && privacy && dataCollection && (!isProvider || biometric);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!consentsValid) {
      setError("Please accept the required consents to continue.");
      return;
    }
    if (isProvider && !category) {
      setError("Please select your skill category.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/complete-google-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: isProvider ? "provider" : "client",
          category_id: isProvider ? CATEGORY_IDS[category] : undefined,
          consented_terms: terms,
          consented_privacy: privacy,
          consented_data_collection: dataCollection,
          consented_biometric: isProvider ? biometric : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Unable to save your profile. Please try again.");
      }
      // A hard navigation, not router.push(): /account is a server component
      // that reads the session cookie this request just set, so it needs a
      // real request rather than a client-side transition. Same pattern
      // auth.js already uses for login/register/reset — consistent with the
      // rest of the auth flow.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/account";
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Unable to save your profile. Please try again.");
    }
  }

  if (docView) {
    const sections = docView === "terms" ? TERMS_SECTIONS : PRIVACY_SECTIONS;
    const title = docView === "terms" ? "Terms & Conditions" : "Privacy Policy";
    return (
      <div className="auth-modal-overlay">
        <div className="auth-modal">
          <div className="auth-modal-body">
            <button className="auth-modal-back" type="button" onClick={() => setDocView(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m0 0 7 7m-7-7 7-7" /></svg>
              Back
            </button>
            <h1 className="auth-heading">{title}</h1>
            <div className="auth-doc-body">
              {sections.map((section) => (
                <div className="auth-doc-section" key={section.heading}>
                  <h2>{section.heading}</h2>
                  <p>{section.body}</p>
                </div>
              ))}
            </div>
            <button
              className="button button--primary auth-submit"
              type="button"
              onClick={() => {
                if (docView === "terms") setTerms(true);
                else setPrivacy(true);
                setDocView(null);
              }}
            >
              I agree to the {title}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <div className="auth-modal-body">
          <h1 className="auth-heading">Welcome to TaskBuddy!</h1>
          <p className="auth-lede">One more step — tell us how you&rsquo;ll use TaskBuddy.</p>

          <div className="auth-role-switch">
            <div className="audience-switch" role="tablist" aria-label="Choose your TaskBuddy role">
              <button
                type="button"
                role="tab"
                className={"audience-tab" + (role === "homeowner" ? " is-active" : "")}
                aria-selected={role === "homeowner"}
                onClick={() => setRole("homeowner")}
              >
                <span>Homeowner</span>
              </button>
              <button
                type="button"
                role="tab"
                className={"audience-tab" + (role === "provider" ? " is-active" : "")}
                aria-selected={role === "provider"}
                onClick={() => setRole("provider")}
              >
                <span>Service Provider</span>
              </button>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field" data-field="category" hidden={!isProvider}>
              <label htmlFor="complete-category">Skill Category</label>
              <select
                id="complete-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select your skill…</option>
                {Object.keys(CATEGORY_IDS).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="auth-consents">
              <p className="auth-consents-title">Consents &amp; Agreements</p>
              <label className="auth-consent">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
                I have read and agree to the{" "}
                <a href="#terms" onClick={(e) => { e.preventDefault(); setDocView("terms"); }}>
                  Terms &amp; Conditions
                </a>
                <span className="auth-consent-required">*</span>
              </label>
              <label className="auth-consent">
                <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} required />
                I have read and agree to the{" "}
                <a href="#privacy" onClick={(e) => { e.preventDefault(); setDocView("privacy"); }}>
                  Privacy Policy
                </a>
                <span className="auth-consent-required">*</span>
              </label>
              <label className="auth-consent">
                <input
                  type="checkbox"
                  checked={dataCollection}
                  onChange={(e) => setDataCollection(e.target.checked)}
                  required
                />
                I consent to the collection and use of my personal data to provide and improve
                TaskBuddy services.
                <span className="auth-consent-required">*</span>
              </label>
              <label className="auth-consent" data-provider-only hidden={!isProvider}>
                <input
                  type="checkbox"
                  checked={biometric}
                  onChange={(e) => setBiometric(e.target.checked)}
                />
                I consent to the processing of my government-issued ID and biometric data for
                identity verification purposes, in accordance with the Data Privacy Act of 2012
                (RA 10173).
                <span className="auth-consent-required">*</span>
              </label>
              <p className="auth-consents-hint">
                <span className="auth-consent-required">*</span> Required to create your account
              </p>
            </div>

            <button className="button button--primary auth-submit" type="submit" disabled={loading}>
              {loading ? "Saving…" : "Finish setting up"}
            </button>

            {error && (
              <p className="auth-status is-visible is-error" role="status" aria-live="polite">
                {error}
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
