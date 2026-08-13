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
export function jobStatusMeta(status: string): {
  label: string;
  color: string;
  bg: string;
} {
  switch (status) {
    case 'open':
      return { label: 'Open', color: '#F59E0B', bg: '#FFF7ED' };
    case 'recommending':
      return { label: 'Finding Provider', color: '#F59E0B', bg: '#FFF7ED' };
    case 'assigned':
      // Hired, but the provider has not answered yet — from the homeowner's
      // side this is a wait, not a settled booking.
      return { label: 'Awaiting Provider', color: '#F59E0B', bg: '#FFF7ED' };
    case 'confirmed':
      return { label: 'Confirmed', color: '#3B82F6', bg: '#EFF6FF' };
    case 'in_progress':
      return { label: 'In Progress', color: '#22C55E', bg: '#F0FDF4' };
    case 'completed':
      return { label: 'Completed', color: '#3B82F6', bg: '#EFF6FF' };
    case 'cancelled':
      return { label: 'Cancelled', color: '#EF4444', bg: '#FFF5F5' };
    case 'expired':
      return { label: 'Expired', color: '#94A3B8', bg: '#F1F5F9' };
    default:
      return { label: status, color: '#94A3B8', bg: '#F1F5F9' };
  }
}

/** Display label + colors for a job's urgency. */
export function urgencyMeta(urgency: string): {
  label: string;
  color: string;
  bg: string;
} {
  switch (urgency) {
    case 'urgent':
      return { label: 'Urgent', color: '#B91C1C', bg: '#FEF2F2' };
    case 'flexible':
      return { label: 'Flexible', color: '#0E7490', bg: '#ECFEFF' };
    default:
      return { label: 'Normal', color: '#64748B', bg: '#F1F5F9' };
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
