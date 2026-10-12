/**
 * savedShapes.ts: checks that a copy read back from the device has the shape its screen reads. A copy that
 * fails is ignored and removed (see readPersisted), so a screen never renders a value it cannot use. Each
 * check covers what the screen touches, and no more.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A list, such as jobs, categories or applications. */
export function isList(value: unknown): boolean {
  return Array.isArray(value);
}

/** The Home card's wallet: it shows the balance and nothing else from the wallet. */
export function isHomeWallet(value: unknown): boolean {
  return isRecord(value) && typeof value.balance === 'number';
}

/** A wallet screen's copy: the balance and what is available, and the history it lists. */
export function isWallet(value: unknown): boolean {
  return isRecord(value)
    && typeof value.balance === 'number'
    && typeof value.available === 'number'
    && Array.isArray(value.transactions);
}

/** The provider's feed: the open jobs, and the jobs assigned to the provider. */
export function isFeed(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.jobs) && Array.isArray(value.assigned);
}
