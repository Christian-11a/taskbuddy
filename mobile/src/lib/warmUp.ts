/**
 * warmUp.ts: asks the API server for its health route as soon as the app opens. The deployed server
 * sleeps on the free tier and a cold start can take most of a minute, so this starts that wake-up while
 * the person is still on the first screen. One request per launch: nothing waits for it, it is never
 * retried, and no error reaches a screen.
 */

import { getApiBaseUrl } from './api';

/** Long enough for a cold start to answer, short enough not to hold a connection open for long. */
const WARM_UP_TIMEOUT_MS = 15000;

let started = false;

/** Sends the warm-up request, once per launch. Fire-and-forget: never throws and never retries. */
export function warmUpServer(): void {
  if (started) return;
  started = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARM_UP_TIMEOUT_MS);
  try {
    void fetch(`${getApiBaseUrl()}/health`, { signal: controller.signal })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  } catch {
    clearTimeout(timer);
  }
}
