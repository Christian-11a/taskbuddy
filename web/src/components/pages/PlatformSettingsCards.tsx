"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Gauge, Globe, Info, RefreshCw, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/admin/Panel";
import { ApiError } from "@/lib/api/client";
import { getJobCapacity, getPlatformIdentity, updateJobCapacity, updatePlatformIdentity } from "@/lib/services";
import type { JobCapacityLimits, PlatformIdentity } from "@/lib/domain";

/** Shown in place of the controls when the backend update has not been deployed. */
export const NOT_AVAILABLE_MESSAGE = "Not available yet — the backend update has not been deployed.";
/** The API's 409 wording for a save that lost a race with another admin. */
export const IDENTITY_CONFLICT_MESSAGE = "Platform settings changed; reload and try again";
export const PLATFORM_NAME_MAX = 120;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const labelClass = "mb-1.5 block text-[12px] font-medium text-foreground";
const helpClass = "mt-1.5 text-[12px] leading-snug text-muted-foreground";
const fieldErrorClass = "mt-1.5 text-[12px] font-medium text-danger";

function UnavailableNotice() {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3.5 py-3 text-[13px] text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{NOT_AVAILABLE_MESSAGE}</span>
    </div>
  );
}

function LoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
      <XCircle className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">Could not load these settings.</span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw /> Try again
      </Button>
    </div>
  );
}

