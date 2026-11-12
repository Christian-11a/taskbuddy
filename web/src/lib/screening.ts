// Provider screening rules for the admin console. Thresholds are named so a
// thesis panel can see exactly what "a concern" means. The console only flags
// what these lists already contain; a missing figure is not a concern.

import { formatDate } from "@/lib/adapters";
import type { DisputeResolution } from "@/lib/domain";

/** Cancellation rate (cancelled ÷ assigned) at or above this is a concern. */
export const CANCELLATION_RATE_MIN = 0.3;
/** The rate is ignored until the provider has been assigned at least this many jobs. */
export const CANCELLATION_MIN_ASSIGNED = 3;
/** Lost disputes are those resolved by refunding the client. Two or more is a concern. */
export const DISPUTES_LOST_MIN = 2;
/** An average at this value is acceptable. Below it is a concern. */
export const RATING_BELOW = 3.5;
/**
 * The user row stores an average (`cached_avg_rating`) and has no rating count,
 * so completed jobs stand in for "at least three ratings".
 */
export const RATING_MIN_COMPLETED_JOBS = 3;
/** An approved certificate that expires within this many days, or already has, is a concern. */
export const CERTIFICATE_EXPIRY_WITHIN_DAYS = 30;
/** Two or more rejected identity checks or certificates is a concern. */
export const REJECTED_VERIFICATIONS_MIN = 2;
/** One suspension on record (past or current) is a concern. */
export const PAST_SUSPENSIONS_MIN = 1;

export const SCREENING_NOT_AVAILABLE = "Not available";

export interface ScreeningBooking {
  providerId: string | null;
  status: string;
}

export interface ScreeningCertificate {
  providerId: string;
  /** "expired" is an approved certificate whose expiry date has passed. */
  status: "approved" | "expired";
  expiresOn: string | null;
}

/** The user-row fields screening reads. Dates that are shown as text are already formatted. */
export interface ScreeningUser {
  joinedOn: string | null;
  jobsCompleted: number;
  /** Null when the provider has not been rated. */
  rating: number | null;
  suspended: boolean;
  /** Display date, or null for an indefinite suspension. */
  suspendedUntil: string | null;
  suspensionReason: string | null;
}

export interface ScreeningInput {
  /** Null when this provider is not in the loaded user list. */
  user: ScreeningUser | null;
  /** Null when the bookings list failed to load. Zero means the list loaded and nothing matched. */
  assignedJobs: number | null;
  cancelledJobs: number | null;
  disputes: { total: number; open: number; lost: number } | null;
  /** Null when the credentials list failed. An empty list means no approved certificate. */
  certificates: readonly ScreeningCertificate[] | null;
  rejectedVerifications: number | null;
  /**
   * Suspensions in the audit log (`user.suspend` rows for this provider),
   * including a current one. Null when the audit log could not be read.
   */
  pastSuspensions?: { count: number; latestAt: string | null; latestReason: string | null } | null;
  /** YYYY-MM-DD, the date expiry is compared with. */
  today: string;
}

export interface ScreeningRow {
  label: string;
  value: string;
  flagged: boolean;
}

export interface ScreeningReport {
  summary: string;
  concerns: number;
  rows: ScreeningRow[];
}

export function flagsCancellation(cancelled: number | null, assigned: number | null): boolean {
  if (cancelled === null || assigned === null) return false;
  if (assigned < CANCELLATION_MIN_ASSIGNED) return false;
  return cancelled / assigned >= CANCELLATION_RATE_MIN;
}

/** One concern for any open dispute, or for two or more losses. A single loss is not enough. */
export function flagsDisputes(open: number | null, lost: number | null): boolean {
  if (open === null || lost === null) return false;
  return open >= 1 || lost >= DISPUTES_LOST_MIN;
}

export function flagsRating(rating: number | null, jobsCompleted: number | null): boolean {
  if (rating === null || jobsCompleted === null) return false;
  if (jobsCompleted < RATING_MIN_COMPLETED_JOBS) return false;
  return rating < RATING_BELOW;
}

export function flagsCertificate(certificates: readonly ScreeningCertificate[], today: string): boolean {
  return certificates.some((certificate) => {
    if (certificate.status === "expired") return true;
    if (!certificate.expiresOn) return false;
    const days = daysUntilExpiry(certificate.expiresOn, today);
    return days !== null && days <= CERTIFICATE_EXPIRY_WITHIN_DAYS;
  });
}

