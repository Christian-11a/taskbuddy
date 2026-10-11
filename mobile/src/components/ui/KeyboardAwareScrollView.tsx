/**
 * KeyboardAwareScrollView.tsx
 *
 * A ScrollView that keeps the focused field above the keyboard. A form's sticky
 * footer sits outside the ScrollView, so when the keyboard opens the viewport
 * shrinks to the space above that footer, but nothing moves the field that has
 * focus into the space that is left. Here the field is measured against the
 * viewport and scrolled until it sits inside it with FIELD_MARGIN of room.
 *
 * Fields opt in through FieldScrollContext (the shared inputs do, via
 * useRevealOnFocus). Outside a KeyboardAwareScrollView they do nothing, so an
 * input renders and takes focus exactly as before.
 */

import React, { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import {
  Keyboard,
  ScrollView,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';

/** Room kept between a revealed field and the edges of the visible area. */
export const FIELD_MARGIN = 24;

/** A second look this long after focus, for a keyboard that is still sliding up. */
const RETRY_AFTER_FOCUS_MS = 150;

/** Anything that reports its on-screen rectangle: a TextInput or a View. */
export type MeasurableField = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

export type FieldRef = React.RefObject<MeasurableField | null>;

export type FieldScrollContextValue = {
  /** Brings the field into the visible area of the enclosing scroll view. */
  scrollFieldIntoView: (field: FieldRef) => void;
};

export const FieldScrollContext = createContext<FieldScrollContextValue | null>(null);

/**
 * The reveal for one field, called from its onFocus. A no-op when the field is
 * not inside a KeyboardAwareScrollView.
 */
export function useRevealOnFocus(field: FieldRef): () => void {
  const scroll = useContext(FieldScrollContext);
  return useCallback(() => scroll?.scrollFieldIntoView(field), [scroll, field]);
}

export type ScrollTargetInput = {
  /** Top of the field, measured from the top of the scroll content. */
  fieldTop: number;
  fieldHeight: number;
  /** The current scroll offset. */
  scrollY: number;
  /** Height of the visible part of the ScrollView: above the keyboard and any footer. */
  viewportHeight: number;
  margin: number;
};

/**
 * The scroll offset that puts a field, with `margin` of room on each side, inside
 * the visible area, or null when no scroll is needed. A field above the view
 * scrolls up to its top margin; one below scrolls down to its bottom margin. A
 * field too tall to keep both margins keeps its top edge when it is above the
 * view, and its bottom edge otherwise. The offset is never negative.
 */
export function scrollTargetFor({
  fieldTop, fieldHeight, scrollY, viewportHeight, margin,
}: ScrollTargetInput): number | null {
  if (viewportHeight <= 0) return null;
  const wantedTop = fieldTop - margin;
  const wantedBottom = fieldTop + fieldHeight + margin;
  let next: number;
  if (wantedTop < scrollY) next = wantedTop;
  else if (wantedBottom > scrollY + viewportHeight) next = wantedBottom - viewportHeight;
  else return null;
  next = Math.max(0, next);
  return next === scrollY ? null : next;
}

/**
 * A ScrollView that scrolls the focused field above the keyboard. Takes every
 * ScrollView prop. keyboardShouldPersistTaps defaults to "handled", so a tap on a
 * button still lands while the keyboard is up.
 */
const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(
  { keyboardShouldPersistTaps = 'handled', scrollEventThrottle = 16, onScroll, onLayout, children, ...scrollProps },
  ref,
) {
  const scrollRef = useRef<ScrollView | null>(null);
  const offsetY = useRef(0);
  const viewportHeight = useRef(0);
  const focusedField = useRef<FieldRef | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The caller's ref and ours both point at the same ScrollView.
  const setScrollRef = useCallback((node: ScrollView | null) => {
    scrollRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  const revealFocusedField = useCallback(() => {
    const field = focusedField.current?.current;
    const scroller = scrollRef.current;
    const nativeScroller = scroller?.getNativeScrollRef();
    const viewport = viewportHeight.current;
    if (!field || !scroller || !nativeScroller || viewport <= 0) return;
    // Both rectangles are on screen, so their difference is where the field sits in the visible area.
    field.measureInWindow((_x, fieldY, _width, fieldHeight) => {
      if (fieldHeight <= 0) return;
      nativeScroller.measureInWindow((_viewX, viewportY) => {
        const scrollY = offsetY.current;
        const next = scrollTargetFor({
          fieldTop: fieldY - viewportY + scrollY,
          fieldHeight,
          scrollY,
          viewportHeight: viewport,
          margin: FIELD_MARGIN,
        });
        if (next !== null) scroller.scrollTo({ y: next, animated: true });
      });
    });
  }, []);

  const scrollFieldIntoView = useCallback((field: FieldRef) => {
    focusedField.current = field;
    // Once now (the keyboard may already be up), once the keyboard has had time to
    // slide in, and again on keyboardDidShow and when the viewport resizes.
    revealFocusedField();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      revealFocusedField();
    }, RETRY_AFTER_FOCUS_MS);
  }, [revealFocusedField]);

  const context = useMemo(() => ({ scrollFieldIntoView }), [scrollFieldIntoView]);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => revealFocusedField());
    // Once the keyboard is gone no field is being typed in, so a later show must not chase an old one.
    const hidden = Keyboard.addListener('keyboardDidHide', () => { focusedField.current = null; });
    return () => {
      shown.remove();
      hidden.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [revealFocusedField]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  }, [onScroll]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    // The viewport shrinks as the keyboard opens, so a field visible before may not be now.
    revealFocusedField();
    onLayout?.(event);
  }, [onLayout, revealFocusedField]);

  return (
    <FieldScrollContext.Provider value={context}>
      <ScrollView
        {...scrollProps}
        ref={setScrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        scrollEventThrottle={scrollEventThrottle}
        onScroll={handleScroll}
        onLayout={handleLayout}
      >
        {children}
      </ScrollView>
    </FieldScrollContext.Provider>
  );
});

export default KeyboardAwareScrollView;
