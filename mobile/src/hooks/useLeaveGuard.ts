import { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

/**
 * Stops a form being left by accident. While `dirty` is true, the header back
 * arrow (`requestLeave`) and Android's hardware back open the question instead
 * of leaving. With nothing unsaved both leave at once, as before.
 *
 * Hardware back is only taken while there is something to lose. React Native
 * calls the most recently added listener first, so this one runs before the
 * app's own back handler, and a clean form still goes back through that handler.
 */
export function useLeaveGuard(dirty: boolean, onLeave: () => void) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!dirty) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setAsking(true);
      return true;
    });
    return () => sub.remove();
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
