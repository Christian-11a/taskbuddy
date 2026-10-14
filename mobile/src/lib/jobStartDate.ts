const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "today", "yesterday", "tomorrow", "4 days ago" or "in 2 days", counted in calendar days from now. */
export function relativeDay(when: Date, now: Date): string {
  const days = Math.round((startOfDay(when) - startOfDay(now)) / DAY_MS);
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days === 1) return 'tomorrow';
  if (days < 0) return `${-days} days ago`;
  return `in ${days} days`;
}

/**
 * The line the Start job dialog adds when the client's date for the job is more
 * than 24 hours away from now, in either direction, so the provider can see it
 * was booked for another day. Null inside 24 hours, and when the date is missing
 * or cannot be read. It only informs; starting is never blocked.
 */
export function startDateNote(scheduledAt: string | null | undefined, now: Date): string | null {
  if (!scheduledAt) return null;
  const at = Date.parse(scheduledAt);
  if (Number.isNaN(at) || Math.abs(at - now.getTime()) <= DAY_MS) return null;
  const when = new Date(at);
  const day = when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const relative = relativeDay(when, now);
  const verb = at < now.getTime() ? 'was booked' : 'is booked';
  return `This job ${verb} for ${day} (${relative}). Start it now?`;
}
