/**
 * Card payments for hires the server has not decided yet, remembered on this device.
 *
 * A hire paid by card is decided by Stripe's webhook, so a proposal waits once its
 * checkout has started (HOJobApplicationsScreen). That wait used to live only in the
 * screen: leaving the Proposals screen or restarting the app forgot it, and Hire paid
 * again. Now the wait is kept in memory for the session and in AsyncStorage across
 * restarts. A wait older than 24 hours is forgotten, so a payment that never settles
 * cannot hold its proposal forever.
 *
 * If storage cannot be read or written, the session's own copy still works and the
 * screen behaves as it did before this module existed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENDING_HIRE_PAYMENTS_KEY = 'hire.pendingPayments';

/** A wait older than this is forgotten, on read or on load. */
export const PENDING_HIRE_PAYMENT_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingHirePayment {
  /** The browser came back saying the payment went through, so the wait says so. */
  returnedPaid: boolean;
  /** When the checkout started, in ms since the epoch. Marking again keeps this. */
  startedAt: number;
}

/** This session's waits, by proposal id. Every change is also written to storage. */
const waits = new Map<string, PendingHirePayment>();
/** Proposal ids marked or cleared this session. A copy read from storage never overrides these. */
const changedThisSession = new Set<string>();
/** Storage reads and writes run one at a time, so a read always sees the writes made before it. */
let storageQueue: Promise<unknown> = Promise.resolve();

function runInStorageOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = storageQueue.then(task);
  storageQueue = run.catch(() => undefined);
  return run;
}

/** True once a wait has been open for longer than the limit. */
export function isPendingHirePaymentExpired(wait: PendingHirePayment, now: number): boolean {
  return now - wait.startedAt > PENDING_HIRE_PAYMENT_TTL_MS;
}

function isPendingHirePayment(value: unknown): value is PendingHirePayment {
  if (typeof value !== 'object' || value === null) return false;
  const { returnedPaid, startedAt } = value as Record<string, unknown>;
  return typeof returnedPaid === 'boolean' && typeof startedAt === 'number' && Number.isFinite(startedAt);
}

/**
 * The waits in stored text that are still in date. Text that is not JSON, or an entry of
 * the wrong shape, is skipped rather than failing the whole read. Never throws.
 */
export function parsePendingHirePayments(raw: string | null, now: number): Map<string, PendingHirePayment> {
  const result = new Map<string, PendingHirePayment>();
  if (raw === null) return result;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return result;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return result;
  for (const [id, value] of Object.entries(data)) {
    if (isPendingHirePayment(value) && !isPendingHirePaymentExpired(value, now)) {
      result.set(id, { returnedPaid: value.returnedPaid, startedAt: value.startedAt });
    }
  }
  return result;
}

function serialize(): string {
  return JSON.stringify(Object.fromEntries(waits));
}

function dropExpired(now: number): void {
  for (const [id, wait] of waits) {
    if (isPendingHirePaymentExpired(wait, now)) waits.delete(id);
  }
}

function copyOfWaits(): Map<string, PendingHirePayment> {
  return new Map(Array.from(waits, ([id, wait]) => [id, { ...wait }]));
}

/** Writes this session's waits to storage. A write that fails leaves them in memory for the session. */
function writeWaits(): Promise<void> {
  return runInStorageOrder(async () => {
    try {
      await AsyncStorage.setItem(PENDING_HIRE_PAYMENTS_KEY, serialize());
    } catch {
      // Storage refused the write. This session still knows the wait; a restart will not.
    }
  });
}

/**
 * Keeps the wait for a card payment that has just started. Marking again only updates
 * whether the browser reported a payment; when the checkout started is kept. Resolves once
 * the device has been written, or the write has failed.
 */
export function markPendingHirePayment(applicationId: string, returnedPaid: boolean): Promise<void> {
  const now = Date.now();
  const earlier = waits.get(applicationId);
  const startedAt = earlier && !isPendingHirePaymentExpired(earlier, now) ? earlier.startedAt : now;
  waits.set(applicationId, { returnedPaid, startedAt });
  changedThisSession.add(applicationId);
  return writeWaits();
}

/** Forgets the wait for a proposal, here and on the device. Nothing to forget is not an error. */
export function clearPendingHirePayment(applicationId: string): Promise<void> {
  waits.delete(applicationId);
  changedThisSession.add(applicationId);
  return writeWaits();
}

/** The wait for a proposal, if one is open. An expired wait is forgotten and reads as none. */
export function getPendingHirePayment(applicationId: string): PendingHirePayment | null {
  const wait = waits.get(applicationId);
  if (!wait) return null;
  if (isPendingHirePaymentExpired(wait, Date.now())) {
    waits.delete(applicationId);
    changedThisSession.add(applicationId);
    void writeWaits();
    return null;
  }
  return { ...wait };
}

/**
 * Brings the waits stored on the device into this session, which is how a wait survives an
 * app restart, and drops any that have expired. A stored wait never overrides one this
 * session has changed. If storage cannot be read or written, the session's own waits still
 * stand. Resolves with a copy of the waits now known.
 */
export function loadPendingHirePayments(): Promise<Map<string, PendingHirePayment>> {
  return runInStorageOrder(async () => {
    const now = Date.now();
    try {
      const raw = await AsyncStorage.getItem(PENDING_HIRE_PAYMENTS_KEY);
      for (const [id, wait] of parsePendingHirePayments(raw, now)) {
        if (!waits.has(id) && !changedThisSession.has(id)) waits.set(id, wait);
      }
      dropExpired(now);
      // Rewrite the device copy when it differs, so expired or unreadable entries are removed.
      if (serialize() !== (raw ?? '{}')) await AsyncStorage.setItem(PENDING_HIRE_PAYMENTS_KEY, serialize());
    } catch {
      // Storage could not be read or written. What this session knows still stands.
      dropExpired(now);
    }
    return copyOfWaits();
  });
}

/**
 * Forgets this session's waits, as an app start would, while the device copy is kept.
 * For tests that simulate a restart.
 */
export async function resetPendingHirePaymentsForTests(): Promise<void> {
  await storageQueue;
  waits.clear();
  changedThisSession.clear();
}
