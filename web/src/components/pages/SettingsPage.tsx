"use client";

import { useId, useState } from "react";
import { AlertCircle, Bell, Check, Construction, Database, Globe, Moon, Palette, Save, Sun, UserRound } from "lucide-react";
import { useApp, type ConsoleSettings } from "@/context/AppContext";
import { validateName, validatePasswordChange } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/Panel";
import { cn } from "@/lib/utils";

interface FieldErrors {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

const SECTIONS = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "platform", label: "Platform", icon: Globe },
  { id: "maintenance", label: "Maintenance", icon: Construction },
  { id: "privacy", label: "Data & Privacy", icon: Database },
] as const;

function Section({
  id,
  title,
  description,
  icon: Icon,
  badge,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={`settings-${id}`} aria-labelledby={`settings-${id}-title`} className="scroll-mt-6 rounded-[12px] border border-border bg-surface shadow-ui-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-primary-soft text-primary">
            <Icon className="size-4" />
          </span>
          <div>
            <h2 id={`settings-${id}-title`} className="text-[14px] font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
          </div>
        </div>
        {badge}
      </header>
      <div className="px-5 py-2">{children}</div>
    </section>
  );
}

function Toggle({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        {sub && <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

/**
 * `useId` keeps the label/input pair stable across server and client renders.
 * `aria-describedby` ties the validation message to the field, and
 * `aria-invalid` marks it as failing, so the error is announced on focus.
 */
function Field({
  label,
  value,
  type = "text",
  onChange,
  disabled = false,
  placeholder,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="py-2">
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium">
        {label}
        {disabled && <span className="font-normal text-subtle"> (read-only)</span>}
      </label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(disabled && "cursor-not-allowed bg-surface-2")}
      />
      {error && (
        <div id={errorId} className="mt-1 text-[11.5px] text-danger">
          {error}
        </div>
      )}
    </div>
  );
}

function ThemeCard({ dark, selected, onSelect }: { dark: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group flex flex-col gap-2 rounded-[12px] border p-2 text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary shadow-[0_0_0_3px_var(--ui-accent-soft)]" : "border-border hover:border-border-strong",
      )}
    >
      {/* A miniature of the console in that theme. */}
      <span
        aria-hidden
        className="flex h-[84px] overflow-hidden rounded-[8px] border"
        style={{ background: dark ? "#0f1115" : "#f6f8fa", borderColor: dark ? "#262a31" : "#e5e7eb" }}
      >
        <span className="w-[26%] space-y-1.5 p-2" style={{ background: dark ? "#16181d" : "#ffffff" }}>
          <span className="block h-1.5 w-3/4 rounded-full" style={{ background: dark ? "#22a6b8" : "#0e7490" }} />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="block h-1 w-full rounded-full" style={{ background: dark ? "#262a31" : "#e5e7eb" }} />
          ))}
        </span>
        <span className="flex-1 space-y-1.5 p-2">
          <span className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="block h-5 rounded" style={{ background: dark ? "#16181d" : "#ffffff", border: `1px solid ${dark ? "#262a31" : "#e5e7eb"}` }} />
            ))}
          </span>
          <span className="block h-8 rounded" style={{ background: dark ? "#16181d" : "#ffffff", border: `1px solid ${dark ? "#262a31" : "#e5e7eb"}` }} />
        </span>
      </span>
      <span className="flex items-center justify-between px-1 pb-0.5 text-[12.5px] font-medium">
        <span className="flex items-center gap-1.5">
          {dark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
          {dark ? "Dark" : "Light"}
        </span>
        {selected && <Check className="size-3.5 text-primary" />}
      </span>
    </button>
  );
}

