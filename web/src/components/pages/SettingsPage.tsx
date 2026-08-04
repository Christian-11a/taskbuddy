"use client";

import { useState } from "react";
import { Save, Bell, Shield, Globe, Palette, Database, Check, AlertCircle } from "lucide-react";
import { useApp, type ConsoleSettings } from "@/context/AppContext";
import { validateEmail, validateName, validatePasswordChange } from "@/lib/validation";

interface FieldErrors {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  platformName?: string;
  supportEmail?: string;
}

const Section = ({ title, icon, note, children }: { title: string; icon: React.ReactNode; note?: string; children: React.ReactNode }) => (
  <div className="rounded-xl p-5 mb-4" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
    <div className="mb-4" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--indigo-light)" }}>{icon}</span>
        <div className="text-white font-semibold" style={{ fontSize: 14 }}>{title}</div>
      </div>
      {note && <div style={{ fontSize: 10, color: "var(--warning-text)", marginTop: 6 }}>{note}</div>}
    </div>
    {children}
  </div>
);

/** Sections below this line only write to localStorage — nothing reaches the
 *  backend yet. Labelled rather than hidden so the intent stays visible, and so
 *  nobody mistakes a saved toggle for a working feature. */
const LOCAL_ONLY_NOTE = "Saved on this device only — not yet connected to the backend.";

function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-white" style={{ fontSize: 12 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{ width: 36, height: 20, borderRadius: 999, background: value ? "var(--indigo)" : "var(--track-bg)", transition: "background 0.2s", border: "none", cursor: "pointer", flexShrink: 0, position: "relative" }}
      >
        <div style={{ position: "absolute", top: 3, left: value ? 19 : 3, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  type = "text",
  onChange,
  disabled = false,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block font-medium" style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
        {label}{disabled && <span style={{ opacity: 0.6 }}> (read-only)</span>}
      </label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full text-white outline-none"
        style={{ background: "var(--input-bg)", border: `1px solid ${error ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: 11, padding: "9px 13px", fontSize: 12, fontFamily: "inherit", opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "text" }}
      />
      {error && (
        <div style={{ fontSize: 10.5, color: "var(--danger-text)", marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const {
    adminProfile, updateDisplayName, changePassword,
    darkMode, setDarkMode,
    sidebarCollapsed, setSidebarCollapsed,
    settings, updateSettings,
  } = useApp();

  const [name, setName] = useState(adminProfile.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const setToggle = (key: keyof ConsoleSettings) => (val: boolean) =>
    updateSettings({ [key]: val });

  const handleSave = async () => {
    setError("");

    // Validate everything up front so all problems show at once.
    const errors: FieldErrors = {
      name: validateName(name, "Display name") ?? undefined,
      platformName: validateName(settings.platformName, "Platform name") ?? undefined,
      supportEmail: validateEmail(settings.supportEmail, "Support email") ?? undefined,
    };
    // Password change is optional — only validated when a new password is set.
    if (newPassword) {
      Object.assign(errors, validatePasswordChange(currentPassword, newPassword, confirmPassword));
    }
    const hasErrors = Object.values(errors).some(Boolean);
    setFieldErrors(hasErrors ? errors : {});
    if (hasErrors) {
      setError("Please fix the highlighted fields.");
      return;
    }

    if (newPassword) {
      const ok = await changePassword(currentPassword, newPassword);
      if (!ok) {
        setError("Current password is incorrect.");
        setFieldErrors({ currentPassword: "Current password is incorrect." });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }

    if (name.trim() !== adminProfile.name) {
      const ok = await updateDisplayName(name.trim());
      if (!ok) {
        setError("Could not save your display name. Please try again.");
        return;
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="mb-4">
        <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>Settings</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Configure your admin console preferences</div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-xl mb-4" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)", padding: "10px 14px", fontSize: 12, color: "var(--success-text)" }}>
          <Check size={13} /> Settings saved successfully.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", padding: "10px 14px", fontSize: 12, color: "var(--danger-text)" }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <Section title="Account" icon={<Shield size={15} />}>
            <Field label="Display Name" value={name} onChange={setName} error={fieldErrors.name} />
            {/* Email lives on auth.users, not profiles — no endpoint exposes changing it. */}
            <Field label="Email Address" value={adminProfile.email} type="email" disabled />
            <Field label="Current Password" value={currentPassword} type="password" onChange={setCurrentPassword} placeholder="Required to change password" error={fieldErrors.currentPassword} />
            <Field label="New Password" value={newPassword} type="password" onChange={setNewPassword} placeholder="Min. 8 characters, letters & numbers" error={fieldErrors.newPassword} />
            <Field label="Confirm New Password" value={confirmPassword} type="password" onChange={setConfirmPassword} placeholder="Re-enter the new password" error={fieldErrors.confirmPassword} />
          </Section>
          <Section title="Notifications" icon={<Bell size={15} />} note={LOCAL_ONLY_NOTE}>
            <Toggle label="Email alerts for new verifications" value={settings.emailAlerts} onChange={setToggle("emailAlerts")} />
            <Toggle label="Notify on disputed transactions" value={settings.disputeNotify} onChange={setToggle("disputeNotify")} />
            <Toggle label="Daily summary report" sub="Sent every morning at 8 AM" value={settings.dailySummary} onChange={setToggle("dailySummary")} />
            <Toggle label="New user registrations" value={settings.newUserNotify} onChange={setToggle("newUserNotify")} />
          </Section>
        </div>
        <div>
          <Section title="Platform" icon={<Globe size={15} />} note={LOCAL_ONLY_NOTE}>
            <Field label="Platform Name" value={settings.platformName} onChange={(v) => updateSettings({ platformName: v })} error={fieldErrors.platformName} />
            <Field label="Support Email" value={settings.supportEmail} type="email" onChange={(v) => updateSettings({ supportEmail: v })} error={fieldErrors.supportEmail} />
            <Field label="Base Currency" value="PHP (₱)" disabled />
            <Toggle label="Maintenance Mode" sub="Temporarily disable user access" value={settings.maintenanceMode} onChange={setToggle("maintenanceMode")} />
          </Section>
          <Section title="Appearance" icon={<Palette size={15} />}>
            <Toggle label="Dark Mode" value={darkMode} onChange={setDarkMode} />
            <Toggle label="Compact sidebar" sub="Collapse the sidebar to icons only" value={sidebarCollapsed} onChange={setSidebarCollapsed} />
            <Toggle label="Show activity badge" sub="Pending count on the Verifications nav item" value={settings.activityBadge} onChange={setToggle("activityBadge")} />
          </Section>
          <Section title="Data & Privacy" icon={<Database size={15} />} note={LOCAL_ONLY_NOTE}>
            <Toggle label="Auto-purge inactive accounts (1 year)" value={settings.autoPurge} onChange={setToggle("autoPurge")} />
            <Toggle label="Anonymize exported reports" value={settings.anonymizeExports} onChange={setToggle("anonymizeExports")} />
            <Toggle label="Audit log retention (90 days)" value={settings.auditLog} onChange={setToggle("auditLog")} />
          </Section>
        </div>
      </div>

      <div className="flex justify-end mt-2">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 font-semibold transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(172deg, #6363f1 0%, #8b5cf6 100%)", color: "#fff", borderRadius: 11, padding: "10px 20px", fontSize: 13, border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Save size={14} /> Save Changes
        </button>
      </div>
    </div>
  );
}
