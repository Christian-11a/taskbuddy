"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Download, Home, KeyRound, MailCheck, MoreHorizontal, PauseCircle, RefreshCw, Star, Users, Wrench } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { exportMasks } from "@/lib/export/anonymize";
import { datedFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { REASON_MAX_LENGTH, validateDurationDays } from "@/lib/validation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReviewDrawer, DrawerField, DrawerSection } from "@/components/ui/ReviewDrawer";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/admin/Panel";
import { Avatar, FilterTabs, SearchField } from "@/components/admin/queue";
import {
  BulkBar,
  DataTable,
  SelectFilter,
  SummaryStrip,
  TableCard,
  TableEmpty,
  sortRows,
  usePaged,
  useSort,
  type Column,
} from "@/components/admin/table";
import { cn } from "@/lib/utils";
import type { BulkCounts } from "@/lib/services";
import type { UserRow } from "@/lib/adapters";

const PAGE_SIZE = 12;

/**
 * Turns bulk counts into one honest sentence — "3 of 5" when some failed,
 * followed by the reasons the API actually gave. This used to blame every
 * failure on "admins can't be suspended", but admins are already excluded from
 * selection, so the failures that remain are rate limits, a user changed by
 * someone else, or a network error — and the admin needs to know which.
 */
export function bulkMessage(verb: string, { succeeded, failed, errors }: BulkCounts): string {
  if (failed === 0) return `${verb} ${succeeded} user${succeeded === 1 ? "" : "s"}.`;
  const reasons = new Map<string, number>();
  for (const e of errors) reasons.set(e.message, (reasons.get(e.message) ?? 0) + 1);
  const why = [...reasons]
    .slice(0, 2)
    .map(([message, n]) => (n > 1 ? `${message} (×${n})` : message))
    .join("; ");
  const others = reasons.size - 2;
  const more = others > 0 ? `; +${others} other reason${others === 1 ? "" : "s"}` : "";
  return `${verb} ${succeeded} of ${succeeded + failed}. ${failed} failed: ${why}${more}.`;
}

type RoleFilter = "all" | "provider" | "customer";
type StatusFilter = "all" | "active" | "suspended" | "deleted";
type JoinedFilter = "all" | "7d" | "30d";
type VerificationFilter = "all" | "Verified" | "Pending review" | "Rejected" | "Not submitted";

const JOINED_DAYS: Record<Exclude<JoinedFilter, "all">, number> = { "7d": 7, "30d": 30 };

const STATUS_TONE: Record<string, "ok" | "danger" | "warn" | "neutral"> = {
  Active: "ok",
  Suspended: "danger",
  Pending: "warn",
  Deleted: "neutral",
};
const VERIFICATION_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  Verified: "ok",
  "Pending review": "warn",
  Rejected: "danger",
  "Not submitted": "neutral",
};