export function flagsRejections(count: number | null): boolean {
  return count !== null && count >= REJECTED_VERIFICATIONS_MIN;
}

/** Current suspension only. Past suspensions are not on the user row. */
export function flagsSuspension(suspended: boolean | null): boolean {
  return suspended === true;
}

export function flagsPastSuspensions(count: number | null): boolean {
  return count !== null && count >= PAST_SUSPENSIONS_MIN;
}

/**
 * Assigned jobs are bookings that still name this provider (open and matching
 * jobs have none). Cancelled jobs are the subset whose status is `cancelled`,
 * so the rate is cancelled ÷ assigned.
 */
export function countProviderBookings(bookings: readonly ScreeningBooking[], providerId: string): { assigned: number; cancelled: number } {
  let assigned = 0;
  let cancelled = 0;
  for (const booking of bookings) {
    if (booking.providerId !== providerId) continue;
    assigned += 1;
    if (booking.status === "cancelled") cancelled += 1;
  }
  return { assigned, cancelled };
}

/**
 * Lost means `refunded_to_client` only. `reviewed` and a cancelled dispute
 * (no resolution) are not losses, and neither is a release to the provider.
 */
export function countDisputes(
  disputes: readonly { providerId?: string | null; isOpen: boolean; resolution: DisputeResolution | null }[],
  providerId: string,
): { total: number; open: number; lost: number } {
  let total = 0;
  let open = 0;
  let lost = 0;
  for (const dispute of disputes) {
    if (dispute.providerId !== providerId) continue;
    total += 1;
    if (dispute.isOpen) open += 1;
    if (dispute.resolution === "REFUNDED_TO_CLIENT") lost += 1;
  }
  return { total, open, lost };
}

/** Keeps the provider id the bookings page mapping drops. */
export function toScreeningBooking(row: { provider?: { id: string } | null; status: string }): ScreeningBooking {
  return { providerId: row.provider?.id ?? null, status: row.status };
}

/** A rejected identity check or certificate. Other statuses are not a past rejection. */
export function toScreeningRejection(row: { provider_id: string; status: string }): { providerId: string } | null {
  if (row.status !== "rejected") return null;
  return { providerId: row.provider_id };
}

/** Keeps `expires_on`, which the verification history mapping drops. Rejected rows are not certificates on file. */
export function toScreeningCertificate(row: {
  provider_id: string;
  status: string;
  expires_on: string | null;
}): ScreeningCertificate | null {
  if (row.status !== "approved" && row.status !== "expired") return null;
  return { providerId: row.provider_id, status: row.status, expiresOn: row.expires_on };
}

export function screenProvider(input: ScreeningInput): ScreeningReport {
  const { user } = input;
  const cancellation = flagsCancellation(input.cancelledJobs, input.assignedJobs);
  const disputeFlag = input.disputes ? flagsDisputes(input.disputes.open, input.disputes.lost) : false;
  const rating = user ? flagsRating(user.rating, user.jobsCompleted) : false;
  const certificate = input.certificates ? flagsCertificate(input.certificates, input.today) : false;
  const rejections = flagsRejections(input.rejectedVerifications);
  const suspension = flagsSuspension(user ? user.suspended : null);
  const past = input.pastSuspensions ?? null;
  const pastFlag = flagsPastSuspensions(past ? past.count : null);
  const concerns = [cancellation, disputeFlag, rating, certificate, rejections, suspension, pastFlag].filter(Boolean).length;
  const expiry = certificateValue(input.certificates, input.today);

  return {
    summary: screeningSummary(concerns),
    concerns,
    rows: [
      { label: "Joined", value: user?.joinedOn ? formatDate(user.joinedOn) : SCREENING_NOT_AVAILABLE, flagged: false },
      { label: "Jobs completed", value: user ? String(user.jobsCompleted) : SCREENING_NOT_AVAILABLE, flagged: false },
      { label: "Jobs cancelled", value: countText(input.cancelledJobs), flagged: false },
      { label: "Cancellation rate", value: rateText(input.cancelledJobs, input.assignedJobs), flagged: cancellation },
      { label: "Disputes", value: input.disputes ? String(input.disputes.total) : SCREENING_NOT_AVAILABLE, flagged: false },
      { label: "Open disputes", value: input.disputes ? String(input.disputes.open) : SCREENING_NOT_AVAILABLE, flagged: disputeFlag && (input.disputes?.open ?? 0) >= 1 },
      { label: "Disputes lost", value: input.disputes ? String(input.disputes.lost) : SCREENING_NOT_AVAILABLE, flagged: disputeFlag && (input.disputes?.lost ?? 0) >= DISPUTES_LOST_MIN },
      { label: "Average rating", value: ratingText(user), flagged: rating },
      { label: "Certificate expiry", value: expiry.value, flagged: certificate },
      { label: "Past rejected verifications", value: countText(input.rejectedVerifications), flagged: rejections },
      { label: "Current suspension", value: suspensionText(user), flagged: suspension },
      // GET /admin/audit?action=user.suspend&target_id=… (needs the API with the target filter).
      { label: "Past suspensions", value: pastSuspensionsText(past), flagged: pastFlag },
    ],
  };
}

