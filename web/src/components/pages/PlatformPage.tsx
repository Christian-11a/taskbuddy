"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, FolderCog, Info, Pencil, Percent, Plus, RefreshCw, ShieldCheck, UserRoundPlus, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Panel } from "@/components/admin/Panel";
import { Avatar, FilterTabs, initialsOf } from "@/components/admin/queue";
import { SelectFilter } from "@/components/admin/table";
import {
  broadcastNotification, createAdmin, createCategory, getAdmins, getCategories, getCommission,
  revokeAdmin, updateCategory, updateCommission,
} from "@/lib/services";
import type { AdminAccount, CommissionSettings, ServiceCategory } from "@/lib/domain";
import { formatCurrency, formatDate } from "@/lib/adapters";
import { cn } from "@/lib/utils";

type Tab = "commission" | "categories" | "admins" | "broadcast";
type Audience = "all" | "clients" | "providers";

const AUDIENCE_LABEL: Record<Audience, string> = { all: "all users", clients: "clients", providers: "providers" };
const labelClass = "mb-1.5 block text-[12px] font-medium text-foreground";

export function PlatformPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("commission");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [commission, setCommission] = useState<CommissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [rate, setRate] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<AdminAccount | null>(null);
  const [confirmingBroadcast, setConfirmingBroadcast] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [nextCategories, nextAdmins, nextCommission] = await Promise.all([getCategories(), getAdmins(), getCommission()]);
      setCategories(nextCategories);
      setAdmins(nextAdmins);
      setCommission(nextCommission);
      setRate(String(Math.round(nextCommission.rate * 10000) / 100));
    } catch {
      setError("Could not load platform settings. Check that the updated backend has been deployed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch is an
     external-system synchronization; the state updates happen in its async
     continuation. */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function saveCommission(e: FormEvent) {
    e.preventDefault();
    const percent = Number(rate);
    if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
      showToast("Enter a rate between 0 and 50%.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await updateCommission(percent / 100);
      setCommission(result);
      showToast("Commission rate updated.");
    } catch {
      showToast("Could not update commission rate.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!categoryName.trim()) return;
    setBusy(true);
    try {
      const created = await createCategory(categoryName);
      setCategories((prev) => [...prev, created].sort((a, b) => a.id - b.id));
      setCategoryName("");
      showToast("Category created.");
    } catch {
      showToast("Could not create category. Names must be unique.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(id: number) {
    if (!editCategoryName.trim()) return;
    setBusy(true);
    try {
      const updated = await updateCategory(id, { name: editCategoryName });
      setCategories((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setEditingCategory(null);
      showToast("Category renamed.");
    } catch {
      showToast("Could not rename that category.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(item: ServiceCategory) {
    setBusy(true);
    try {
      const updated = await updateCategory(item.id, { is_active: !item.isActive });
      setCategories((prev) => prev.map((row) => (row.id === item.id ? updated : row)));
      showToast(updated.isActive ? "Category activated." : "Category deactivated.");
    } catch {
      showToast("Could not update category.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addAdmin(e: FormEvent) {
    e.preventDefault();
    if (!adminName.trim() || !adminEmail.trim()) return;
    setBusy(true);
    try {
      await createAdmin(adminEmail, adminName);
      setAdmins(await getAdmins());
      setAdminName("");
      setAdminEmail("");
      showToast("Admin account created. A password setup email was requested.");
    } catch {
      showToast("Could not create admin. Check the email and existing account role.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeAdmin(revoking.id);
      setAdmins(await getAdmins());
      setRevoking(null);
      showToast("Admin access revoked.");
    } catch {
      showToast("Could not revoke this admin. You cannot revoke yourself or the last admin.", "error");
    } finally {
      setBusy(false);
    }
  }

  function requestBroadcast(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setConfirmingBroadcast(true);
  }

  async function sendBroadcast() {
    setBusy(true);
    try {
      const result = await broadcastNotification(title, body, audience);
      showToast(
        `Announcement sent to ${result.sent} user${result.sent === 1 ? "" : "s"}${result.failed ? `; ${result.failed} failed` : ""}.`,
        result.failed ? "error" : "success",
      );
      setTitle("");
      setBody("");
      setConfirmingBroadcast(false);
    } catch {
      showToast("Could not send announcement.", "error");
    } finally {
      setBusy(false);
    }
  }

  const percent = Number(rate);
  const rateValid = rate.trim() !== "" && Number.isFinite(percent) && percent >= 0 && percent <= 50;
  const exampleJob = 1000;
  const activeCategories = categories.filter((c) => c.isActive).length;
  const activeAdmins = admins.filter((a) => !a.deactivatedAt && !a.deletedAt).length;

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Platform"
        description="The marketplace rules, service catalogue, administrators, and announcements."
        actions={
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); void load(true); }} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-[10px] border border-danger/25 bg-danger-soft px-4 py-3 text-[13px] text-danger">
          <XCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mb-4">
        <FilterTabs
          id="platform-tab"
          label="Platform section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "commission", label: "Commission" },
            { value: "categories", label: "Categories", count: loading ? undefined : categories.length },
            { value: "admins", label: "Admin accounts", count: loading ? undefined : activeAdmins },
            { value: "broadcast", label: "Broadcast" },
          ]}
        />
      </div>

      {loading ? (
        <div aria-busy="true" aria-label="Loading platform controls…">
          <Skeleton className="h-[320px] rounded-[12px]" />
        </div>
      ) : (
        <>
          {tab === "commission" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <Panel
                title={<span className="flex items-center gap-2"><Percent className="size-4 text-primary" /> Platform commission</span>}
                description="The share TaskBuddy keeps from future escrow releases. Jobs already settled keep their original figures."
              >
                <form onSubmit={saveCommission} className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className={labelClass}>Commission rate (%)</span>
                    <div className="relative">
                      <Input type="number" min="0" max="50" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!rateValid || undefined} className="w-44 pr-8 tabular" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-subtle">%</span>
                    </div>
                  </label>
                  <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save rate"}</Button>
                </form>
                {commission && (
                  <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <CheckCircle2 className="size-4 text-ok" /> Current rate:{" "}
                    <strong className="font-semibold text-foreground">{(commission.rate * 100).toFixed(2)}%</strong> · Last updated {formatDate(commission.updatedAt)}
                  </div>
                )}
                <div className="mt-5 flex items-start gap-2 rounded-[10px] bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>
                    A rate of 15% is entered as <strong className="text-foreground">15</strong> here. The API receives the safe fraction{" "}
                    <strong className="text-foreground">0.15</strong> and caps it at 50%.
                  </span>
                </div>
              </Panel>
              <Panel title="What this means" description={`On a ${formatCurrency(exampleJob)} job`}>
                {rateValid ? (
                  <>
                    <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
                      <div className="h-full flex-1 bg-ok/70" />
                    </div>
                    <dl className="space-y-2 text-[13px]">
                      <div className="flex justify-between">
                        <dt className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" /> TaskBuddy keeps</dt>
                        <dd className="tabular font-semibold">{formatCurrency((exampleJob * percent) / 100)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="flex items-center gap-2"><span className="size-2 rounded-full bg-ok/70" /> Provider receives</dt>
                        <dd className="tabular font-semibold">{formatCurrency(exampleJob - (exampleJob * percent) / 100)}</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="text-[12.5px] text-danger">Enter a rate between 0 and 50%.</p>
                )}
              </Panel>
            </div>
          )}

          {tab === "categories" && (
            <Panel
              title={<span className="flex items-center gap-2"><FolderCog className="size-4 text-primary" /> Service categories</span>}
              description="Rename categories or hide them from new job forms. Deactivating keeps historical jobs intact; deletion is intentionally unavailable."
              action={<span className="text-[12px] text-muted-foreground tabular">{activeCategories} of {categories.length} active</span>}
              bodyClassName="px-0 pb-0"
            >
              <form onSubmit={addCategory} className="flex flex-wrap gap-2 px-5 pb-4">
                <Input aria-label="New category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} maxLength={60} placeholder="New category name" className="min-w-[220px] flex-1" />
                <Button type="submit" variant="outline" disabled={busy || !categoryName.trim()}>
                  <Plus /> Add category
                </Button>
              </form>
              {categories.length === 0 ? (
                <div className="border-t border-border py-10 text-center text-[13px] text-muted-foreground">No categories found.</div>
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {categories.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 hover:bg-accent/50">
                      {editingCategory === item.id ? (
                        <form
                          className="flex flex-1 flex-wrap items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void saveCategory(item.id);
                          }}
                        >
                          <Input
                            autoFocus
                            aria-label={`Rename ${item.name}`}
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            onKeyDown={(e) => e.key === "Escape" && setEditingCategory(null)}
                            maxLength={60}
                            className="max-w-xs flex-1"
                          />
                          <Button type="submit" size="sm" disabled={busy || !editCategoryName.trim()}>Save</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Button>
                        </form>
                      ) : (
                        <>
                          <span className={cn("flex-1 text-[13px] font-medium", !item.isActive && "text-muted-foreground line-through decoration-subtle")}>{item.name}</span>
                          <Badge tone={item.isActive ? "ok" : "neutral"} dot>{item.isActive ? "Active" : "Inactive"}</Badge>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingCategory(item.id); setEditCategoryName(item.name); }}>
                              <Pencil className="size-3.5" /> Rename
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void toggleCategory(item)} disabled={busy} className={item.isActive ? "text-warn" : "text-ok"}>
                              {item.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {tab === "admins" && (
            <Panel
              title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Admin accounts</span>}
              description="Invite another administrator without sharing passwords. New admins get an email to set their own password."
              bodyClassName="px-0 pb-0"
            >
              <form onSubmit={addAdmin} className="grid grid-cols-1 gap-2 px-5 pb-4 md:grid-cols-[1fr_1fr_auto]">
                <Input aria-label="Admin full name" value={adminName} onChange={(e) => setAdminName(e.target.value)} maxLength={120} placeholder="Full name" />
                <Input aria-label="Admin email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="name@example.com" />
                <Button type="submit" disabled={busy || !adminName.trim() || !adminEmail.trim()}>
                  <UserRoundPlus /> Add admin
                </Button>
              </form>
              <ul className="divide-y divide-border border-t border-border">
                {admins.map((item) => {
                  const revoked = !!(item.deactivatedAt || item.deletedAt);
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-accent/50">
                      <Avatar initials={initialsOf(item.name)} tone={revoked ? "neutral" : "accent"} />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-[13px] font-medium", revoked && "text-muted-foreground")}>{item.name}</div>
                        <div className="truncate text-[12px] text-muted-foreground">{item.email}</div>
                      </div>
                      <span className="hidden text-[12px] text-muted-foreground sm:inline">Added {formatDate(item.createdAt)}</span>
                      <Badge tone={revoked ? "danger" : "ok"} dot>{revoked ? "Revoked" : "Active"}</Badge>
                      {!revoked && (
                        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setRevoking(item)}>
                          Revoke
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {tab === "broadcast" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Panel
                title={<span className="flex items-center gap-2"><BellRing className="size-4 text-primary" /> Broadcast announcement</span>}
                description="Send an in-app notification to active users. Admins, suspended and deleted accounts are left out automatically."
              >
                <form onSubmit={requestBroadcast} className="space-y-4">
                  <label className="block">
                    <span className={labelClass}>Audience</span>
                    <SelectFilter label="Audience" value={audience} onChange={(v) => setAudience(v as Audience)} className="h-9 w-full border-input bg-surface text-foreground">
                      <option value="all">All users</option>
                      <option value="clients">Clients only</option>
                      <option value="providers">Providers only</option>
                    </SelectFilter>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Title</span>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Short announcement title" />
                    <span className="mt-1 block text-right text-[11px] tabular text-subtle">{title.length}/120</span>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Message</span>
                    <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={6} placeholder="What should users know?" />
                    <span className="mt-1 block text-right text-[11px] tabular text-subtle">{body.length}/500</span>
                  </label>
                  <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>
                    <BellRing /> {busy ? "Sending…" : "Send announcement"}
                  </Button>
                </form>
              </Panel>
              <Panel title="Preview" description="How it appears in the TaskBuddy app">
                <div className="rounded-[18px] bg-surface-2 p-3">
                  <div className="flex items-start gap-3 rounded-[14px] border border-border bg-surface p-3 shadow-ui-md">
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny static app icon */}
                    <img src="/promo/taskbuddy-mascot.webp" alt="" className="size-9 shrink-0 rounded-[9px] bg-primary-soft object-contain p-0.5" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-subtle">TaskBuddy · now</div>
                      <div className="mt-0.5 truncate text-[13px] font-semibold">{title.trim() || "Announcement title"}</div>
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[12.5px] leading-snug text-muted-foreground">
                        {body.trim() || "Your message shows here as users will read it."}
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[12px] text-muted-foreground">
                  Goes to <span className="font-medium text-foreground">{AUDIENCE_LABEL[audience]}</span>.
                </p>
              </Panel>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!revoking}
        title="Revoke admin access?"
        message={revoking ? `${revoking.name} will be demoted to a regular user and can no longer access the console.` : ""}
        confirmLabel="Revoke access"
        onConfirm={() => void confirmRevoke()}
        onCancel={() => !busy && setRevoking(null)}
        busy={busy}
      />
      <ConfirmDialog
        open={confirmingBroadcast}
        danger={false}
        title={`Send to ${AUDIENCE_LABEL[audience]}?`}
        message="Everyone in this audience gets the notification right away. It can't be recalled once sent."
        confirmLabel="Send announcement"
        cancelLabel="Keep editing"
        onConfirm={() => void sendBroadcast()}
        onCancel={() => !busy && setConfirmingBroadcast(false)}
        busy={busy}
      >
        <div className="rounded-[10px] border border-border bg-surface-2 px-3.5 py-2.5">
          <div className="text-[13px] font-semibold">{title.trim()}</div>
          <p className="mt-0.5 line-clamp-3 text-[12.5px] text-muted-foreground">{body.trim()}</p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
