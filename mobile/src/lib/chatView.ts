import { peso } from './format';
import { heldAmount, type HoldInput } from './heldMoney';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Statuses where someone was hired for the job. */
const HIRED_STATUSES: readonly string[] = ['assigned', 'confirmed', 'in_progress', 'completed'];

export type ChatRole = 'homeowner' | 'provider';

function readTime(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole local calendar days, so the day count ignores the time of day and daylight saving. */
function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** "TODAY", "YESTERDAY", "OCT 6", or "DEC 31, 2025" for an earlier year. Empty when the time cannot be read. */
export function dayLabel(iso: string, now: Date): string {
  const date = readTime(iso);
  if (!date) return '';
  const days = localDayNumber(now) - localDayNumber(date);
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

/**
 * Day separators for a thread in time order: the label for the first message of each local day,
 * keyed by message id. Every other message gets no label.
 */
export function dayHeadLabels(
  messages: ReadonlyArray<{ id: string; created_at: string }>,
  now: Date,
): Record<string, string> {
  const heads: Record<string, string> = {};
  let previousDay: number | null = null;
  for (const message of messages) {
    const date = readTime(message.created_at);
    if (!date) continue;
    const day = localDayNumber(date);
    if (day !== previousDay) heads[message.id] = dayLabel(message.created_at, now);
    previousDay = day;
  }
  return heads;
}

/**
 * The plain line pinned at the top of the chat: who was hired and, while the money is held, how much.
 * Null when nobody has been hired or the other person's name is not known.
 */
export function chatSystemLine(input: {
  role: ChatRole;
  counterpartName: string | null | undefined;
  job: HoldInput | null | undefined;
  now: Date;
}): string | null {
  const name = input.counterpartName?.trim();
  if (!name || !input.job || !HIRED_STATUSES.includes(input.job.status)) return null;
  const held = heldAmount(input.job, input.now);
  const lead = input.role === 'homeowner' ? `You hired ${name}` : `${name} hired you`;
  return held === null ? lead : `${lead} · ${peso(held)} held safely`;
}

/** "Plumbing: Fix toilet · Confirmed", either part alone, or null when neither is known. */
export function chatSubtitle(jobTitle: string | null | undefined, statusLabel: string | null | undefined): string | null {
  const parts = [jobTitle?.trim(), statusLabel?.trim()].filter((part): part is string => !!part);
  return parts.length ? parts.join(' · ') : null;
}