export function SettingsPage() {
  const {
    adminProfile, updateDisplayName, changePassword,
    darkMode, setDarkMode,
    sidebarCollapsed, setSidebarCollapsed,
    settings, updateSettings,
    maintenanceMode, setMaintenanceMode,
  } = useApp();

  const [name, setName] = useState(adminProfile.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  // Turning maintenance ON locks every client and provider out at once, so it asks first.
  const [confirmingMaintenance, setConfirmingMaintenance] = useState(false);

  const handleMaintenanceToggle = async (enabled: boolean) => {
    setMaintenanceBusy(true);
    const ok = await setMaintenanceMode(enabled);
    setMaintenanceBusy(false);
    setConfirmingMaintenance(false);
    if (!ok) setError("Could not update maintenance mode. Please try again.");
  };

  const setToggle = (key: keyof ConsoleSettings) => (val: boolean) => updateSettings({ [key]: val });

  const accountDirty = name.trim() !== adminProfile.name || !!currentPassword || !!newPassword || !!confirmPassword;

  const handleSave = async () => {
    setError("");

    // Validate everything up front so all problems show at once.
    const errors: FieldErrors = {
      name: validateName(name, "Display name") ?? undefined,
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

    setSaving(true);
    try {
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
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="System" title="Settings" description="Your account and how this console looks and behaves." />

      <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:sticky lg:top-0 lg:block">
          <ul className="space-y-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a
                  href={`#settings-${id}`}
                  className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="size-4" /> {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {saved && (
            <div role="status" className="flex items-center gap-2 rounded-[10px] border border-ok/25 bg-ok-soft px-4 py-3 text-[13px] text-ok">
              <Check className="size-4" /> Account changes saved.
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-[10px] border border-danger/25 bg-danger-soft px-4 py-3 text-[13px] text-danger">
              <AlertCircle className="size-4" /> {error}
            </div>
          )}

          <Section id="account" title="Account" description="Your name on the audit trail, and your password." icon={UserRound}>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Display name" value={name} onChange={setName} error={fieldErrors.name} autoComplete="name" />
              {/* Email lives on auth.users, not profiles — no endpoint exposes changing it. */}
              <Field label="Email address" value={adminProfile.email} type="email" disabled />
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <div className="py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-subtle">Change password</div>
              <div className="grid gap-x-4 sm:grid-cols-3">
                <Field label="Current password" value={currentPassword} type="password" onChange={setCurrentPassword} placeholder="Required to change" error={fieldErrors.currentPassword} autoComplete="current-password" />
                <Field label="New password" value={newPassword} type="password" onChange={setNewPassword} placeholder="8+ characters, letters & numbers" error={fieldErrors.newPassword} autoComplete="new-password" />
                <Field label="Confirm new password" value={confirmPassword} type="password" onChange={setConfirmPassword} placeholder="Re-enter it" error={fieldErrors.confirmPassword} autoComplete="new-password" />
              </div>
            </div>
            {/* Account changes need an explicit save; working appearance
                choices apply as they change. */}
            <div className="-mx-5 mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface-2/60 px-5 py-3">
              <span className="text-[12px] text-muted-foreground">Appearance and activity badge changes apply as you change them.</span>
              <Button onClick={handleSave} disabled={saving || !accountDirty}>
                <Save /> {saving ? "Saving…" : "Save account changes"}
              </Button>
            </div>
          </Section>

          <Section id="appearance" title="Appearance" description="Your theme is saved to your admin profile; the sidebar and badge choices stay on this device." icon={Palette}>
            <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-2 gap-3 py-3">
              <ThemeCard dark={false} selected={!darkMode} onSelect={() => setDarkMode(false)} />
              <ThemeCard dark selected={darkMode} onSelect={() => setDarkMode(true)} />
            </div>
            <Toggle label="Compact sidebar" sub="Collapse the sidebar to icons only" value={sidebarCollapsed} onChange={setSidebarCollapsed} />
            <Toggle label="Show activity badge" sub="Pending counts on the Verifications and Disputes nav items" value={settings.activityBadge} onChange={setToggle("activityBadge")} />
          </Section>

          <Section id="notifications" title="Notifications" description="Not available yet. Notification settings are not connected to a delivery service." icon={Bell}>
            <Toggle label="Email alerts for new verifications" value={settings.emailAlerts} onChange={setToggle("emailAlerts")} disabled />
            <Toggle label="Notify on disputed transactions" value={settings.disputeNotify} onChange={setToggle("disputeNotify")} disabled />
            <Toggle label="Daily summary report" value={settings.dailySummary} onChange={setToggle("dailySummary")} disabled />
            <Toggle label="New user registrations" value={settings.newUserNotify} onChange={setToggle("newUserNotify")} disabled />
          </Section>

          <Section id="platform" title="Platform" description="Not available yet. These values are not connected to platform behavior." icon={Globe}>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Platform name" value={settings.platformName} disabled />
              <Field label="Support email" value={settings.supportEmail} type="email" disabled />
              <Field label="Base currency" value="PHP (₱)" disabled />
            </div>
          </Section>

          <Section
            id="maintenance"
            title="Maintenance"
            description="Takes the TaskBuddy app offline for everyone except admins."
            icon={Construction}
            badge={maintenanceMode ? <Badge tone="danger" dot>Live now</Badge> : <Badge tone="ok" dot>App online</Badge>}
          >
            {maintenanceMode && (
              <div className="mt-3 rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
                Everyone but admins is currently blocked from the app.
              </div>
            )}
            <Toggle
              label="Maintenance Mode"
              sub={maintenanceBusy ? "Saving…" : "Blocks all non-admin access to the app immediately"}
              value={maintenanceMode}
              disabled={maintenanceBusy}
              onChange={(enabled) => (enabled ? setConfirmingMaintenance(true) : void handleMaintenanceToggle(false))}
            />
          </Section>

          <Section id="privacy" title="Data & Privacy" description="Not available yet. These options do not change data handling or reports." icon={Database}>
            <Toggle label="Auto-purge inactive accounts (1 year)" value={settings.autoPurge} onChange={setToggle("autoPurge")} disabled />
            <Toggle label="Report anonymization" value={settings.anonymizeExports} onChange={setToggle("anonymizeExports")} disabled />
            <Toggle label="Audit log retention (90 days)" value={settings.auditLog} onChange={setToggle("auditLog")} disabled />
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingMaintenance}
        title="Turn on Maintenance Mode?"
        message="Every client and provider is blocked from the app until you turn it off. Admins keep access to this console."
        confirmLabel="Turn on"
        cancelLabel="Keep the app online"
        busy={maintenanceBusy}
        onConfirm={() => void handleMaintenanceToggle(true)}
        onCancel={() => setConfirmingMaintenance(false)}
      />
    </div>
  );
}
