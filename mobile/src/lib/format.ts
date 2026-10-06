import { lightPalette, type Palette } from '../constants/palettes';
/** Small display helpers shared across screens. */

/** ₱ amount, e.g. 1234.5 → "₱1,234.50". */
export function peso(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Initials from a full name, e.g. "Alex Chen" → "AC". */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** "May 13, 2026" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "9:45 AM" */
export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "just now" / "10 mins ago" / "3 hours ago" / "May 13" */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return shortDate(iso);
}

/** Bucket a timestamp into Today / Yesterday / Earlier. */
export function dateBucket(iso: string | null | undefined): string {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayMs = 86400000;
  if (d.getTime() >= startOfToday.getTime()) return 'Today';
  if (d.getTime() >= startOfToday.getTime() - dayMs) return 'Yesterday';
  return 'Earlier';
}

/** Display label + colors for a backend job status. */
export function jobStatusMeta(status: string, colors: Palette['V6Colors'] = lightPalette.V6Colors): {
  label: string;
  color: string;
  bg: string;
} {
  switch (status) {
    case 'open':
      return { label: 'Open', color: colors.warningText, bg: colors.warningSurface };
    case 'recommending':
      return { label: 'Finding Provider', color: colors.warningText, bg: colors.warningSurface };
    case 'assigned':
    case 'confirmed':
      return { label: 'Confirmed', color: colors.infoText, bg: colors.infoSurface };
    // Every status has its own color (Confirmed and Completed used to match,
    // and Cancelled looked like the red Urgent pill).
    case 'in_progress':
      return { label: 'In Progress', color: colors.purpleText, bg: colors.purpleSurface };
    case 'completed':
      return { label: 'Completed', color: colors.successText, bg: colors.successSurface };
    case 'cancelled':
      return { label: 'Cancelled', color: colors.ink500, bg: colors.ink100 };
    case 'expired':
      return { label: 'Expired', color: colors.ink400, bg: colors.ink50 };
    default:
      return { label: status, color: colors.ink400, bg: colors.ink50 };
  }
}

/**
 * Hiring confirms the booking for both participants. Legacy assigned records
 * use the same label until migration 0039 promotes them to confirmed.
 */
export function providerJobStatusMeta(status: string, colors: Palette['V6Colors'] = lightPalette.V6Colors): {
  label: string;
  color: string;
  bg: string;
} {
  return jobStatusMeta(status, colors);
}

/** Display label + colors for a job's urgency. */
export function urgencyMeta(urgency: string, colors: Palette['V6Colors'] = lightPalette.V6Colors): {
  label: string;
  color: string;
  bg: string;
} {
  switch (urgency) {
    case 'urgent':
      return { label: 'Urgent', color: colors.dangerText, bg: colors.dangerSurface };
    case 'flexible':
      return { label: 'Flexible', color: colors.link, bg: colors.infoSurface };
    default:
      return { label: 'Normal', color: colors.ink500, bg: colors.ink50 };
  }
}

/** "2.4 km away" / "820 m away". Empty when the distance is unknown. */
export function distanceLabel(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

/** Which filter bucket a job status falls into (My Jobs tabs). */
export function jobFilterBucket(status: string): 'Active' | 'Pending' | 'Completed' | 'Other' {
  if (status === 'assigned' || status === 'confirmed' || status === 'in_progress')
    return 'Active';
  if (status === 'open' || status === 'recommending') return 'Pending';
  if (status === 'completed') return 'Completed';
  return 'Other';
}

/** "March 2026" */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "1 job" / "2 jobs" — display only; the count itself is unchanged. */
export function plural(count: number | null | undefined, singular: string, pluralForm = `${singular}s`): string {
  const n = count ?? 0;
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
