/**
 * persistentCache.ts: the last successful result of each read, kept on this device per account, so
 * the next launch can show it at once while a fresh copy loads (see useAsyncData).
 *
 * Each saved value belongs to one profile id. Nothing is read or written while no account is set, and
 * a copy saved for one account is never read while another is signed in. Signing out removes that
 * account's copies (clearPersisted).
 *
 * Every call is best-effort: a storage failure or unreadable data counts as "nothing saved", and
 * nothing here throws into a screen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Bump when the envelope changes: a copy with another version is ignored. */
const VERSION = 1;
const ROOT = 'taskbuddy.cache.v1.';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** For data that changes rarely, such as the service categories: a saved copy stays usable for a week. */
export const SEVEN_DAYS_MS = 7 * DEFAULT_MAX_AGE_MS;
/** A single saved value may not take more than this many bytes of JSON. */
const MAX_VALUE_BYTES = 200 * 1024;
/** All of one account's saved values together. The oldest are dropped to stay under it. */
const MAX_ACCOUNT_BYTES = 1.5 * 1024 * 1024;

/**
 * Keys that start with one of these are never saved, whatever the caller asks. Matched
 * case-insensitively.
 */
export const NEVER_PERSIST: readonly string[] = [
  'payment',
  'hire',
  'checkout',
  'withdraw',
  'chat',
  'token',
  'auth',
  'session',
  'verification-upload',
];

/** Keys that contain one of these anywhere are never saved either, e.g. 'ho-withdrawals'. */
const NEVER_PERSIST_ANYWHERE: readonly string[] = ['withdraw', 'payment', 'checkout'];

export interface SavedValue<T> {
  value: T;
  /** When the value was saved, in ms since the epoch. */
  savedAt: number;
}

/** One line of an account's index: the key, the bytes its copy takes, and when it was saved. */
interface IndexEntry {
  key: string;
  bytes: number;
  savedAt: number;
}

let activeAccount: string | null = null;

/**
 * Writes and index changes run one at a time, so two saves cannot overwrite each other's index line.
 * Reads do not wait in this line.
 */
let storageTail: Promise<unknown> = Promise.resolve();

function runInStorageOrder<T>(task: () => Promise<T>): Promise<T> {
  const run = storageTail.then(task);
  storageTail = run.catch(() => undefined);
  return run;
}

/** Sets the account whose saved values are read and written. `null` (signed out) turns the cache off. */
export function setCacheAccount(profileId: string | null): void {
  activeAccount = profileId || null;
}

/** The account currently set, or null. */
export function getCacheAccount(): string | null {
  return activeAccount;
}

/** Whether a key may be saved at all. Checked here, so no caller can skip the denylist. */
export function isPersistable(key: string): boolean {
  const lower = key.toLowerCase();
  if (lower === '') return false;
  if (NEVER_PERSIST.some((prefix) => lower.startsWith(prefix))) return false;
  return !NEVER_PERSIST_ANYWHERE.some((word) => lower.includes(word));
}

const accountPrefix = (profileId: string) => `${ROOT}${profileId}.`;
const entryKeyFor = (profileId: string, key: string) => `${accountPrefix(profileId)}${key}`;
const indexKeyFor = (profileId: string) => `${ROOT}index.${profileId}`;

/** The UTF-8 length of a string, which is what storage actually keeps. */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // A surrogate pair is one code point of four bytes.
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function isIndexEntry(value: unknown): value is IndexEntry {
  if (typeof value !== 'object' || value === null) return false;
  const { key, bytes, savedAt } = value as Record<string, unknown>;
  return typeof key === 'string' && typeof bytes === 'number' && typeof savedAt === 'number';
}

/**
 * An account's index. Missing or unreadable JSON counts as empty. A storage failure throws, so the
 * caller skips its write rather than overwrite an index it could not read.
 */
async function readIndex(profileId: string): Promise<IndexEntry[]> {
  const raw = await AsyncStorage.getItem(indexKeyFor(profileId));
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isIndexEntry) : [];
  } catch {
    return [];
  }
}

function isEnvelope(value: unknown): value is { v: number; savedAt: number; value: unknown } {
  if (typeof value !== 'object' || value === null) return false;
  const { v, savedAt } = value as Record<string, unknown>;
  return v === VERSION && typeof savedAt === 'number' && Number.isFinite(savedAt) && 'value' in value;
}

