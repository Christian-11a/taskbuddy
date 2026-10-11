import { useCallback, useEffect, useState } from 'react';
import {
  getCacheAccount,
  isPersistable,
  readPersisted,
  writePersisted,
  type SavedValue,
} from '../lib/persistentCache';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the fetcher (e.g. pull-to-refresh or after a mutation). */
  reload: () => void;
  /**
   * True while the data on screen did not come from a fetch that succeeded: a saved copy shown before
   * the fetch finished, or data that a failed refresh left in place.
   */
  stale: boolean;
  /** True while a fetch is in flight and data is already on screen. */
  refreshing: boolean;
}

export interface AsyncDataOptions {
  /**
   * Keep the last successful result on this device, under the signed-in account, so the next launch
   * can show it at once (marked `stale`) while the fetch runs. Only for a `cacheKey` that
   * persistentCache allows. Anything else behaves as it does without this option.
   */
  persist?: boolean;
  /** A saved result older than this is not shown. Defaults to 24 hours. */
  maxAgeMs?: number;
}

/**
 * Cross-mount cache, keyed by `cacheKey`. This app switches screens by
 * unmounting/remounting (App.tsx's manual tab switch, not a persistent
 * navigator that keeps siblings alive), so without this every tab switch
 * re-fetched from scratch and flashed a full skeleton — even for data
 * (like the job list) that several screens fetch independently and that
 * barely changes between taps.
 */
const cache = new Map<string, unknown>();

/** Clear account-owned results on logout, and between isolated tests. */
export function clearAsyncDataCache() {
  cache.clear();
}

interface Core<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  refreshing: boolean;
}

type Step<T> =
  | { type: 'start'; showSkeleton: boolean }
  | { type: 'saved'; value: T }
  | { type: 'fetched'; value: T }
  | { type: 'failed'; message: string };

function step<T>(state: Core<T>, action: Step<T>): Core<T> {
  switch (action.type) {
    case 'start':
      // Only show the skeleton when there's nothing cached to show yet.
      return {
        ...state,
        loading: action.showSkeleton ? true : state.loading,
        error: null,
        refreshing: state.data !== null,
      };
    case 'saved':
      // A saved copy only fills an empty screen. Anything already on it is newer.
      if (state.data !== null) return state;
      return { ...state, data: action.value, loading: false, stale: true, refreshing: true };
    case 'fetched':
      return { ...state, data: action.value, loading: false, stale: false, refreshing: false };
    case 'failed':
      // Data already on screen stays, so a failed refresh never blanks it.
      return {
        ...state,
        error: action.message,
        loading: false,
        refreshing: false,
        stale: state.data !== null,
      };
  }
}

/**
 * Runs an async fetcher on mount (and whenever `deps` change), exposing
 * loading / error / data plus a `reload`. Keeps screen code declarative and
 * consistent across the app.
 *
 * Pass `cacheKey` to share a result across screens/remounts: the first
 * caller to resolve a key seeds the cache, and later mounts render that
 * cached value immediately (no loading flash) while still revalidating in
 * the background, so the data self-heals if it was stale.
 *
 * With `options.persist`, the last successful result is also kept on the device for the signed-in
 * account (see persistentCache.ts). When nothing is in memory, the saved copy is shown first, marked
 * `stale`, and replaced once the fetch succeeds. A saved copy that arrives after a successful fetch,
 * or after the key changed or the screen went, is ignored. When the fetch fails first, the error
 * waits for the saved read, so the saved copy is shown with the error (an offline launch).
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  cacheKey?: string,
  options?: AsyncDataOptions,
): AsyncState<T> {
  const persist = options?.persist === true;
  const maxAgeMs = options?.maxAgeMs;
  const [state, setState] = useState<Core<T>>(() => {
    const cached = cacheKey && cache.has(cacheKey) ? (cache.get(cacheKey) as T) : null;
    return { data: cached, loading: cached === null, error: null, stale: false, refreshing: false };
  });
  const [nonce, setNonce] = useState(0);

  const dispatch = useCallback((action: Step<T>) => setState((s) => step(s, action)), []);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // Set by a successful fetch only: a saved copy that lands after it is ignored.
    let fetched = false;
    const account = getCacheAccount();
    const hadMemory = !!cacheKey && cache.has(cacheKey);
    // A saved copy is only kept for a key that may be saved, while an account is signed in.
    const savedKey =
      persist && cacheKey && isPersistable(cacheKey) && account !== null ? cacheKey : null;

    dispatch({ type: 'start', showSkeleton: !hadMemory });

    // Read once per run. Resolves to null when nothing usable is saved, or when the read fails.
    const savedRead: Promise<SavedValue<T> | null> | null =
      savedKey && !hadMemory
        ? readPersisted<T>(savedKey, maxAgeMs).catch(() => null)
        : null;

    const showSaved = (saved: SavedValue<T> | null) => {
      if (active && !fetched && saved && getCacheAccount() === account) {
        dispatch({ type: 'saved', value: saved.value });
      }
    };
    if (savedRead) void savedRead.then(showSaved);

    fetcher()
      .then((result) => {
        fetched = true;
        if (!active) return;
        if (cacheKey) cache.set(cacheKey, result);
        if (savedKey && getCacheAccount() === account) void writePersisted(savedKey, result);
        dispatch({ type: 'fetched', value: result });
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : 'Something went wrong.';
        if (!savedRead) {
          if (active) dispatch({ type: 'failed', message });
          return;
        }
        // Wait for the saved read first: a saved copy shown with the error is what an offline launch needs.
        void savedRead.then((saved) => {
          if (!active) return;
          showSaved(saved);
          dispatch({ type: 'failed', message });
        });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    reload,
    stale: state.stale,
    refreshing: state.refreshing,
  };
}
