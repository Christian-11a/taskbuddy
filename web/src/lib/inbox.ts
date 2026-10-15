// The admin notification inbox: a per-browser record of new work that arrived
// while the console was open. Everything here is a pure function over plain
// data, except the thin load/save wrappers at the bottom. The hook decides
// when to call these; this file decides what the result is.

import { newWork, QUEUE_IDS, type QueueCounts, type QueueId } from "./attention";

export interface InboxEntry {
  id: string;
  queue: QueueId;
  /** Built from `queue` and `count`, e.g. "3 new provider verifications". */
  title: string;
  /** How many new items this entry stands for (repeat arrivals are merged in). */
  count: number;
  /** When the first of those items arrived, in ms since the epoch. */
  createdAt: number;
  read: boolean;
}

export interface Arrival {
  queue: QueueId;
  count: number;
}

export const INBOX_KEY = "tb-admin-inbox";
/** Oldest entries are dropped beyond this, so the stored list stays small. */
export const MAX_ENTRIES = 100;
/** Arrivals for the same queue inside this window become one entry. */
export const MERGE_WINDOW_MS = 5 * 60_000;

const NOUNS: Record<QueueId, { one: string; many: string }> = {
  verifications: { one: "provider verification", many: "provider verifications" },
  disputes: { one: "dispute", many: "disputes" },
  withdrawals: { one: "withdrawal request", many: "withdrawal requests" },
  "skill-requests": { one: "service request", many: "service requests" },
};

export function arrivalTitle(queue: QueueId, count: number): string {
  const noun = NOUNS[queue];
  return `${count} new ${count === 1 ? noun.one : noun.many}`;
}

/** A fresh id for a new entry. Unique enough for one browser's inbox. */
export function makeEntryId(now: number): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newestFirst(entries: InboxEntry[]): InboxEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ENTRIES);
}

/**
 * Records arrivals. An arrival joins the newest entry for its queue when that
 * entry started less than MERGE_WINDOW_MS ago; the merged entry counts the new
 * items and is unread again. Otherwise a new unread entry is created.
 * Returns the same array when there is nothing to add.
 */
export function addArrivals(
  entries: InboxEntry[],
  arrivals: Arrival[],
  now: number,
  newId: () => string,
): InboxEntry[] {
  const usable = arrivals.filter((a) => a.count > 0);
  if (usable.length === 0) return entries;

  let next = entries;
  for (const { queue, count } of usable) {
    const open = next.find((e) => e.queue === queue && now - e.createdAt >= 0 && now - e.createdAt < MERGE_WINDOW_MS);
    if (open) {
      const total = open.count + count;
      next = next.map((e) => (e === open ? { ...e, count: total, title: arrivalTitle(queue, total), read: false } : e));
    } else {
      next = [{ id: newId(), queue, title: arrivalTitle(queue, count), count, createdAt: now, read: false }, ...next];
    }
  }
  return newestFirst(next);
}

export function unreadCount(entries: InboxEntry[]): number {
  return entries.reduce((n, e) => (e.read ? n : n + 1), 0);
}

export function markRead(entries: InboxEntry[], id: string): InboxEntry[] {
  const target = entries.find((e) => e.id === id);
  if (!target || target.read) return entries;
  return entries.map((e) => (e.id === id ? { ...e, read: true } : e));
}

export function markAllRead(entries: InboxEntry[]): InboxEntry[] {
  if (!entries.some((e) => !e.read)) return entries;
  return entries.map((e) => (e.read ? e : { ...e, read: true }));
}

export function deleteEntry(entries: InboxEntry[], id: string): InboxEntry[] {
  return deleteMany(entries, [id]);
}

export function deleteMany(entries: InboxEntry[], ids: readonly string[]): InboxEntry[] {
  const drop = new Set(ids);
  const next = entries.filter((e) => !drop.has(e.id));
  return next.length === entries.length ? entries : next;
}

/** "Delete all" is only offered once nothing is unread. */
export function canDeleteAll(entries: InboxEntry[]): boolean {
  return entries.every((e) => e.read);
}

/** Clears the inbox, but only when every entry is read. Otherwise returns it unchanged. */
export function deleteAll(entries: InboxEntry[]): InboxEntry[] {
  return canDeleteAll(entries) ? [] : entries;
}

/**
 * Drops entries whose queue has been handled (live count exactly 0). A count
 * that is unknown (null) keeps its entries: unknown is not the same as empty.
 */
export function autoResolve(entries: InboxEntry[], counts: QueueCounts): InboxEntry[] {
  const next = entries.filter((e) => counts[e.queue] !== 0);
  return next.length === entries.length ? entries : next;
}

/**
 * One reading of the queue counts, applied to the inbox: rises become arrivals
 * (never from the first reading, never from an unknown count), then handled
 * queues are cleared.
 */
export function applyReading(
  entries: InboxEntry[],
  prev: QueueCounts | null,
  next: QueueCounts,
  now: number,
  newId: () => string,
): InboxEntry[] {
  const arrivals = newWork(prev, next).map((queue) => ({
    queue,
    count: (next[queue] ?? 0) - (prev?.[queue] ?? 0),
  }));
  return autoResolve(addArrivals(entries, arrivals, now, newId), next);
}

// ─── Storage ──────────────────────────────────────────────────────────────────

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // some privacy modes throw on access
  }
}

function isStoredEntry(v: unknown): v is Omit<InboxEntry, "title"> {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" && e.id.length > 0 &&
    typeof e.queue === "string" && (QUEUE_IDS as string[]).includes(e.queue) &&
    typeof e.count === "number" && Number.isInteger(e.count) && e.count > 0 &&
    typeof e.createdAt === "number" && Number.isFinite(e.createdAt) &&
    typeof e.read === "boolean"
  );
}

/** Reads a stored inbox. Anything malformed is dropped rather than trusted. */
export function parseInbox(raw: string | null): InboxEntry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: InboxEntry[] = [];
  for (const item of data) {
    if (!isStoredEntry(item) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({
      id: item.id,
      queue: item.queue,
      title: arrivalTitle(item.queue, item.count),
      count: item.count,
      createdAt: item.createdAt,
      read: item.read,
    });
  }
  return newestFirst(out);
}

export function serializeInbox(entries: InboxEntry[]): string {
  return JSON.stringify(entries.slice(0, MAX_ENTRIES));
}

/** Loads this browser's inbox. Blocked or unreadable storage gives an empty inbox. */
export function loadInbox(storage: StorageLike | null = browserStorage()): InboxEntry[] {
  if (!storage) return [];
  try {
    return parseInbox(storage.getItem(INBOX_KEY));
  } catch {
    return [];
  }
}

/** Saves this browser's inbox. A failed write is ignored: the inbox still works for this visit. */
export function saveInbox(entries: InboxEntry[], storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(INBOX_KEY, serializeInbox(entries));
  } catch {
    // quota exceeded or storage blocked
  }
}
