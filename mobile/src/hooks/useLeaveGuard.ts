import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

/** How many forms with unsaved changes are asking about Android back right now. */
let formsBlockingBack = 0;

/**
 * True while a form with unsaved changes is taking Android back. App's own back
 * handler steps aside then, so the form's question wins whichever listener React
 * Native calls first (App's handler is added again whenever its state changes).
 */
export function isBackBlockedByScreen(): boolean {
  return formsBlockingBack > 0;
}

/**
 * Stops a form being left by accident. While `dirty` is true, the header back
 * arrow (`requestLeave`) and Android's hardware back open the question instead
 * of leaving. With nothing unsaved both leave at once, as before.
 *
 * Hardware back is only taken while there is something to lose. A clean form
 * leaves the back handling to the app's own handler, as before.
 */
export function useLeaveGuard(dirty: boolean, onLeave: () => void) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!dirty) return undefined;
    formsBlockingBack += 1;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setAsking(true);
      return true;
    });
    return () => {
      formsBlockingBack -= 1;
      sub.remove();
    };
  }, [dirty]);

  const requestLeave = useCallback(() => {
    if (dirty) setAsking(true);
    else onLeave();
  }, [dirty, onLeave]);

  const keepEditing = useCallback(() => setAsking(false), []);

  const leave = useCallback(() => {
    setAsking(false);
    onLeave();
  }, [onLeave]);

  return { asking, requestLeave, keepEditing, leave };
}

/**
 * For a screen that answers every Android back press itself, such as a multi-step
 * form that goes back a step before it leaves. While mounted, App's back handler
 * steps aside (isBackBlockedByScreen), and `onBack` gets each press. `onBack` must
 * do the leaving or the stepping itself, because the press is always taken here.
 */
export function useScreenBackHandler(onBack: () => void) {
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    formsBlockingBack += 1;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      latest.current();
      return true;
    });
    return () => {
      formsBlockingBack -= 1;
      sub.remove();
    };
  }, []);
}
