"use client";

import { useState } from "react";
import { Search, CheckCircle, PauseCircle, Download, KeyRound, Users, Wrench, Home } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { REASON_MAX_LENGTH, validateDurationDays } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReviewDrawer, DrawerField, DrawerSection } from "@/components/ui/ReviewDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import clsx from "clsx";

const PAGE_SIZE = 7;

/** Turns bulk counts into one honest sentence — "3 of 5" when some failed. */
function bulkMessage(verb: string, succeeded: number, failed: number): string {
  if (failed === 0) return `${verb} ${succeeded} user${succeeded === 1 ? "" : "s"}.`;
  return `${verb} ${succeeded} of ${succeeded + failed}. ${failed} failed — admins can't be suspended.`;
}

type RoleFilter = "all" | "provider" | "customer";
type StatusFilter = "all" | "active" | "suspended" | "deleted";

export function UsersPage() {
  const { users, setUserStatus, bulkSetUserStatus, sendPasswordReset, loading } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
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
    const matchStatus = statusFilter === "all" || u.status.toLowerCase() === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // Admins can't be suspended (backend refuses it) — leave them out of bulk selection.
  const selectable = filtered.filter((u) => u.rolePlain !== "Admin" && u.status !== "Deleted");
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
    setPage(1);
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
      setReviewingId(null);
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
  const deleted = users.filter((u) => u.status === "Deleted").length;
  const reviewing = users.find((u) => u.id === reviewingId) ?? null;
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-white font-bold" style={{ fontSize: 22, letterSpacing: "-0.025em" }}>Users</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>Search, review, and moderate homeowner and provider accounts.</div>
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
          { icon: <Users size={13} />, label: "Total Users", val: total, accent: "#22c3d6", role: "all" as RoleFilter },
          { icon: <Wrench size={13} />, label: "Providers", val: providers, accent: "#38bdf8", role: "provider" as RoleFilter },
          { icon: <Home size={13} />, label: "Homeowners", val: customers, accent: "#22c55e", role: "customer" as RoleFilter },
        ].map((s) => {
          const isActive = roleFilter === s.role;
          return (
          <button
            key={s.label}
            onClick={() => { setRoleFilter(s.role); clearSelectionOnScopeChange(); }}
            className="flex items-center gap-2 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
            style={{ padding: "9px 14px", border: `1px solid ${s.accent}33`, background: isActive ? `${s.accent}30` : `${s.accent}18`, fontSize: 11.4, fontFamily: "inherit", outline: isActive ? `1px solid ${s.accent}55` : "none" }}
          >
            <span style={{ color: s.accent, display: "flex" }}>{s.icon}</span>
            <span className="font-semibold text-white">{s.val}</span>
            <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
          </button>
          );
        })}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <div className="flex items-center gap-2.5 flex-wrap" style={{ padding: "12px 14px", borderBottom: "1px solid var(--card-border)" }}>
        <div className="relative flex-1" style={{ minWidth: 200, maxWidth: 360 }}>
          <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 opacity-40" color="white" />
          <input
            className="w-full text-white outline-none"
            placeholder="Search by name, email…"
            aria-label="Search users by name or email"
            value={search}
            onChange={(e) => { setSearch(e.target.value); clearSelectionOnScopeChange(); }}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-md)", height: 38, borderRadius: 9, padding: "0 13px 0 36px", fontSize: 12, fontFamily: "inherit" }}
          />
        </div>
        <div className="inline-flex" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: 9, gap: 2 }}>
          {([["all", "All"], ["provider", "Providers"], ["customer", "Homeowners"]] as [RoleFilter, string][]).map(([f, label]) => (
            <button key={f} onClick={() => { setRoleFilter(f); clearSelectionOnScopeChange(); }}
              className={clsx("rounded-lg font-medium cursor-pointer transition-all", roleFilter !== f && "text-gray-500 hover:text-gray-300")}
              style={{ padding: "7px 11px", fontSize: 11, background: roleFilter === f ? "var(--indigo-dark)" : "transparent", color: roleFilter === f ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit" }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex" style={{ background: "var(--chip-bg)", padding: 3, borderRadius: 9, gap: 2 }} aria-label="Filter users by status">
          {([['all', 'All statuses'], ['active', 'Active'], ['suspended', 'Suspended'], ['deleted', `Deleted${deleted ? ` (${deleted})` : ''}`]] as [StatusFilter, string][]).map(([f, label]) => (
            <button key={f} onClick={() => { setStatusFilter(f); clearSelectionOnScopeChange(); }} className={clsx("rounded-lg font-medium cursor-pointer transition-all", statusFilter !== f && "text-gray-500 hover:text-gray-300")} style={{ padding: "7px 10px", fontSize: 11, background: statusFilter === f ? "var(--indigo-dark)" : "transparent", color: statusFilter === f ? "var(--indigo-light)" : undefined, border: "none", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{filtered.length.toLocaleString()} {filtered.length === 1 ? "user" : "users"}</span>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 11.4, padding: "10px 14px", borderBottom: "1px solid var(--card-border)" }}>
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

      {/* Bulk suspend prompt only — single-user suspend now lives in the drawer. */}
      {suspending?.bulk && (
        <div className="flex flex-col gap-2" style={{ background: "rgba(245,158,11,0.08)", borderBottom: "1px solid var(--card-border)", padding: "12px 14px" }}>
          <div className="text-white font-semibold" style={{ fontSize: 12 }}>Suspend {selected.size} selected user(s)</div>
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

        <div
          className="overflow-x-auto pb-1"
          role="region"
          aria-label="Users table"
          tabIndex={0}
          style={{ scrollbarColor: "var(--border-md) transparent" }}
        >
          <table className="data-table" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input
                    type="checkbox"
                    className={clsx("row-checkbox", selected.size > 0 && "always-visible")}
                    aria-label="Select all users"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectable.length === 0}
                  />
                </th>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th className="hidden md:table-cell">Joined</th>
                <th className="hidden lg:table-cell">Activity</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((u) => (
                <tr key={u.id} onClick={() => setReviewingId(u.id)} style={{ cursor: "pointer" }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    {u.rolePlain !== "Admin" && (
                      <input
                        type="checkbox"
                        className={clsx("row-checkbox", selected.size > 0 && "always-visible")}
                        aria-label={`Select ${u.name}`}
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                      />
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex items-center justify-center flex-shrink-0 font-bold"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          fontSize: 10,
                          background: u.isProvider ? "rgba(34,195,214,0.10)" : "rgba(34,197,94,0.10)",
                          color: u.isProvider ? "#7ce3eb" : "#61d98a",
                        }}
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
                    <span className="badge" style={u.isProvider ? { background: "rgba(34,195,214,0.08)", borderColor: "rgba(34,195,214,0.14)", color: "#79dce6" } : { background: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.14)", color: "#5ed889" }}>
                      {u.role}
                    </span>
                  </td>
                  <td><span className={clsx("badge", `badge-${u.status.toLowerCase()}`)}>{u.status}</span></td>
                  <td className="hidden md:table-cell" style={{ color: "var(--text-light)", fontSize: 11.4 }}>{u.joined}</td>
                  <td className="hidden lg:table-cell" style={{ color: "var(--text-light)", fontSize: 11.4 }}>{u.activity}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      title="More actions"
                      onClick={() => setReviewingId(u.id)}
                      aria-label={`Show details for ${u.name}`}
                      className="flex items-center justify-center rounded-lg transition-all hover:bg-white/10"
                      style={{ width: 30, height: 30, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 18, letterSpacing: 2 }}
                    >
                      ···
                    </button>
                  </td>
                </tr>
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
        <div className="md:hidden px-4 py-2" style={{ color: "var(--text-muted)", fontSize: 10 }}>
          Swipe horizontally to view all user details.
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} itemLabel="users" />
      </div>

      <ReviewDrawer
        open={reviewing !== null}
        onClose={() => setReviewingId(null)}
        title={reviewing?.name ?? ""}
        subtitle={reviewing ? `${reviewing.role} account` : undefined}
        footer={
          reviewing?.rolePlain !== "Admin" ? (
            <>
              <button
                onClick={() => setReviewingId(null)}
                className="flex-1 font-semibold transition-colors"
                style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
              >
                Close
              </button>
              {reviewing?.status === "Active" ? (
                <button
                  onClick={() => reviewing && openSuspendPrompt(reviewing.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 font-semibold transition-colors"
                  style={{ background: "#8b3b3b", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <PauseCircle size={13} /> Suspend Account
                </button>
              ) : reviewing?.status === "Suspended" ? (
                <button
                  onClick={() => reviewing && handleActivateOne(reviewing.id)}
                  disabled={activateBusyId === reviewing?.id}
                  className="flex-1 flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "#1f6b45", border: "none", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
                >
                  <CheckCircle size={13} /> {activateBusyId === reviewing?.id ? "Reinstating…" : "Reinstate Account"}
                </button>
              ) : null}
            </>
          ) : (
            <button
              onClick={() => setReviewingId(null)}
              className="flex-1 font-semibold transition-colors"
              style={{ background: "var(--chip-bg)", border: "1px solid var(--border-md)", borderRadius: 9, padding: "9px 14px", fontSize: 12, color: "var(--text-light)", cursor: "pointer", fontFamily: "inherit" }}
            >
              Close
            </button>
          )
        }
      >
        {reviewing && (
          <>
            <DrawerSection>
              <div className="grid grid-cols-2 gap-3">
                <DrawerField label="Email" value={reviewing.email} />
                <DrawerField label="Phone" value={reviewing.phone} />
                <DrawerField label="City" value={reviewing.city} />
                <DrawerField label="Status" value={<span className={clsx("badge", `badge-${reviewing.status.toLowerCase()}`)}>{reviewing.status}</span>} />
                <DrawerField label="Joined" value={reviewing.joined} />
                <DrawerField label="Activity" value={reviewing.activity} />
                {reviewing.isProvider && (
                  <>
                    <DrawerField label="Category" value={reviewing.category} />
                    <DrawerField label="Rating" value={reviewing.rating} />
                  </>
                )}
                {reviewing.status === "Suspended" && (
                  <>
                    <DrawerField label="Suspended until" value={reviewing.suspendedUntil === "—" ? "Indefinite" : reviewing.suspendedUntil} />
                    <DrawerField label="Suspension reason" value={reviewing.suspensionReason} />
                  </>
                )}
              </div>
            </DrawerSection>

            {suspending && !suspending.bulk && suspending.id === reviewing.id && (
              <DrawerSection>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Suspend this user</div>
                <input
                  autoFocus
                  placeholder="Reason (required)"
                  aria-label="Suspension reason (required)"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full text-white outline-none mb-2"
                  style={{ background: "var(--input-bg)", border: `1px solid ${suspendReasonTooLong ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: 9, padding: "8px 11px", fontSize: 12, fontFamily: "inherit" }}
                />
                <div style={{ fontSize: 10, color: suspendReasonTooLong ? "var(--danger-text)" : "var(--text-muted)", marginBottom: 8 }}>
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
                  className="w-full text-white outline-none"
                  style={{ background: "var(--input-bg)", border: `1px solid ${suspendDaysError ? "rgba(239,68,68,0.5)" : "var(--border-md)"}`, borderRadius: 9, padding: "8px 11px", fontSize: 12, fontFamily: "inherit" }}
                />
                {suspendDaysError && (
                  <div style={{ fontSize: 10, color: "var(--danger-text)", marginTop: 4 }}>{suspendDaysError}</div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={confirmSuspend}
                    disabled={bulkBusy || !suspendReason.trim() || suspendReasonTooLong || !!suspendDaysError}
                    className="font-semibold transition-colors disabled:opacity-40"
                    style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 9, padding: "7px 16px", fontSize: 11.4, color: "#f59e0b", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {bulkBusy ? "Suspending…" : "Confirm suspend"}
                  </button>
                  <button
                    onClick={() => setSuspending(null)}
                    className="font-semibold transition-colors"
                    style={{ background: "transparent", border: "1px solid var(--border-md)", borderRadius: 9, padding: "7px 16px", fontSize: 11.4, color: "var(--text-muted)", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Cancel
                  </button>
                </div>
              </DrawerSection>
            )}

            {reviewing.rolePlain !== "Admin" && (
              <button
                onClick={() => handleSendReset(reviewing.id)}
                disabled={resetBusyId === reviewing.id}
                className="flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-40"
                style={{ background: "var(--indigo-dark)", border: "1px solid rgba(34,195,214,0.25)", borderRadius: 9, padding: "7px 14px", fontSize: 11.4, color: "var(--indigo-light)", cursor: "pointer", fontFamily: "inherit" }}
              >
                <KeyRound size={12} />
                {resetSentId === reviewing.id ? "Reset email sent" : resetBusyId === reviewing.id ? "Sending…" : "Send password reset"}
              </button>
            )}
          </>
        )}
      </ReviewDrawer>

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