export function UsersPage() {
  const { users, setUserStatus, bulkSetUserStatus, sendPasswordReset, refreshUsers, loading, settings } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [joinedFilter, setJoinedFilter] = useState<JoinedFilter>("all");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  // Read once per mount: "new in the last 7 days" doesn't need to tick.
  const [now] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [usersStale, setUsersStale] = useState(false);
  const [refreshingUsers, setRefreshingUsers] = useState(false);
  const [bulkFailures, setBulkFailures] = useState<{
    id: string;
    name: string;
    email: string;
    status: number;
    message: string;
    outcomeRefreshed: boolean;
  }[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [confirmingExport, setConfirmingExport] = useState(false);
  // Backend migration 0014 made `reason` required on suspend.
  const [suspending, setSuspending] = useState<{ id: string; bulk: boolean } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendDays, setSuspendDays] = useState("");
  const [resetBusyId, setResetBusyId] = useState<string | null>(null);
  const [resetSentId, setResetSentId] = useState<string | null>(null);
  const [activateBusyId, setActivateBusyId] = useState<string | null>(null);
  const { sort, toggle: toggleSort } = useSort({ id: "joined", dir: "desc" });

  function noteRefreshFailure(refreshFailed?: boolean, hasUnconfirmedOutcome = false) {
    if (refreshFailed || hasUnconfirmedOutcome) setUsersStale(true);
  }

  async function retryUsersRefresh() {
    setRefreshingUsers(true);
    try {
      await refreshUsers();
      setUsersStale(false);
      if (bulkFailures.some((failure) => failure.status === 0 && !failure.outcomeRefreshed)) {
        const unconfirmedIds = new Set(
          bulkFailures.filter((failure) => failure.status === 0 && !failure.outcomeRefreshed).map((failure) => failure.id),
        );
        setSelected((current) => new Set([...current].filter((id) => !unconfirmedIds.has(id))));
        setBulkFailures((current) => current.map((failure) =>
          failure.status === 0 ? { ...failure, outcomeRefreshed: true } : failure,
        ));
      }
    } catch {
      // Keep the warning and moderation lock in place until the list is current.
      showToast("Could not refresh the users list. Please try again.", "error");
    } finally {
      setRefreshingUsers(false);
    }
  }

  const filtered = useMemo(
    () =>
      users.filter((u) => {
        const q = search.toLowerCase();
        const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        const matchRole =
          roleFilter === "all" || (roleFilter === "provider" && u.isProvider) || (roleFilter === "customer" && !u.isProvider);
        const matchStatus = statusFilter === "all" || u.status.toLowerCase() === statusFilter;
        const matchJoined =
          joinedFilter === "all" || now - new Date(u.createdAt).getTime() <= JOINED_DAYS[joinedFilter] * 86_400_000;
        // Verification only applies to providers, so picking one narrows to them.
        const matchVerification = verificationFilter === "all" || u.verification === verificationFilter;
        return matchSearch && matchRole && matchStatus && matchJoined && matchVerification;
      }),
    [users, search, roleFilter, statusFilter, joinedFilter, verificationFilter, now],
  );

  const columns: Column<UserRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "User",
        sortValue: (u) => u.name,
        cell: (u) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar initials={u.initials} tone={u.isProvider ? "accent" : "ok"} />
            <div className="min-w-0">
              <div className="truncate font-medium">{u.name}</div>
              <div className="truncate text-[12px] text-muted-foreground">{u.email}</div>
            </div>
          </div>
        ),
      },
      {
        id: "role",
        header: "Role",
        sortValue: (u) => u.role,
        cell: (u) => (
          <span className="inline-flex items-center gap-1.5 text-[12.5px]">
            {u.isProvider ? <Wrench className="size-3.5 text-primary" /> : <Home className="size-3.5 text-ok" />}
            {u.role}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortValue: (u) => u.status,
        cell: (u) => (
          <Badge tone={STATUS_TONE[u.status] ?? "neutral"} dot>
            {u.status}
          </Badge>
        ),
      },
      {
        id: "verification",
        header: "Verification",
        sortValue: (u) => (u.isProvider ? u.verification : null),
        cell: (u) =>
          u.isProvider ? (
            <Badge tone={VERIFICATION_TONE[u.verification] ?? "neutral"}>{u.verification}</Badge>
          ) : (
            <span className="text-subtle">—</span>
          ),
      },
      {
        id: "joined",
        header: "Joined",
        hideBelow: "md",
        sortValue: (u) => new Date(u.createdAt).getTime() || null,
        cell: (u) => <span className="tabular text-muted-foreground">{u.joined}</span>,
      },
      {
        id: "activity",
        header: "Activity",
        hideBelow: "lg",
        sortValue: (u) => u.jobsCompleted,
        cell: (u) => (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            {u.activity}
            {u.ratingValue ? (
              <span className="inline-flex items-center gap-0.5 text-[12px] text-warn">
                <Star className="size-3 fill-current" />
                {u.ratingValue.toFixed(1)}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "actions",
        header: <span className="sr-only">Actions</span>,
        width: 48,
        align: "right",
        cell: (u) => (
          <button
            title="More actions"
            onClick={(e) => {
              e.stopPropagation();
              setReviewingId(u.id);
            }}
            aria-label={`Show details for ${u.name}`}
            className="grid size-7 place-items-center rounded-md text-subtle opacity-60 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        ),
      },
    ],
    [],
  );

  const sorted = useMemo(() => sortRows(filtered, columns, sort), [filtered, columns, sort]);
  const paginated = usePaged(sorted, page, PAGE_SIZE);

  // Admins can't be suspended (backend refuses it) — leave them out of bulk selection.
  const selectable = filtered.filter((u) => u.rolePlain !== "Admin" && u.status !== "Deleted");
  const selectableIds = new Set(selectable.map((u) => u.id));
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
   * can no longer see. Any change to what's in scope drops the selection so
   * the count always matches the rows on screen.
   */
  function clearSelectionOnScopeChange() {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    setPage(1);
  }

  async function activateSelected() {
    const ids = [...selected];
    if (ids.length === 0 || usersStale) return;
    setBulkBusy(true);
    try {
      const counts = await bulkSetUserStatus(ids, "Active");
      noteRefreshFailure(counts.refreshFailed, counts.errors.some((error) => error.status === 0));
      if (counts.failed > 0) {
        const failedIds = new Set(counts.errors.map((error) => error.id));
        setSelected(failedIds);
        setBulkFailures(counts.errors.map((error) => ({
          id: error.id,
          name: users.find((user) => user.id === error.id)?.name ?? "Unknown user",
          email: users.find((user) => user.id === error.id)?.email ?? "Email unavailable",
          status: error.status,
          message: error.message,
          outcomeRefreshed: false,
        })));
      } else {
        setSelected(new Set());
        setBulkFailures([]);
      }
      showToast(bulkMessage("Reinstated", counts), counts.failed > 0 ? "error" : "success");
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
  const suspendInvalid = !suspendReason.trim() || suspendReasonTooLong || !!suspendDaysError;

  async function confirmSuspend() {
    if (!suspending || suspendInvalid || usersStale) return;
    const days = suspendDays.trim() ? Number(suspendDays) : undefined;
    setBulkBusy(true);
    try {
      if (suspending.bulk) {
        const counts = await bulkSetUserStatus([...selected], "Suspended", { reason: suspendReason.trim(), durationDays: days });
        noteRefreshFailure(counts.refreshFailed, counts.errors.some((error) => error.status === 0));
        if (counts.failed > 0) {
          const failedIds = new Set(counts.errors.map((error) => error.id));
          setSelected(failedIds);
          setBulkFailures(counts.errors.map((error) => ({
            id: error.id,
            name: users.find((user) => user.id === error.id)?.name ?? "Unknown user",
            email: users.find((user) => user.id === error.id)?.email ?? "Email unavailable",
            status: error.status,
            message: error.message,
            outcomeRefreshed: false,
          })));
        } else {
          setSelected(new Set());
          setBulkFailures([]);
        }
        showToast(bulkMessage("Suspended", counts), counts.failed > 0 ? "error" : "success");
      } else {
        const result = await setUserStatus(suspending.id, "Suspended", { reason: suspendReason.trim(), durationDays: days });
        noteRefreshFailure(result?.refreshFailed);
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
    if (usersStale) return;
    setActivateBusyId(id);
    try {
      const result = await setUserStatus(id, "Active");
      noteRefreshFailure(result?.refreshFailed);
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
        showToast("Could not send the reset email. Please try again.", "error");
      }
    } finally {
      setResetBusyId(null);
    }
  }

  /** Exports the checked rows when any are checked; otherwise everything matching the filters. */
  const exportScope = selected.size > 0 ? filtered.filter((u) => selected.has(u.id)) : filtered;

  function exportCsv() {
    const mask = exportMasks(settings.anonymizeExports);
    const csv = toCsv(
      ["Name", "Email", "Phone", "Role", "Category", "City", "Status", "Verification", "Joined", "Jobs completed", "Rating"],
      exportScope.map((u) => [mask.name(u.name), mask.email(u.email), mask.phone(u.phone), u.rolePlain, u.category, u.city, u.status, u.verification, u.joined, u.jobsCompleted, u.ratingValue]),
    );
    downloadCsv(datedFilename("taskbuddy-users"), csv);
  }

  const total = users.length;
  const providers = users.filter((u) => u.isProvider).length;
  const customers = users.filter((u) => !u.isProvider).length;
  const suspended = users.filter((u) => u.status === "Suspended").length;
  const deleted = users.filter((u) => u.status === "Deleted").length;
  const reviewing = users.find((u) => u.id === reviewingId) ?? null;

  const suspendFields = (
    <div className="space-y-2">
      <div>
        <Input
          autoFocus
          placeholder="Reason (required)"
          aria-label="Suspension reason (required)"
          aria-invalid={suspendReasonTooLong || undefined}
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
        />
        <div className={cn("mt-1 text-right text-[11px] tabular", suspendReasonTooLong ? "text-danger" : "text-subtle")}>
          {suspendReason.length}/{REASON_MAX_LENGTH}
        </div>
      </div>
      <div>
        <Input
          placeholder="Duration in days (blank = indefinite)"
          aria-label="Suspension duration in days (leave blank for indefinite)"
          aria-invalid={!!suspendDaysError || undefined}
          type="number"
          min={1}
          max={3650}
          step={1}
          value={suspendDays}
          onChange={(e) => setSuspendDays(e.target.value)}
        />
        {suspendDaysError && <div className="mt-1 text-[11.5px] text-danger">{suspendDaysError}</div>}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Users"
        description="Search, review, and moderate client and provider accounts."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmingExport(true)}
            disabled={exportScope.length === 0}
            title={selected.size > 0 ? "Download only the checked rows" : "Download the rows currently shown"}
          >
            <Download /> {selected.size > 0 ? `Export ${selected.size} selected` : "Export CSV"}
          </Button>
        }
      />

      <SummaryStrip
        items={[
          { icon: Users, label: "total", value: total.toLocaleString() },
          { icon: Wrench, label: "providers", value: providers.toLocaleString() },
          { icon: Home, label: "clients", value: customers.toLocaleString() },
          ...(suspended ? [{ icon: PauseCircle, label: "suspended", value: suspended.toLocaleString() }] : []),
        ]}
      />

      {usersStale && (
        <div role="status" aria-live="polite" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-warn/30 bg-warn-soft/50 px-4 py-3 text-[13px]">
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <div className="font-medium">
                {bulkFailures.some((failure) => failure.status === 0 && !failure.outcomeRefreshed)
                  ? "Some account outcomes are unconfirmed."
                  : "The user list could not be refreshed after that action."}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {bulkFailures.some((failure) => failure.status === 0 && !failure.outcomeRefreshed)
                  ? "Refresh the list before retrying to avoid repeating an action that may have succeeded."
                  : "These rows may be out of date. Refresh the list before moderating accounts."}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={retryUsersRefresh} disabled={refreshingUsers}>
            <RefreshCw className={refreshingUsers ? "animate-spin" : undefined} />
            {refreshingUsers ? "Refreshing…" : "Refresh users"}
          </Button>
        </div>
      )}

      {bulkFailures.length > 0 && (
        <section role="region" aria-labelledby="bulk-user-failures-title" className="mb-4 rounded-[10px] border border-danger/25 bg-danger-soft/40 px-4 py-3">
          <h2 id="bulk-user-failures-title" className="text-[13px] font-semibold text-danger">Some user actions failed</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Failed accounts stay selected after the action. Review your selection before retrying; confirmed successes were deselected.</p>
          <ul className="mt-2 space-y-2">
            {bulkFailures.map((failure) => (
              <li key={failure.id} className="text-[12.5px]">
                <span className="font-medium">{failure.name}</span>
                <span className="text-muted-foreground"> ({failure.email} · ID {failure.id}) — {failure.message}</span>
                {failure.status === 0 && (
                  <div className="mt-0.5 text-[12px] text-warn">
                    Outcome unconfirmed. {failure.outcomeRefreshed
                      ? "Check the refreshed account status before selecting it again."
                      : "Refresh users before retrying; the action may already have succeeded."}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <TableCard
        toolbar={
          <>
            <SearchField
              className="w-full sm:w-64"
              value={search}
              onChange={(v) => {
                setSearch(v);
                clearSelectionOnScopeChange();
              }}
              placeholder="Search by name, email…"
              label="Search users by name or email"
            />
            <FilterTabs
              id="users-role"
              label="Filter users by role"
              value={roleFilter}
              onChange={(f) => {
                setRoleFilter(f);
                clearSelectionOnScopeChange();
              }}
              options={[
                { value: "all", label: "All" },
                { value: "provider", label: "Providers" },
                { value: "customer", label: "Clients" },
              ]}
            />
            <SelectFilter
              label="Filter users by status"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v as StatusFilter);
                clearSelectionOnScopeChange();
              }}
            >
              <option value="all">Status: any</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deleted">Deleted{deleted ? ` (${deleted})` : ""}</option>
            </SelectFilter>
            <SelectFilter
              label="Filter users by join date"
              value={joinedFilter}
              onChange={(v) => {
                setJoinedFilter(v as JoinedFilter);
                clearSelectionOnScopeChange();
              }}
            >
              <option value="all">Joined: any time</option>
              <option value="7d">New: last 7 days</option>
              <option value="30d">New: last 30 days</option>
            </SelectFilter>
            <SelectFilter
              label="Filter providers by verification status"
              value={verificationFilter}
              onChange={(v) => {
                setVerificationFilter(v as VerificationFilter);
                clearSelectionOnScopeChange();
              }}
            >
              <option value="all">Verification: any</option>
              <option value="Verified">Verified</option>
              <option value="Pending review">Pending review</option>
              <option value="Rejected">Rejected</option>
              <option value="Not submitted">Not submitted</option>
            </SelectFilter>
            <span className="ml-auto tabular text-[12px] text-muted-foreground">
              {filtered.length.toLocaleString()} {filtered.length === 1 ? "user" : "users"}
            </span>
          </>
        }
      >
        <DataTable
          label="Users table"
          columns={columns}
          rows={paginated}
          getRowId={(u) => u.id}
          onRowClick={(u) => setReviewingId(u.id)}
          activeRowId={reviewingId}
          sort={sort}
          onSort={(id) => {
            toggleSort(id);
            setPage(1);
          }}
          minWidth={720}
          selection={{
            selected,
            onToggle: toggleOne,
            onToggleAll: toggleAll,
            allSelected,
            isSelectable: (id) => !usersStale && !bulkBusy && selectableIds.has(id),
            rowLabel: (id) => `Select ${users.find((u) => u.id === id)?.name ?? "user"}`,
            allLabel: `Select all ${selectable.length} matching users`,
            disabledAll: selectable.length === 0 || usersStale || bulkBusy,
          }}
          empty={
            <TableEmpty>
              {/* Three distinct states — saying "No users yet" while the initial
                  load is still in flight (up to a 60s Render cold start) would
                  be a confident lie. */}
              {loading ? "Loading users…" : users.length === 0 ? "No users yet." : "No users match this search or filter."}
            </TableEmpty>
          }
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={(next) => { setSelected(new Set()); setPage(next); }} itemLabel="users" />
      </TableCard>

      <BulkBar count={selected.size} noun="user" onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="outline" onClick={activateSelected} disabled={bulkBusy || usersStale}>
          <CheckCircle className="text-ok" /> Reinstate
        </Button>
        <Button size="sm" variant="outline" onClick={openBulkSuspendPrompt} disabled={bulkBusy || usersStale} className="text-warn">
          <PauseCircle /> Suspend
        </Button>
      </BulkBar>

      <ReviewDrawer
        open={reviewing !== null}
        onClose={() => {
          setReviewingId(null);
          if (suspending && !suspending.bulk) setSuspending(null);
        }}
        title={reviewing?.name ?? ""}
        subtitle={reviewing ? `${reviewing.role} account · Joined ${reviewing.joined}` : undefined}
        footer={
          reviewing && reviewing.rolePlain !== "Admin" && reviewing.status !== "Deleted" ? (
            <>
              <Button variant="outline" onClick={() => setReviewingId(null)} className="flex-1">
                Close
              </Button>
              {reviewing.status === "Active" ? (
                <Button variant="destructive" onClick={() => openSuspendPrompt(reviewing.id)} disabled={usersStale} className="flex-1">
                  <PauseCircle /> Suspend account
                </Button>
              ) : reviewing.status === "Suspended" ? (
                <Button onClick={() => handleActivateOne(reviewing.id)} disabled={activateBusyId === reviewing.id || usersStale} className="flex-1">
                  <CheckCircle /> {activateBusyId === reviewing.id ? "Reinstating…" : "Reinstate account"}
                </Button>
              ) : null}
            </>
          ) : (
            <Button variant="outline" onClick={() => setReviewingId(null)} className="flex-1">
              Close
            </Button>
          )
        }
      >
        {reviewing && (
          <>
            <div className="mb-5 flex items-center gap-3.5">
              <Avatar initials={reviewing.initials} size="lg" tone={reviewing.isProvider ? "accent" : "ok"} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[reviewing.status] ?? "neutral"} dot>{reviewing.status}</Badge>
                  {reviewing.isProvider && (
                    <Badge tone={VERIFICATION_TONE[reviewing.verification] ?? "neutral"}>{reviewing.verification}</Badge>
                  )}
                </div>
                <div className="mt-1 truncate text-[12.5px] text-muted-foreground">{reviewing.email}</div>
              </div>
            </div>

            {reviewing.status === "Suspended" && (
              <div className="mb-5 rounded-[10px] border border-danger/25 bg-danger-soft px-3.5 py-3 text-[12.5px]">
                <div className="font-medium text-danger">
                  Suspended {reviewing.suspendedUntil === "—" ? "indefinitely" : `until ${reviewing.suspendedUntil}`}
                </div>
                <div className="mt-0.5 text-muted-foreground">{reviewing.suspensionReason}</div>
              </div>
            )}

            <DrawerSection title="Contact">
              <div className="grid grid-cols-2 gap-4">
                <DrawerField label="Email" value={reviewing.email} />
                <DrawerField label="Phone" value={reviewing.phone} />
                <DrawerField label="City" value={reviewing.city} />
                <DrawerField label="Joined" value={reviewing.joined} />
              </div>
            </DrawerSection>

            <DrawerSection title="Activity">
              <div className="grid grid-cols-2 gap-4">
                <DrawerField label="Activity" value={reviewing.activity} />
                {reviewing.isProvider && (
                  <>
                    <DrawerField label="Category" value={reviewing.category} />
                    <DrawerField label="Jobs completed" value={reviewing.jobsCompleted} />
                    <DrawerField label="Rating" value={reviewing.rating} />
                  </>
                )}
              </div>
            </DrawerSection>

            {suspending && !suspending.bulk && suspending.id === reviewing.id && (
              <DrawerSection title="Suspend this user">
                <div className="rounded-[10px] border border-danger/25 bg-danger-soft/50 p-3.5">
                  {suspendFields}
                  <div className="mt-3 flex items-center gap-2">
                    <Button variant="destructive" size="sm" onClick={confirmSuspend} disabled={bulkBusy || suspendInvalid || usersStale}>
                      {bulkBusy ? "Suspending…" : "Confirm suspend"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSuspending(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DrawerSection>
            )}

            {reviewing.rolePlain !== "Admin" && (
              <DrawerSection title="Account access">
                <Button variant="outline" size="sm" onClick={() => handleSendReset(reviewing.id)} disabled={resetBusyId === reviewing.id}>
                  {resetSentId === reviewing.id ? <MailCheck className="text-ok" /> : <KeyRound />}
                  {resetSentId === reviewing.id ? "Reset email sent" : resetBusyId === reviewing.id ? "Sending…" : "Send password reset"}
                </Button>
              </DrawerSection>
            )}
          </>
        )}
      </ReviewDrawer>

      <ConfirmDialog
        open={!!suspending?.bulk}
        title={`Suspend ${selected.size} selected user${selected.size === 1 ? "" : "s"}?`}
        message="They won't be able to sign in or take jobs until reinstated. The reason is saved on each account."
        confirmLabel="Confirm suspend"
        busy={bulkBusy}
        confirmDisabled={suspendInvalid || usersStale}
        onConfirm={confirmSuspend}
        onCancel={() => setSuspending(null)}
      >
        {suspendFields}
      </ConfirmDialog>

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