/** Stores one copy and updates the account's index, dropping the oldest copies if over the cap. */
async function storeEntry(
  profileId: string,
  key: string,
  envelope: string,
  bytes: number,
  savedAt: number,
): Promise<void> {
  // The copy being replaced is not counted against itself.
  const kept = (await readIndex(profileId))
    .filter((entry) => entry.key !== key)
    .sort((a, b) => a.savedAt - b.savedAt);
  let total = kept.reduce((sum, entry) => sum + entry.bytes, 0);
  const evicted: string[] = [];
  while (kept.length > 0 && total + bytes > MAX_ACCOUNT_BYTES) {
    const oldest = kept.shift();
    if (!oldest) break;
    total -= oldest.bytes;
    evicted.push(oldest.key);
  }
  await AsyncStorage.setItem(entryKeyFor(profileId, key), envelope);
  if (evicted.length > 0) {
    await AsyncStorage.multiRemove(evicted.map((k) => entryKeyFor(profileId, k)));
  }
  await AsyncStorage.setItem(indexKeyFor(profileId), JSON.stringify([...kept, { key, bytes, savedAt }]));
}

/** Forgets one key's copy for one account, and its index line. */
async function dropEntry(profileId: string, key: string): Promise<void> {
  const index = await readIndex(profileId);
  const remaining = index.filter((entry) => entry.key !== key);
  await AsyncStorage.removeItem(entryKeyFor(profileId, key));
  if (remaining.length !== index.length) {
    await AsyncStorage.setItem(indexKeyFor(profileId), JSON.stringify(remaining));
  }
}

/**
 * Saves a value for the active account under `key`, replacing any earlier copy. Skipped silently when
 * no account is set, the key may not be saved, or the value is over the size limit. In that last case
 * an older copy of the same key is dropped too, so the screen never shows data the app stopped
 * saving. The value is serialised at call time. Resolves once the save has landed or failed. Never
 * throws.
 */
export async function writePersisted(key: string, value: unknown): Promise<void> {
  const profileId = activeAccount;
  if (!profileId || !isPersistable(key)) return;
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return;
    if (utf8Bytes(json) > MAX_VALUE_BYTES) {
      await runInStorageOrder(() => dropEntry(profileId, key));
      return;
    }
    const savedAt = Date.now();
    const envelope = `{"v":${VERSION},"savedAt":${savedAt},"value":${json}}`;
    await runInStorageOrder(() => storeEntry(profileId, key, envelope, utf8Bytes(envelope), savedAt));
  } catch {
    // Best-effort: a failed save leaves whatever was saved before in place.
  }
}

/** How a saved copy is read: how old it may be, and the shape the caller needs from it. */
export interface PersistedReadOptions {
  /** A copy older than this is not returned. Defaults to 24 hours. */
  maxAgeMs?: number;
  /**
   * The caller's check on the saved value. A copy that fails it is not returned, and it is removed from the
   * device, so no later read meets it again.
   */
  validate?: (value: unknown) => boolean;
}

/**
 * The value saved for the active account under `key`, with when it was saved. Null when no account is
 * set, nothing is saved, the copy is older than `maxAgeMs`, it was saved under another schema version,
 * it is unreadable, or storage fails. A copy dated after now (the clock was moved back) is not trusted
 * either. A copy whose value fails `validate` is removed and treated as nothing saved. Never throws.
 */
export async function readPersisted<T>(
  key: string,
  options: PersistedReadOptions = {},
): Promise<SavedValue<T> | null> {
  const profileId = activeAccount;
  if (!profileId || !isPersistable(key)) return null;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  try {
    const raw = await AsyncStorage.getItem(entryKeyFor(profileId, key));
    if (raw === null) return null;
    const envelope: unknown = JSON.parse(raw);
    if (!isEnvelope(envelope)) return null;
    const age = Date.now() - envelope.savedAt;
    if (age < 0 || age > maxAgeMs) return null;
    if (options.validate && !options.validate(envelope.value)) {
      // Removed through the same queue as saves, so it cannot interleave with another index update.
      await runInStorageOrder(() => dropEntry(profileId, key));
      return null;
    }
    return { value: envelope.value as T, savedAt: envelope.savedAt };
  } catch {
    return null;
  }
}

/**
 * Removes every value saved for an account, and its index. Saves already queued for the account land
 * first, so none of them comes back afterwards. Works from the index and also from a listing of the
 * device's keys, so copies survive a lost index. Never throws.
 */
export function clearPersisted(profileId: string): Promise<void> {
  if (!profileId) return Promise.resolve();
  return runInStorageOrder(async () => {
    try {
      const doomed = new Set<string>([indexKeyFor(profileId)]);
      try {
        for (const entry of await readIndex(profileId)) {
          doomed.add(entryKeyFor(profileId, entry.key));
        }
      } catch {
        // Index unreadable: the listing below still finds the copies.
      }
      try {
        for (const storageKey of await AsyncStorage.getAllKeys()) {
          if (storageKey.startsWith(accountPrefix(profileId))) doomed.add(storageKey);
        }
      } catch {
        // Listing unavailable: the index above is all there is.
      }
      await AsyncStorage.multiRemove(Array.from(doomed));
    } catch {
      // Best-effort: a copy that survives is never read for another account.
    }
  });
}
