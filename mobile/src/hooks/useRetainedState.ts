import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

/**
 * UI state that survives a screen unmounting.
 *
 * App.tsx navigates by swapping whole screen trees, so opening a job detail
 * unmounts the list behind it and going back remounts it from scratch — the
 * selected filter and scroll position were lost every time. This keeps them
 * in memory for the session. Call `clearRetainedState()` on sign-out.
 */
const store = new Map<string, unknown>();

export function clearRetainedState() {
  store.clear();
}

export function useRetainedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() =>
    store.has(key) ? (store.get(key) as T) : initial,
  );
  const set = useCallback(
    (next: T) => {
      store.set(key, next);
      setValue(next);
    },
    [key],
  );
  return [value, set] as const;
}

/**
 * Restores a ScrollView's vertical offset when the screen comes back. Spread
 * the returned props onto the ScrollView.
 */
export function useRetainedScroll(key: string) {
  const ref = useRef<ScrollView>(null);
  const storeKey = `scroll:${key}`;
  const restored = useRef(false);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      store.set(storeKey, e.nativeEvent.contentOffset.y);
    },
    [storeKey],
  );

  // Content often arrives after mount (data loads), so restore once the
  // content is tall enough to hold the saved offset rather than on mount.
  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const y = store.get(storeKey) as number | undefined;
      if (restored.current || !y) return;
      if (h > y) {
        ref.current?.scrollTo({ y, animated: false });
        restored.current = true;
      }
    },
    [storeKey],
  );

  useEffect(() => {
    restored.current = false;
  }, [storeKey]);

  return { ref, onScroll, onContentSizeChange, scrollEventThrottle: 64 };
}
