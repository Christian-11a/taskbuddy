/**
 * useScrollToFirstError.ts
 *
 * After a submit button finds problems, show the person the first one: scroll
 * the form to it and, when it is a text field, focus it. "First" is the order
 * the fields appear on screen, which the screen passes in, not the order the
 * validation rules happen to run.
 *
 * Usage: attach `scrollRef` to the form's ScrollView, wrap each field in a View
 * with `onLayout={fieldLayout('name')}` (a direct child of the scroll content, so
 * its y is a scroll offset), pass `ref={inputRef('name')}` to text fields, and
 * call `scrollToFirstError(errors)` when the check fails.
 */

import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';

type Focusable = { focus: () => void } | null;

/** Room left above the field a scroll lands on, so its label is not clipped. */
const TOP_MARGIN = 12;

export function useScrollToFirstError<K extends string>(order: readonly K[]) {
  const scrollRef = useRef<ScrollView>(null);
  const containerTop = useRef(0);
  const positions = useRef<Partial<Record<K, number>>>({});
  const inputs = useRef<Partial<Record<K, Focusable>>>({});
  const refSetters = useRef<Partial<Record<K, (node: Focusable) => void>>>({});

  const fieldLayout = useCallback(
    (key: K) => (event: LayoutChangeEvent) => {
      positions.current[key] = event.nativeEvent.layout.y;
    },
    [],
  );

  /** For fields nested in a card: put this on the card so offsets add up. */
  const containerLayout = useCallback((event: LayoutChangeEvent) => {
    containerTop.current = event.nativeEvent.layout.y;
  }, []);

  /** Stable per-key callback ref; works with forwardRef inputs. */
  const inputRef = useCallback((key: K) => {
    let setter = refSetters.current[key];
    if (!setter) {
      setter = (node: Focusable) => { inputs.current[key] = node; };
      refSetters.current[key] = setter;
    }
    return setter;
  }, []);

  /**
   * Scrolls to and focuses the topmost field that has an error. Returns that
   * field's key, or null when nothing is wrong.
   */
  const scrollToFirstError = useCallback(
    (errors: Partial<Record<K, unknown>>): K | null => {
      const first = order.find((key) => !!errors[key]);
      if (!first) return null;
      scrollRef.current?.scrollTo({ y: Math.max(0, containerTop.current + (positions.current[first] ?? 0) - TOP_MARGIN), animated: true });
      inputs.current[first]?.focus();
      return first;
    },
    [order],
  );

  return { scrollRef, fieldLayout, containerLayout, inputRef, scrollToFirstError };
}
