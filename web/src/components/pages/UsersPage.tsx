"use client";

import { Fragment, useState } from "react";
import { Search, CheckCircle, PauseCircle, ChevronDown, Download, KeyRound } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { REASON_MAX_LENGTH, validateDurationDays } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import clsx from "clsx";

/** Turns bulk counts into one honest sentence — "3 of 5" when some failed. */
function bulkMessage(verb: string, succeeded: number, failed: number): string {
  if (failed === 0) return `${verb} ${succeeded} user${succeeded === 1 ? "" : "s"}.`;
  return `${verb} ${succeeded} of ${succeeded + failed}. ${failed} failed — admins can't be suspended.`;
}

type RoleFilter = "all" | "provider" | "customer";

export function UsersPage() {
  const { users, setUserStatus, bulkSetUserStatus, sendPasswordReset, loading } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingExport, setConfirmingExport] = useState(false);
  // Backend migration 0014 made `reason` required on suspend — a prompt
  // rather than a modal since this is a one-off admin action, not a form.
  const [suspending, setSuspending] = useState<{ id: string; bulk: boolean } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDays, setSuspendDays] = useState("");
  const [resetBusyId, setResetBusyId] = useState<string | null>(null);
  const [resetSentId, setResetSentId] = useState<string | null>(null);
  const [activateBusyId, setActivateBusyId] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole =
      roleFilter === "all" ||
      (roleFilter === "provider" && u.isProvider) ||
      (roleFilter === "customer" && !u.isProvider);
    return matchSearch && matchRole;
  });

  // Admins can't be suspended (backend refuses it) — leave them out of bulk selection.
  const selectable = filtered.filter((u) => u.rolePlain !== "Admin");
  const allSelected = selectable.length > 0 && selectable.every((u) => selected.has(u.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((u) => u.id)));
  }

  /**
   * Bulk actions operate on the id set, not on what's currently rendered — so
   * a selection that survived a filter change could suspend users the admin
   * can no longer see, while the bar still claimed "5 selected". Any change to
   * what's in scope drops the selection so the count always matches the rows
   * on screen.
   */
  function clearSelectionOnScopeChange() {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }

  async function activateSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { succeeded, failed } = await bulkSetUserStatus(ids, "Active");
      setSelected(new Set());
      showToast(bulkMessage("Reinstated", succeeded, failed), failed > 0 ? "error" : "success");
    } catch {
      showToast("Could not reinstate the selected users. Please try again.", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  function openSuspendPrompt(id: string) {
    setSuspendReason("");
    setSuspendDays("");
    setSuspending({ id, bulk: false });
  }

  function openBulkSuspendPrompt() {
    if (selected.size === 0) return;
    setSuspendReason("");
    setSuspendDays("");
    setSuspending({ id: "", bulk: true });
  }

  const suspendReasonTooLong = suspendReason.length > REASON_MAX_LENGTH;
  const suspendDaysError = validateDurationDays(suspendDays);

  async function confirmSuspend() {
    if (!suspending || !suspendReason.trim() || suspendReasonTooLong || suspendDaysError) return;
    const days = suspendDays.trim() ? Number(suspendDays) : undefined;
    setBulkBusy(true);
    try {
      if (suspending.bulk) {
        const { succeeded, failed } = await bulkSetUserStatus([...selected], "Suspended", { reason: suspendReason.trim(), durationDays: days });
        setSelected(new Set());
        showToast(bulkMessage("Suspended", succeeded, failed), failed > 0 ? "error" : "success");
      } else {
        await setUserStatus(suspending.id, "Suspended", { reason: suspendReason.trim(), durationDays: days });
        showToast("User suspended.");
      }
      setSuspending(null);
    } catch {
      showToast("Could not suspend. Please try again.", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleActivateOne(id: string) {
    setActivateBusyId(id);
    try {
      await setUserStatus(id, "Active");
      showToast("User reinstated.");
    } catch {
      showToast("Could not reinstate that user. Please try again.", "error");
    } finally {
      setActivateBusyId(null);
    }
  }

  async function handleSendReset(id: string) {
    setResetBusyId(id);
    try {
      const ok = await sendPasswordReset(id);
      if (ok) {
        setResetSentId(id);
        setTimeout(() => setResetSentId((cur) => (cur === id ? null : cur)), 3000);
      } else {
        // sendPasswordReset returns false rather than throwing, so this
        // branch was previously a silent no-op — the button just stopped.
        showToast("Could not send the reset email. Please try again.", "error");
      }
    } finally {
      setResetBusyId(null);
    }
  }

  /**
   * Exports the checked rows when any are checked; otherwise falls back to
   * everything matching the current search + role filter. Selection used to
   * be ignored entirely here — checking 3 users and hitting Export silently
   * downloaded every filtered row instead of just those 3.
   */
  const exportScope = selected.size > 0 ? filtered.filter((u) => selected.has(u.id)) : filtered;

  function exportCsv() {
    const csv = toCsv(
      ["Name", "Email", "Phone", "Role", "Category", "City", "Status", "Joined", "Jobs completed", "Rating"],
      exportScope.map((u) => [u.name, u.email, u.phone, u.rolePlain, u.category, u.city, u.status, u.joined, u.jobsCompleted, u.ratingValue]),
    );
    downloadCsv(datedFilename("taskbuddy-users"), csv);
  }

  const total = users.length;
  const providers = users.filter((u) => u.isProvider).length;
  const customers = users.filter((u) => !u.isProvider).length;

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: "clamp(15px, 1.5vw, 18px)" }}>User Management</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>View, manage, and moderate all registered users</div>
        </div>
        <button
          onClick={() => setConfirmingExport(true)}
          disabled={exportScope.length === 0}
          title={selected.size > 0 ? "Download only the checked rows" : "Download the rows currently shown"}
          className="flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "7px 13px", fontSize: 11.4, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Download size={12} /> {selected.size > 0 ? `Export ${selected.size} selected` : "Export CSV"}
        </button>
      </div>

      <div className="flex gap-2.5 flex-wrap mb-4">
        {[
          { icon: "👥", label: "Total Users", val: total, accent: "#6366f1", role: "all" as RoleFilter },
          { icon: "🔧", label: "Providers", val: providers, accent: "#8b5cf6", role: "provider" as RoleFilter },
          { icon: "👤", label: "Customers", val: customers, accent: "#22c55e", role: "customer" as RoleFilter },
        ].map((s) => {
          const isActive = roleFilter === s.role;
          return (
          <button
            key={s.label}
            onClick={() => { setRoleFilter(s.role); clearSelectionOnScopeChange(); }}
            className="flex items-center gap-2 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
            style={{ padding: "9px 14px", border: `1px solid ${s.accent}33`, background: isActive ? `${s.accent}30` : `${s.accent}18`, fontSize: 11.4, fontFamily: "inherit", outline: isActive ? `1px solid ${s.accent}55` : "none" }}
          >
            <span>{s.icon}</span>
            <span className="font-semibold text-white">{s.val}</span>
            <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
          </button>
          );
        })}
      </div>

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by name, email…"
            aria-label="Search users by name or email"
            value={search}
            onChange={(e) => { setSearch(e.target.value); clearSelectionOnScopeChange(); }}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", borderRadius: 11, padding: "8px 13px 8px 32px", fontSize: 11.4, fontFamily: "inherit" }}
          />
        </div>
        <div className="inline-flex rounded-xl p-1 gap-1" style={{ background: "var(--chip-bg)" }}>
          {(["all", "provider", "customer"] as RoleFilter[]).map((f) => (
            <button key={f} onClick={() => { setRoleFilter(f); clearSelectionOnScopeChange(); }}
              className={clsx("rounded-lg font-medium cursor-pointer transition-all capitalize", roleFilter === f ? "text-indigo-300" : "text-gray-500 hover:text-gray-300")}
              style={{ padding: "5px 12px", fontSize: 11.4, background: roleFilter === f ? "rgba(99,102,241,0.25)" : "transparent", border: "none", fontFamily: "inherit" }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 flex-wrap" style={{ fontSize: 11.4 }}>
          <span style={{ color: "var(--text-muted)" }}>{selected.size} selected</span>
          <button
            onClick={activateSelected}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 9, padding: "4px 12px", fontSize: 11, color: "var(--success-text)", cursor: "pointer", fontFamily: "inherit" }}
          >
            <CheckCircle size={11} /> Activate selected
          </button>
          <button
            onClick={openBulkSuspendPrompt}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 9, padding: "4px 12px", fontSize: 11, color: "#f59e0b", cursor: "pointer", fontFamily: "inherit" }}
          >
            <PauseCircle size={11} /> Suspend selected
          </button>
        </div>
      )}

      {suspending && (
        <div className="rounded-xl mb-3 flex flex-col gap-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", padding: "12px 14px" }}>
          <div className="text-white font-semibold" style={{ fontSize: 12 }}>
            {suspending.bulk ? `Suspend ${selected.size} selected user(s)` : "Suspend this user"}
          </div>
          <input
            autoFocus
            placeholder="Reason (required)"
            aria-label="Suspension reason (required)"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            className="text-white outline-none"
            style={{ background: "var(--input-bg)", border: `1px solid ${suspendReasonTooLong ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: 9, padding: "7px 11px", fontSize: 11.4, fontFamily: "inherit" }}
          />
          <div style={{ fontSize: 10, color: suspendReasonTooLong ? "var(--danger-text)" : "var(--text-muted)", marginTop: -4 }}>
            {suspendReason.length}/{REASON_MAX_LENGTH}
          </div>
          <input
            placeholder="Duration in days (blank = indefinite)"
            aria-label="Suspension duration in days (leave blank for indefinite)"
            type="number"
            min={1}
            max={3650}
            step={1}
            value={suspendDays}
            onChange={(e) => setSuspendDays(e.target.value)}
            className="text-white outline-none"
            style={{ background: "var(--input-bg)", border: `1px solid ${suspendDaysError ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: 9, padding: "7px 11px", fontSize: 11.4, fontFamily: "inherit", maxWidth: 240 }}
          />
          {suspendDaysError && (
            <div style={{ fontSize: 10, color: "var(--danger-text)", marginTop: -4 }}>{suspendDaysError}</div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={confirmSuspend}
              disabled={bulkBusy || !suspendReason.trim() || suspendReasonTooLong || !!suspendDaysError}
              className="font-semibold transition-colors disabled:opacity-40"
              style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 9, padding: "5px 14px", fontSize: 11, color: "#f59e0b", cursor: "pointer", fontFamily: "inherit" }}
            >
              {bulkBusy ? "Suspending…" : "Confirm suspend"}
            </button>
            <button
              onClick={() => setSuspending(null)}
              className="font-semibold transition-colors"
              style={{ background: "transparent", border: "1px solid var(--border-md)", borderRadius: 9, padding: "5px 14px", fontSize: 11, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input type="checkbox" aria-label="Select all users" checked={allSelected} onChange={toggleAll} disabled={selectable.length === 0} />
                </th>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Joined</th>
                <th className="hidden lg:table-cell">Activity</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <Fragment key={u.id}>
                <tr>
                  <td>
                    {u.rolePlain !== "Admin" && (
                      <input type="checkbox" aria-label={`Select ${u.name}`} checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} />
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div
                        className={clsx(
                          "flex items-center justify-center flex-shrink-0 font-bold",
                          u.avClass === "av-indigo" && "text-indigo-300",
                          u.avClass === "av-green" && "text-green-400",
                          u.avClass === "av-violet" && "text-violet-300"
                        )}
                        style={{ width: 29, height: 29, borderRadius: 11, fontSize: 9.8, background: u.avClass === "av-indigo" ? "rgba(99,102,241,0.2)" : u.avClass === "av-violet" ? "rgba(167,139,250,0.2)" : "rgba(34,197,94,0.15)" }}
                      >
                        {u.initials}
                      </div>
                      <div>
                        <div className="text-white font-medium" style={{ fontSize: 11.4 }}>{u.name}</div>
                        <div style={{ fontSize: 9.8, color: "var(--text-muted)" }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={u.isProvider ? { background: "rgba(167,139,250,0.15)", color: "#a78bfa" } : { background: "rgba(34,197,94,0.12)", color: "var(--success-text)" }}>
                      {u.role}
                    </span>
                  </td>
                  <td><span className={clsx("badge", `badge-${u.status.toLowerCase()}`)}>{u.status}</span></td>
                  <td className="hidden md:table-cell" style={{ color: "var(--text-light)", fontSize: 11.4 }}>{u.joined}</td>
                  <td className="hidden lg:table-cell" style={{ color: "var(--text-light)", fontSize: 11.4 }}>{u.activity}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        title="Activate"
                        onClick={() => handleActivateOne(u.id)}
                        disabled={u.status === "Active" || activateBusyId === u.id}
                        className="flex items-center justify-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
                        style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: u.status === "Active" || activateBusyId === u.id ? "default" : "pointer", color: "var(--success-text)" }}
                      >
                        <CheckCircle size={12} />
                      </button>
                      <button
                        title="Suspend"
                        onClick={() => openSuspendPrompt(u.id)}
                        disabled={u.status === "Suspended"}
                        className="flex items-center justify-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-30"
                        style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: u.status === "Suspended" ? "default" : "pointer", color: "#f59e0b" }}
                      >
                        <PauseCircle size={12} />
                      </button>
                      <button
                        title="View details"
                        onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                        aria-label={`${expandedId === u.id ? "Hide" : "Show"} details for ${u.name}`}
                        aria-expanded={expandedId === u.id}
                        className="flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
                        style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", transform: expandedId === u.id ? "rotate(180deg)" : "none" }}
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === u.id && (
                  <tr>
                    <td colSpan={7} style={{ background: "var(--chip-bg)", padding: "12px 16px" }}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ fontSize: 11.4 }}>
                        {[
                          ["EMAIL", u.email],
                          ["PHONE", u.phone],
                          ["CITY", u.city],
                          ["SERVICE CATEGORY", u.category],
                          ["JOINED", u.joined],
                          ["JOBS COMPLETED", String(u.jobsCompleted)],
                          ["RATING", u.rating],
                          ["ACCOUNT STATUS", u.status],
                          ...(u.status === "Suspended"
                            ? [
                                ["SUSPENDED UNTIL", u.suspendedUntil === "—" ? "Indefinite" : u.suspendedUntil],
                                ["SUSPENSION REASON", u.suspensionReason],
                              ]
                            : []),
                        ].map(([label, value]) => (
                          <div key={label}>
                            <div style={{ fontSize: 9.8, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                            <div className="text-white">{value}</div>
                          </div>
                        ))}
                      </div>
                      {u.rolePlain !== "Admin" && (
                        <div className="mt-3">
                          <button
                            onClick={() => handleSendReset(u.id)}
                            disabled={resetBusyId === u.id}
                            className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
                            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 9, padding: "5px 12px", fontSize: 11, color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
                          >
                            <KeyRound size={11} />
                            {resetSentId === u.id ? "Reset email sent" : resetBusyId === u.id ? "Sending…" : "Send password reset"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12" style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {/* Three distinct states — saying "No users yet" while the
                        initial load is still in flight (up to a 60s Render
                        cold start) would be a confident lie. */}
                    {loading
                      ? "Loading users…"
                      : users.length === 0
                        ? "No users yet."
                        : "No users match this search or filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingExport}
        danger={false}
        title="Export to CSV?"
        message={`This downloads ${exportScope.length} row${exportScope.length === 1 ? "" : "s"} as a .csv file to your device.`}
        confirmLabel="Export"
        onConfirm={() => {
          setConfirmingExport(false);
          exportCsv();
        }}
        onCancel={() => setConfirmingExport(false)}
      />
    </div>
  );
}
