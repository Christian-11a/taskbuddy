/**
 * savedCopy.ts: test helpers for the copies a screen keeps on the device (see persistentCache.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import { clearAsyncDataCache } from '../hooks/useAsyncData';
import { setCacheAccount } from '../lib/persistentCache';

/** The account the saved copies in these tests belong to. */
export const SAVED_ACCOUNT = 'acct-saved-copy';

const entryKey = (key: string) => `taskbuddy.cache.v1.${SAVED_ACCOUNT}.${key}`;

/** Lets the saved-copy reads and any pending effects run to the end. */
export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

interface Drawing {
  toJSON: () => unknown;
  unmount: () => void;
}

/**
 * The drawn tree as text, for comparing two drawings. React's internals (owners and other back references) are
 * left out, and a repeated object is written as a marker, so the text is finite and the same for the same drawing.
 */
function drawingText(tree: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(tree, (key, value: unknown) => {
    if (key === '_owner' || key === '_store') return undefined;
    if (typeof value === 'function') return undefined;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[repeated]';
      seen.add(value);
    }
    return value;
  });
}

/**
 * Draws a screen with nothing saved, then again with a saved copy of `value` under `key`, and checks that the
 * second drawing is the first: a copy of the wrong shape is ignored, so the screen loads as it does with nothing
 * saved. The copy must also be gone from the device afterwards. `draw` renders the screen.
 */
export async function expectSavedCopyIgnored(key: string, value: unknown, draw: () => Drawing) {
  setCacheAccount(SAVED_ACCOUNT);
  try {
    clearAsyncDataCache();
    const nothingSaved = draw();
    await settle();
    const expected = drawingText(nothingSaved.toJSON());
    nothingSaved.unmount();

    clearAsyncDataCache();
    await AsyncStorage.setItem(entryKey(key), JSON.stringify({ v: 1, savedAt: Date.now(), value }));
    const withSavedCopy = draw();
    await settle();
    expect(drawingText(withSavedCopy.toJSON())).toBe(expected);
    expect(await AsyncStorage.getItem(entryKey(key))).toBeNull();
    withSavedCopy.unmount();
  } finally {
    setCacheAccount(null);
  }
}
