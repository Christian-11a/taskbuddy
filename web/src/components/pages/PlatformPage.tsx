"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, FolderCog, Percent, Plus, RefreshCw, ShieldCheck, UserRound, UserRoundPlus, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  broadcastNotification, createAdmin, createCategory, getAdmins, getCategories, getCommission,
  revokeAdmin, updateCategory, updateCommission,
} from "@/lib/services";
import type { AdminAccount, CommissionSettings, ServiceCategory } from "@/lib/domain";
import { formatDate } from "@/lib/adapters";

type Tab = "commission" | "categories" | "admins" | "broadcast";
const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "9px 11px", fontSize: "var(--fs-sm)", color: "var(--text-white)", fontFamily: "inherit" };

function Section({ title, description, icon, children }: { title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}><div className="flex items-start gap-3 mb-5"><div className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: "var(--indigo-dark)", color: "var(--indigo-light)" }}>{icon}</div><div><h2 className="text-white font-semibold" style={{ fontSize: "var(--fs-md)" }}>{title}</h2><p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: "var(--sp-1)", lineHeight: 1.45 }}>{description}</p></div></div>{children}</section>;
}

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
  const [audience, setAudience] = useState<"all" | "clients" | "providers">("all");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<AdminAccount | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const [nextCategories, nextAdmins, nextCommission] = await Promise.all([getCategories(), getAdmins(), getCommission()]);
      setCategories(nextCategories); setAdmins(nextAdmins); setCommission(nextCommission); setRate(String(Math.round(nextCommission.rate * 10000) / 100));
    } catch {
      setError("Could not load platform settings. Check that the updated backend has been deployed.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  /* eslint-disable react-hooks/set-state-in-effect -- initial data fetch is an
     external-system synchronization; the state updates happen in its async
     continuation. */
  useEffect(() => { void load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function saveCommission(e: FormEvent) {
    e.preventDefault(); const percent = Number(rate);
    if (!Number.isFinite(percent) || percent < 0 || percent > 50) { showToast("Enter a rate between 0 and 50%.", "error"); return; }
    setBusy(true); try { const result = await updateCommission(percent / 100); setCommission(result); showToast("Commission rate updated."); } catch { showToast("Could not update commission rate.", "error"); } finally { setBusy(false); }
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault(); if (!categoryName.trim()) return; setBusy(true);
    try { const created = await createCategory(categoryName); setCategories((prev) => [...prev, created].sort((a, b) => a.id - b.id)); setCategoryName(""); showToast("Category created."); } catch { showToast("Could not create category. Names must be unique.", "error"); } finally { setBusy(false); }
  }

  async function saveCategory(id: number) {
    if (!editCategoryName.trim()) return; setBusy(true);
    try { const updated = await updateCategory(id, { name: editCategoryName }); setCategories((prev) => prev.map((item) => item.id === id ? updated : item)); setEditingCategory(null); showToast("Category renamed."); } catch { showToast("Could not rename that category.", "error"); } finally { setBusy(false); }
  }

  async function toggleCategory(item: ServiceCategory) {
    setBusy(true); try { const updated = await updateCategory(item.id, { is_active: !item.isActive }); setCategories((prev) => prev.map((row) => row.id === item.id ? updated : row)); showToast(updated.isActive ? "Category activated." : "Category deactivated."); } catch { showToast("Could not update category.", "error"); } finally { setBusy(false); }
  }

  async function addAdmin(e: FormEvent) {
    e.preventDefault(); if (!adminName.trim() || !adminEmail.trim()) return; setBusy(true);
    try { await createAdmin(adminEmail, adminName); setAdmins(await getAdmins()); setAdminName(""); setAdminEmail(""); showToast("Admin account created. A password setup email was requested."); } catch { showToast("Could not create admin. Check the email and existing account role.", "error"); } finally { setBusy(false); }
  }

  async function confirmRevoke() {
    if (!revoking) return; setBusy(true);
    try { await revokeAdmin(revoking.id); setAdmins(await getAdmins()); setRevoking(null); showToast("Admin access revoked."); } catch { showToast("Could not revoke this admin. You cannot revoke yourself or the last admin.", "error"); } finally { setBusy(false); }
  }

  async function sendBroadcast(e: FormEvent) {
    e.preventDefault(); if (!title.trim() || !body.trim()) return; setBusy(true);
    try { const result = await broadcastNotification(title, body, audience); showToast(`Announcement sent to ${result.sent} user${result.sent === 1 ? "" : "s"}${result.failed ? `; ${result.failed} failed` : ""}.`, result.failed ? "error" : "success"); setTitle(""); setBody(""); } catch { showToast("Could not send announcement.", "error"); } finally { setBusy(false); }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "commission", label: "Commission", icon: <Percent size={13} /> },
    { id: "categories", label: "Categories", icon: <FolderCog size={13} /> },
    { id: "admins", label: "Admin accounts", icon: <ShieldCheck size={13} /> },
    { id: "broadcast", label: "Broadcast", icon: <BellRing size={13} /> },
  ];

  return <div>
    <div className="flex items-start justify-between flex-wrap gap-3 mb-4"><div><div className="text-white font-bold" style={{ fontSize: "var(--fs-2xl)", letterSpacing: "-0.025em" }}>Platform</div><div style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Manage the marketplace rules, catalogue, administrators, and announcements.</div></div><button onClick={() => { setRefreshing(true); void load(true); }} disabled={refreshing} className="flex items-center gap-1.5 font-semibold disabled:opacity-40" style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: "var(--fs-xs)", color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}><RefreshCw size={12} /> Refresh</button></div>
    {error && <div role="alert" className="flex items-center gap-2 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", padding: "10px 14px", fontSize: "var(--fs-xs)", color: "var(--danger-text)" }}><XCircle size={14} />{error}</div>}
    <div className="inline-flex flex-wrap mb-4" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: "var(--r-md)", gap: 2 }}>{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className="flex items-center gap-1.5 rounded-lg font-medium" style={{ padding: "8px 12px", fontSize: "var(--fs-xs)", background: tab === item.id ? "var(--indigo-dark)" : "transparent", color: tab === item.id ? "var(--indigo-light)" : "var(--text-muted)", border: "none", cursor: "pointer", fontFamily: "inherit" }}>{item.icon}{item.label}</button>)}</div>
    {loading ? <div className="flex items-center justify-center" style={{ height: 280, color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>Loading platform controls…</div> : <>
      {tab === "commission" && <Section title="Platform commission" description="Set the fraction retained from future escrow releases. Existing settled jobs keep their original figures." icon={<Percent size={15} />}><form onSubmit={saveCommission} className="flex items-end gap-3 flex-wrap"><label className="block" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>Commission rate (%)<input type="number" min="0" max="50" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} style={{ ...inputStyle, display: "block", width: 180, marginTop: 6 }} /></label><button disabled={busy} className="btn-primary disabled:opacity-40" style={{ borderRadius: "var(--r-md)", padding: "9px 15px", fontSize: "var(--fs-xs)" }}>{busy ? "Saving…" : "Save rate"}</button></form>{commission && <div className="flex items-center gap-2 mt-4" style={{ fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}><CheckCircle2 size={13} style={{ color: "var(--success-text)" }} /> Current rate: <strong style={{ color: "var(--text-white)" }}>{(commission.rate * 100).toFixed(2)}%</strong> · Last updated {formatDate(commission.updatedAt)}</div>}<div className="rounded-lg mt-5" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)", padding: "10px 12px", color: "var(--warning-text)", fontSize: "var(--fs-2xs)", lineHeight: 1.45 }}>A rate of 15% is entered as <strong>15</strong> here. The API receives the safe fraction <strong>0.15</strong> and caps it at 50%.</div></Section>}
      {tab === "categories" && <Section title="Service categories" description="Rename categories or deactivate them from new job forms. Deactivation preserves historical jobs; deletion is intentionally unavailable." icon={<FolderCog size={15} />}><form onSubmit={addCategory} className="flex gap-2 mb-4 flex-wrap"><input aria-label="New category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} maxLength={60} placeholder="New category name" style={{ ...inputStyle, flex: "1 1 240px" }} /><button disabled={busy || !categoryName.trim()} className="flex items-center gap-1.5 font-semibold disabled:opacity-40" style={{ background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.3)", borderRadius: "var(--r-md)", padding: "8px 13px", color: "var(--indigo-light)", fontSize: "var(--fs-xs)", cursor: "pointer", fontFamily: "inherit" }}><Plus size={13} /> Add category</button></form><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Name</th><th>Status</th><th style={{ width: 190 }}>Actions</th></tr></thead><tbody>{categories.map((item) => <tr key={item.id}><td>{editingCategory === item.id ? <input autoFocus value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} maxLength={60} style={{ ...inputStyle, width: "100%" }} /> : <span className="text-white font-medium" style={{ fontSize: "var(--fs-xs)" }}>{item.name}</span>}</td><td><span className={`badge ${item.isActive ? "badge-active" : "badge-cancelled"}`}>{item.isActive ? "Active" : "Inactive"}</span></td><td>{editingCategory === item.id ? <div className="flex gap-1.5"><button onClick={() => void saveCategory(item.id)} className="font-semibold" style={{ ...inputStyle, padding: "6px 9px", color: "var(--success-text)", cursor: "pointer" }}>Save</button><button onClick={() => setEditingCategory(null)} className="font-semibold" style={{ ...inputStyle, padding: "6px 9px", color: "var(--text-muted)", cursor: "pointer" }}>Cancel</button></div> : <div className="flex gap-1.5"><button onClick={() => { setEditingCategory(item.id); setEditCategoryName(item.name); }} className="font-semibold" style={{ ...inputStyle, padding: "6px 9px", color: "var(--text-light)", cursor: "pointer" }}>Rename</button><button onClick={() => void toggleCategory(item)} disabled={busy} className="font-semibold disabled:opacity-40" style={{ ...inputStyle, padding: "6px 9px", color: item.isActive ? "var(--warning-text)" : "var(--success-text)", cursor: "pointer" }}>{item.isActive ? "Deactivate" : "Activate"}</button></div>}</td></tr>)}</tbody></table></div>{categories.length === 0 && <div className="text-center py-8" style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>No categories found.</div>}</Section>}
      {tab === "admins" && <Section title="Admin accounts" description="Invite another administrator without sharing passwords. New admins receive a reset email to set their own credential." icon={<ShieldCheck size={15} />}><form onSubmit={addAdmin} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-5"><input aria-label="Admin full name" value={adminName} onChange={(e) => setAdminName(e.target.value)} maxLength={120} placeholder="Full name" style={inputStyle} /><input aria-label="Admin email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="name@example.com" style={inputStyle} /><button disabled={busy || !adminName.trim() || !adminEmail.trim()} className="flex items-center justify-center gap-1.5 font-semibold disabled:opacity-40" style={{ background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.3)", borderRadius: "var(--r-md)", padding: "8px 13px", color: "var(--indigo-light)", fontSize: "var(--fs-xs)", cursor: "pointer", fontFamily: "inherit" }}><UserRoundPlus size={13} /> Add admin</button></form><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Administrator</th><th>Created</th><th>Status</th><th style={{ width: 120 }}>Actions</th></tr></thead><tbody>{admins.map((item) => <tr key={item.id}><td><div className="flex items-center gap-2.5"><div className="flex items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: "var(--indigo-dark)", color: "var(--indigo-light)" }}><UserRound size={14} /></div><div><div className="text-white font-medium" style={{ fontSize: "var(--fs-xs)" }}>{item.name}</div><div style={{ fontSize: "var(--fs-3xs)", color: "var(--text-muted)" }}>{item.email}</div></div></div></td><td style={{ color: "var(--text-light)", fontSize: "var(--fs-xs)" }}>{formatDate(item.createdAt)}</td><td><span className={`badge ${item.deactivatedAt || item.deletedAt ? "badge-cancelled" : "badge-active"}`}>{item.deactivatedAt || item.deletedAt ? "Revoked" : "Active"}</span></td><td>{!item.deactivatedAt && !item.deletedAt && <button onClick={() => setRevoking(item)} className="font-semibold" style={{ ...inputStyle, padding: "6px 9px", color: "var(--danger-text)", cursor: "pointer" }}>Revoke</button>}</td></tr>)}</tbody></table></div></Section>}
      {tab === "broadcast" && <Section title="Broadcast announcement" description="Send an in-app notification to active, non-admin users. Suspended and deleted accounts are excluded automatically." icon={<BellRing size={15} />}><form onSubmit={sendBroadcast} className="max-w-2xl"><label className="block mb-3" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>Audience<select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} style={{ ...inputStyle, display: "block", width: "100%", marginTop: 6 }}><option value="all">All users</option><option value="clients">Homeowners only</option><option value="providers">Providers only</option></select></label><label className="block mb-3" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Short announcement title" style={{ ...inputStyle, display: "block", width: "100%", marginTop: 6 }} /><span style={{ display: "block", textAlign: "right", marginTop: 3, fontSize: "var(--fs-3xs)" }}>{title.length}/120</span></label><label className="block mb-4" style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)" }}>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={6} placeholder="What should users know?" style={{ ...inputStyle, display: "block", width: "100%", marginTop: 6, resize: "vertical" }} /><span style={{ display: "block", textAlign: "right", marginTop: 3, fontSize: "var(--fs-3xs)" }}>{body.length}/500</span></label><button disabled={busy || !title.trim() || !body.trim()} className="btn-primary flex items-center gap-1.5 disabled:opacity-40" style={{ borderRadius: "var(--r-md)", padding: "9px 15px", fontSize: "var(--fs-xs)" }}><BellRing size={13} /> {busy ? "Sending…" : "Send announcement"}</button></form></Section>}
    </>}
    <ConfirmDialog open={!!revoking} title="Revoke admin access?" message={revoking ? `${revoking.name} will be demoted to a regular user and can no longer access the console.` : ""} confirmLabel="Revoke access" onConfirm={() => void confirmRevoke()} onCancel={() => !busy && setRevoking(null)} busy={busy} />
  </div>;
}