export function screeningSummary(concerns: number): string {
  if (concerns === 0) return "No concerns found";
  if (concerns === 1) return "1 thing to check";
  return `${concerns} things to check`;
}

function countText(count: number | null): string {
  return count === null ? SCREENING_NOT_AVAILABLE : String(count);
}

function rateText(cancelled: number | null, assigned: number | null): string {
  if (cancelled === null || assigned === null || assigned === 0) return SCREENING_NOT_AVAILABLE;
  const pct = Math.round((cancelled / assigned) * 1000) / 10;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  return `${text}% (${cancelled}/${assigned})`;
}

function ratingText(user: ScreeningUser | null): string {
  if (!user) return SCREENING_NOT_AVAILABLE;
  if (user.rating === null || !Number.isFinite(user.rating) || user.rating <= 0) return "Not yet rated";
  return String(Math.round(user.rating * 100) / 100);
}

function suspensionText(user: ScreeningUser | null): string {
  if (!user) return SCREENING_NOT_AVAILABLE;
  if (!user.suspended) return "Not suspended";
  const until = user.suspendedUntil ? `Until ${user.suspendedUntil}` : "Indefinite";
  return user.suspensionReason ? `${until} — ${user.suspensionReason}` : until;
}

function pastSuspensionsText(past: ScreeningInput["pastSuspensions"] | null): string {
  if (!past) return SCREENING_NOT_AVAILABLE;
  if (past.count === 0) return "None";
  const times = past.count === 1 ? "1 time" : `${past.count} times`;
  if (!past.latestAt) return times;
  // The audit timestamp is UTC; show Manila's day.
  const at = Date.parse(past.latestAt);
  const latest = Number.isNaN(at) ? past.latestAt : formatDate(new Date(at + 8 * 3600_000).toISOString());
  return past.latestReason ? `${times} (latest ${latest} — ${past.latestReason})` : `${times} (latest ${latest})`;
}

function certificateValue(certificates: readonly ScreeningCertificate[] | null, today: string): { value: string } {
  if (certificates === null) return { value: SCREENING_NOT_AVAILABLE };
  if (certificates.length === 0) return { value: "None" };
  const dated = certificates
    .filter((certificate): certificate is ScreeningCertificate & { expiresOn: string } => !!certificate.expiresOn)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  if (dated.length === 0) {
    return { value: flagsCertificate(certificates, today) ? "Expired" : "No expiry date" };
  }
  const days = daysUntilExpiry(dated[0].expiresOn, today);
  if (days === null) return { value: SCREENING_NOT_AVAILABLE };
  const date = formatDate(dated[0].expiresOn);
  if (days < 0) {
    const ago = Math.abs(days);
    return { value: `${date} (${ago} ${ago === 1 ? "day" : "days"} ago)` };
  }
  if (days === 0) return { value: `${date} (today)` };
  return { value: `${date} (${days} ${days === 1 ? "day" : "days"} left)` };
}

function daysUntilExpiry(expiresOn: string, today: string): number | null {
  const expiry = Date.parse(`${expiresOn.slice(0, 10)}T00:00:00Z`);
  const day = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(expiry) || Number.isNaN(day)) return null;
  return Math.round((expiry - day) / 86_400_000);
}
