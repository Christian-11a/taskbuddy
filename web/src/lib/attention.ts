// What needs an admin right now, per work queue. A count that could not be
// loaded is `null`: the UI must say "unknown", never "nothing waiting".

export type QueueId = "verifications" | "disputes" | "withdrawals" | "skill-requests";
export type QueueCounts = Record<QueueId, number | null>;

/** The service-requests endpoint returns at most this many rows. */
export const QUEUE_LIST_CAP = 100;

export const QUEUE_IDS: QueueId[] = ["verifications", "disputes", "withdrawals", "skill-requests"];

export function totalAttention(counts: QueueCounts): number {
  return QUEUE_IDS.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
}

/** Text for a number badge; undefined means "show no badge". */
export function displayCount(n: number | null, cap: number = QUEUE_LIST_CAP): string | undefined {
  if (n === null || n <= 0) return undefined;
  return n >= cap ? `${cap}+` : String(n);
}

/** Queues whose count rose since the previous reading. No previous reading
 *  (first load) and queues unknown on either side never count as new. */
export function newWork(prev: QueueCounts | null, next: QueueCounts): QueueId[] {
  if (!prev) return [];
  return QUEUE_IDS.filter((id) => {
    const before = prev[id];
    const after = next[id];
    return before !== null && after !== null && after > before;
  });
}

export function documentTitle(base: string, total: number): string {
  return total > 0 ? `(${total}) ${base}` : base;
}
