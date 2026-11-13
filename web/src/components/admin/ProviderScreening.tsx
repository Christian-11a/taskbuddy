"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { DISPUTE_RESOLUTION_LABEL, formatDate, type DisputeRow } from "@/lib/adapters";
import type { AdminUser, DisputeResolution } from "@/lib/domain";
import {
  countDisputes,
  countProviderBookings,
  screenProvider,
  type ScreeningReport,
  type ScreeningUser,
} from "@/lib/screening";
import { getDuplicateSignals, getPastSuspensions, getScreeningBookings, getScreeningCertificates, getScreeningRejections, getUsers, type DuplicateSignal, type PastSuspensions } from "@/lib/services";

export interface LoadedScreening {
  bookings: Awaited<ReturnType<typeof getScreeningBookings>> | null;
  certificates: Awaited<ReturnType<typeof getScreeningCertificates>> | null;
  rejections: { providerId: string }[] | null;
  /** Null when this page already has the user row, or when the user list failed. */
  users: AdminUser[] | null;
}

const RESOLUTION_BY_LABEL = new Map<string, DisputeResolution>(
  (Object.entries(DISPUTE_RESOLUTION_LABEL) as [DisputeResolution, string][]).map(([code, label]) => [label, code]),
);

/** Manila's calendar day, matching the date the verification screen compares expiry with. */
export function screeningToday(now = Date.now()): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}

export function screeningUserFromRow(user: {
  createdAt: string;
  jobsCompleted: number;
  ratingValue: number | null;
  status: string;
  suspendedUntil: string;
  suspensionReason: string;
}): ScreeningUser {
  return {
    joinedOn: user.createdAt,
    jobsCompleted: user.jobsCompleted,
    rating: user.ratingValue,
    suspended: user.status === "Suspended",
    suspendedUntil: user.suspendedUntil === "—" ? null : user.suspendedUntil,
    suspensionReason: user.suspensionReason === "—" ? null : user.suspensionReason,
  };
}

export function screeningUserFromAdmin(user: AdminUser): ScreeningUser {
  return {
    joinedOn: user.createdAt,
    jobsCompleted: user.jobsCompleted,
    rating: user.rating !== null && user.rating > 0 ? user.rating : null,
    suspended: user.status === "SUSPENDED",
    suspendedUntil: user.suspendedUntil ? formatDate(user.suspendedUntil) : null,
    suspensionReason: user.suspensionReason,
  };
}

function asList<T>(result: PromiseSettledResult<T[] | null>): T[] | null {
  if (result.status !== "fulfilled" || !Array.isArray(result.value)) return null;
  return result.value;
}

async function loadScreeningLists(loadUsers: boolean): Promise<LoadedScreening> {
  const [bookings, certificates, rejections, users] = await Promise.allSettled([
    getScreeningBookings(),
    getScreeningCertificates(),
    getScreeningRejections(),
    loadUsers ? getUsers() : Promise.resolve(null),
  ]);
  return {
    bookings: asList(bookings),
    certificates: asList(certificates),
    rejections: asList(rejections),
    users: asList(users),
  };
}

/**
 * Loads bookings, certificates and rejections the first time a provider review
 * opens, then reuses that result for the rest of the page session.
 */
export function useScreeningLists(enabled: boolean, loadUsers: boolean): { lists: LoadedScreening | null; loading: boolean } {
  const cache = useRef<Promise<LoadedScreening> | null>(null);
  const [lists, setLists] = useState<LoadedScreening | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- one shared read, started when a provider review opens */
  useEffect(() => {
    if (!enabled) return;
    if (!cache.current) cache.current = loadScreeningLists(loadUsers);
    let cancelled = false;
    cache.current.then(
      (value) => { if (!cancelled) setLists(value); },
      () => { if (!cancelled) setLists({ bookings: null, certificates: null, rejections: null, users: null }); },
    );
    return () => { cancelled = true; };
  }, [enabled, loadUsers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { lists, loading: enabled && lists === null };
}

/** Suspensions on record for one provider; null while loading or when the audit log has no target filter. */
function usePastSuspensions(providerId: string): PastSuspensions | null {
  const [state, setState] = useState<{ id: string; value: PastSuspensions | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPastSuspensions(providerId).then(
      (value) => { if (!cancelled) setState({ id: providerId, value }); },
      () => { if (!cancelled) setState({ id: providerId, value: null }); },
    );
    return () => { cancelled = true; };
  }, [providerId]);
  return state && state.id === providerId ? state.value : null;
}

/** Duplicate signals for one provider; null while loading or when the API does not have them yet. */
function useDuplicateSignals(providerId: string): DuplicateSignal[] | null {
  const [state, setState] = useState<{ id: string; value: DuplicateSignal[] | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDuplicateSignals(providerId).then(
      (value) => { if (!cancelled) setState({ id: providerId, value }); },
      () => { if (!cancelled) setState({ id: providerId, value: null }); },
    );
    return () => { cancelled = true; };
  }, [providerId]);
  return state && state.id === providerId ? state.value : null;
}

export function ProviderScreeningSection({
  providerId,
  presetUser,
  lists,
  disputes,
  loading,
}: {
  providerId: string;
  /** The Users drawer already has this row. Verifications leaves it null and uses the loaded user list. */
  presetUser: ScreeningUser | null;
  lists: LoadedScreening | null;
  disputes: DisputeRow[];
  loading: boolean;
}) {
  if (loading || !lists) {
    return <p className="text-[13px] text-muted-foreground">Loading screening…</p>;
  }
  return (
    <LoadedScreeningSection providerId={providerId} presetUser={presetUser} lists={lists} disputes={disputes} />
  );
}

function LoadedScreeningSection({
  providerId,
  presetUser,
  lists,
  disputes,
}: {
  providerId: string;
  presetUser: ScreeningUser | null;
  lists: LoadedScreening;
  disputes: DisputeRow[];
}) {
  const pastSuspensions = usePastSuspensions(providerId);
  const duplicates = useDuplicateSignals(providerId);
  const fromList = lists.users?.find((user) => user.id === providerId);
  const user = presetUser ?? (fromList ? screeningUserFromAdmin(fromList) : null);
  const jobs = lists.bookings ? countProviderBookings(lists.bookings, providerId) : null;
  const disputeCounts = countDisputes(
    disputes.map((dispute) => ({
      providerId: dispute.providerId,
      isOpen: dispute.isOpen,
      resolution: dispute.resolution ? RESOLUTION_BY_LABEL.get(dispute.resolution) ?? null : null,
    })),
    providerId,
  );
  const report = screenProvider({
    user,
    assignedJobs: jobs ? jobs.assigned : null,
    cancelledJobs: jobs ? jobs.cancelled : null,
    disputes: disputeCounts,
    certificates: lists.certificates ? lists.certificates.filter((certificate) => certificate.providerId === providerId) : null,
    rejectedVerifications: lists.rejections ? lists.rejections.filter((row) => row.providerId === providerId).length : null,
    pastSuspensions,
    duplicates,
    today: screeningToday(),
  });
  return <ScreeningResults report={report} />;
}

function ScreeningResults({ report }: { report: ScreeningReport }) {
  return (
    <div>
      <p className={report.concerns > 0 ? "text-[13px] font-medium text-warn" : "text-[13px] text-muted-foreground"}>{report.summary}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
        {report.rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">{row.label}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-foreground">
              <span>{row.value}</span>
              {row.flagged && <Badge tone="warn">Check</Badge>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