function SaveFailure({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

// ─── Platform identity (migration 0047) ──────────────────────────────────────

type IdentityLoad = "loading" | "ready" | "unavailable" | "failed";

/**
 * The platform name and support email. A save names the version it read; if an
 * other admin saved first the server answers 409, and this card stops and asks
 * for a reload rather than writing over their change.
 */
export function PlatformIdentityCard() {
  const { showToast } = useToast();
  const [loadState, setLoadState] = useState<IdentityLoad>("loading");
  const [saved, setSaved] = useState<PlatformIdentity | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState("");

  const adopt = useCallback((identity: PlatformIdentity) => {
    setSaved(identity);
    setName(identity.platformName);
    setEmail(identity.supportEmail ?? "");
    setConflict(false);
    setSaveError("");
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const identity = await getPlatformIdentity();
      if (identity === null) {
        setSaved(null);
        setLoadState("unavailable");
        return;
      }
      adopt(identity);
      setLoadState("ready");
    } catch {
      setLoadState("failed");
    }
  }, [adopt]);

  /* eslint-disable react-hooks/set-state-in-effect -- the initial read is an
     external-system synchronization; state is set in its async continuation. */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= PLATFORM_NAME_MAX;
  const emailValid = trimmedEmail === "" || EMAIL_PATTERN.test(trimmedEmail);
  const dirty = !!saved && (trimmedName !== saved.platformName || trimmedEmail !== (saved.supportEmail ?? ""));
  const canSave = !!saved && dirty && nameValid && emailValid && !busy && !conflict;

  function requestSave(e: FormEvent) {
    e.preventDefault();
    if (canSave) setConfirming(true);
  }

  async function confirmSave() {
    if (!saved) return;
    setBusy(true);
    setSaveError("");
    try {
      const next = await updatePlatformIdentity({
        platformName: trimmedName,
        supportEmail: trimmedEmail || null,
        expectedVersion: saved.identityVersion,
      });
      adopt(next);
      setConfirming(false);
      showToast("Platform identity saved.");
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        showToast("Not saved: platform settings changed.", "error");
      } else {
        setSaveError(err instanceof ApiError && err.message ? err.message : "Could not save the platform identity.");
        showToast("Platform identity not saved.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  const controlsDisabled = !saved || busy;

  return (
    <Panel
      title={<span className="flex items-center gap-2"><Globe className="size-4 text-primary" /> Platform identity</span>}
      description="The name people see for TaskBuddy and the address they can write to for help."
    >
      {loadState === "loading" && !saved && <Skeleton className="h-[180px] rounded-[10px]" />}
      {loadState === "failed" && <LoadFailure onRetry={() => void load()} />}
      {loadState === "unavailable" && <UnavailableNotice />}

      {(saved || loadState === "unavailable") && (
        <form onSubmit={requestSave} noValidate className="space-y-4">
          {conflict && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[10px] border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
              <XCircle className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{IDENTITY_CONFLICT_MESSAGE}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                <RefreshCw /> Reload
              </Button>
            </div>
          )}
          <div>
            <label htmlFor="platform-name" className={labelClass}>Platform name</label>
            <Input
              id="platform-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={PLATFORM_NAME_MAX}
              disabled={controlsDisabled}
              aria-invalid={!nameValid || undefined}
              aria-describedby="platform-name-help"
              className="max-w-md"
            />
            <p id="platform-name-help" className={trimmedName.length > 0 && !nameValid ? fieldErrorClass : helpClass}>
              {trimmedName.length === 0 ? "Required." : `1 to ${PLATFORM_NAME_MAX} characters.`}
            </p>
          </div>
          <div>
            <label htmlFor="platform-support-email" className={labelClass}>Support email</label>
            <Input
              id="platform-support-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="help@example.com"
              disabled={controlsDisabled}
              aria-invalid={!emailValid || undefined}
              aria-describedby="platform-support-email-help"
              className="max-w-md"
            />
            <p id="platform-support-email-help" className={emailValid ? helpClass : fieldErrorClass}>
              {emailValid ? "Optional. Leave empty to remove it." : "Enter a valid email address, or leave it empty."}
            </p>
          </div>
          {saveError && <SaveFailure message={saveError} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSave}>Save platform identity</Button>
            {saved && (
              <span className="text-[12px] text-muted-foreground tabular">
                <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px] text-ok" aria-hidden />
                Version {saved.identityVersion}
              </span>
            )}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirming}
        danger={false}
        title="Save the platform identity?"
        message={`The platform name becomes "${trimmedName}" and the support email ${trimmedEmail ? `becomes ${trimmedEmail}` : "is removed"} for everyone who sees them.`}
        confirmLabel="Save identity"
        cancelLabel="Keep editing"
        onConfirm={() => void confirmSave()}
        onCancel={() => !busy && setConfirming(false)}
        busy={busy}
      />
    </Panel>
  );
}

// ─── Job capacity (migration 0048) ───────────────────────────────────────────

type CapacityKey = keyof JobCapacityLimits;
type CapacityForm = Record<CapacityKey, string>;

interface CapacityField {
  key: CapacityKey;
  label: string;
  help: string;
  unit: string;
  step: string;
  /** Whether the value must be a whole number, and the rule it must pass. */
  isValid: (n: number) => boolean;
  rule: string;
}

/** The six limits, in the order the form shows them. Rules mirror the backend's DTO and table checks. */
export const CAPACITY_FIELDS: CapacityField[] = [
  {
    key: "clientActiveMax", label: "Client active jobs", unit: "jobs", step: "1", rule: "a whole number, 1 or more",
    isValid: (n) => Number.isInteger(n) && n >= 1,
    help: "Jobs one client can have open at once, from posted through in progress. Posting another job past this is refused.",
  },
  {
    key: "providerActiveMax", label: "Provider active jobs", unit: "jobs", step: "1", rule: "a whole number, 1 or more",
    isValid: (n) => Number.isInteger(n) && n >= 1,
    help: "Jobs one provider can hold as assigned, confirmed or in progress. Accepting another past this is refused.",
  },
  {
    key: "providerPendingMax", label: "Provider pending applications", unit: "applications", step: "1", rule: "a whole number, 1 or more",
    isValid: (n) => Number.isInteger(n) && n >= 1,
    help: "Applications one provider can have waiting for a decision. Applying again past this is refused.",
  },
  {
    key: "dailyHoursMax", label: "Daily hours per provider", unit: "hours", step: "0.5", rule: "a number greater than 0",
    isValid: (n) => n > 0,
    help: "Hours one provider can be booked for on a single day (Manila time), using each job's default length. Booking past this is refused.",
  },
  {
    key: "restHours", label: "Rest between jobs", unit: "hours", step: "0.5", rule: "a number, 0 or more",
    isValid: (n) => n >= 0,
    help: "Rest kept between the end of one job and the start of a provider's next job. A booking that leaves less than this is refused.",
  },
  {
    key: "travelKmh", label: "Travel speed", unit: "km/h", step: "1", rule: "a number greater than 0",
    isValid: (n) => n > 0,
    help: "The average speed used to estimate travel time between jobs in different places. Slower speeds leave more time between jobs.",
  },
];

/** Reads one field the way a person types it: digits with an optional decimal part, and nothing else. */
function parseCapacityField(raw: string, field: CapacityField): number | null {
  const text = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return field.isValid(n) ? n : null;
}

/** Validates every field. Returns the numbers to send, or the message for each field that fails. */
export function parseJobCapacityForm(form: CapacityForm):
  | { ok: true; limits: JobCapacityLimits }
  | { ok: false; errors: Partial<Record<CapacityKey, string>> } {
  const errors: Partial<Record<CapacityKey, string>> = {};
  const values = {} as Record<CapacityKey, number>;
  for (const field of CAPACITY_FIELDS) {
    const n = parseCapacityField(form[field.key], field);
    if (n === null) errors[field.key] = `Enter ${field.rule}.`;
    else values[field.key] = n;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, limits: values as JobCapacityLimits };
}

function toForm(limits: JobCapacityLimits): CapacityForm {
  return Object.fromEntries(CAPACITY_FIELDS.map((field) => [field.key, String(limits[field.key])])) as CapacityForm;
}

type CapacityLoad = "loading" | "ready" | "unavailable" | "failed";

/** The server-enforced limits on jobs, applications and bookings. The server checks them; this card only sets them. */
export function JobCapacityCard() {
  const { showToast } = useToast();
  const [loadState, setLoadState] = useState<CapacityLoad>("loading");
  const [saved, setSaved] = useState<JobCapacityLimits | null>(null);
  const [form, setForm] = useState<CapacityForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveError, setSaveError] = useState("");

  const adopt = useCallback((limits: JobCapacityLimits) => {
    setSaved(limits);
    setForm(toForm(limits));
    setSaveError("");
  }, []);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const limits = await getJobCapacity();
      if (limits === null) {
        setSaved(null);
        setForm(null);
        setLoadState("unavailable");
        return;
      }
      adopt(limits);
      setLoadState("ready");
    } catch {
      setLoadState("failed");
    }
  }, [adopt]);

  /* eslint-disable react-hooks/set-state-in-effect -- the initial read is an
     external-system synchronization; state is set in its async continuation. */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const parsed = form ? parseJobCapacityForm(form) : null;
  const errors = parsed && !parsed.ok ? parsed.errors : {};
  const dirty = !!saved && !!form && CAPACITY_FIELDS.some((field) => form[field.key].trim() !== String(saved[field.key]));
  const canSave = !!saved && dirty && !!parsed?.ok && !busy;

  function requestSave(e: FormEvent) {
    e.preventDefault();
    if (canSave) setConfirming(true);
  }

  async function confirmSave() {
    if (!parsed?.ok) return;
    setBusy(true);
    setSaveError("");
    try {
      const next = await updateJobCapacity(parsed.limits);
      adopt(next);
      setConfirming(false);
      showToast("Job limits saved.");
    } catch (err) {
      setConfirming(false);
      setSaveError(err instanceof ApiError && err.message ? err.message : "Could not save the job limits.");
      showToast("Job limits not saved.", "error");
    } finally {
      setBusy(false);
    }
  }

  const controlsDisabled = !form || busy;

  return (
    <Panel
      title={<span className="flex items-center gap-2"><Gauge className="size-4 text-primary" /> Job limits</span>}
      description="How many jobs, applications and bookings a person can have at once. The server enforces these limits; changing them here only changes the numbers."
    >
      {loadState === "loading" && !form && <Skeleton className="h-[320px] rounded-[10px]" />}
      {loadState === "failed" && <LoadFailure onRetry={() => void load()} />}
      {loadState === "unavailable" && <UnavailableNotice />}

      {(form || loadState === "unavailable") && (
        <form onSubmit={requestSave} noValidate className="space-y-5">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            {CAPACITY_FIELDS.map((field) => {
              const id = `job-capacity-${field.key}`;
              const error = errors[field.key];
              return (
                <div key={field.key}>
                  <label htmlFor={id} className={labelClass}>
                    {field.label} <span className="font-normal text-muted-foreground">({field.unit})</span>
                  </label>
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={field.step}
                    value={form?.[field.key] ?? ""}
                    onChange={(e) => form && setForm({ ...form, [field.key]: e.target.value })}
                    disabled={controlsDisabled}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`${id}-help`}
                    className="tabular"
                  />
                  <p id={`${id}-help`} className={helpClass}>{field.help}</p>
                  {error && <p className={fieldErrorClass}>{error}</p>}
                </div>
              );
            })}
          </div>
          {saveError && <SaveFailure message={saveError} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSave}>Save job limits</Button>
            {!dirty && saved && <span className="text-[12px] text-muted-foreground">No changes to save.</span>}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={confirming}
        danger={false}
        title="Save these job limits?"
        message="New and changed jobs, applications and bookings are checked against the new limits straight away. Existing jobs are not changed."
        confirmLabel="Save limits"
        cancelLabel="Keep editing"
        onConfirm={() => void confirmSave()}
        onCancel={() => !busy && setConfirming(false)}
        busy={busy}
      />
    </Panel>
  );
}
