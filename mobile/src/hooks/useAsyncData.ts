import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-run the fetcher (e.g. pull-to-refresh or after a mutation). */
  reload: () => void;
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

/**
 * Runs an async fetcher on mount (and whenever `deps` change), exposing
 * loading / error / data plus a `reload`. Keeps screen code declarative and
 * consistent across the app.
 *
 * Pass `cacheKey` to share a result across screens/remounts: the first
 * caller to resolve a key seeds the cache, and later mounts render that
 * cached value immediately (no loading flash) while still revalidating in
 * the background, so the data self-heals if it was stale.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  cacheKey?: string,
): AsyncState<T> {
  const cached = cacheKey && cache.has(cacheKey) ? (cache.get(cacheKey) as T) : null;
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    // Only show the skeleton when there's nothing cached to show yet —
    // a background revalidation shouldn't yank a rendered screen back to
    // a loading state.
    if (!keyRef.current || !cache.has(keyRef.current)) {
      setLoading(true);
    }
    setError(null);
    fetcher()
      .then((result) => {
        if (keyRef.current) cache.set(keyRef.current, result);
        if (active) setData(result);
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : 'Something went wrong.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}
