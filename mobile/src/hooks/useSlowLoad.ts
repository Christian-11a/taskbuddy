import { useEffect, useState } from 'react';

/** How long a load with nothing to show runs before the screen says the server may be waking up. */
export const SLOW_LOAD_MS = 8000;

/**
 * True once a screen has been loading for `ms` with nothing to show, so it can say the API server is
 * probably waking up (the free tier sleeps). Off as soon as the load ends or data arrives, and the wait
 * starts again for the next load.
 */
export function useSlowLoad(loading: boolean, hasData: boolean, ms: number = SLOW_LOAD_MS): boolean {
  const waiting = loading && !hasData;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting, ms]);

  return waiting && slow;
}
