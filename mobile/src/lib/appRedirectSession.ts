/**
 * appRedirectSession.ts — open a browser flow that comes back to the app.
 *
 * Three flows hand the user to a website and wait for a deep link back:
 * Google sign-in, wallet top-up, and paying at hire. All three used
 * `WebBrowser.openAuthSessionAsync` alone, and all three could hang forever on
 * Android:
 *
 *   • Chrome does not follow a *server* redirect into `taskbuddy://`, so the
 *     backend answers those with a page that asks for the link from script
 *     (backend `renderAppRedirectPage`).
 *   • Once the link is asked for that way, Android may deliver it to the app's
 *     Linking handler rather than to the browser session that opened it —
 *     especially in a development build, which already owns the scheme for its
 *     own launcher links. `openAuthSessionAsync` then never settles.
 *
 * So the browser result is raced against a Linking listener for the same
 * redirect, and whichever arrives first wins. This is the only place in the
 * app that should call `openAuthSessionAsync` for a flow that returns via a
 * deep link.
 */

import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export type RedirectSessionResult =
  | { type: 'success'; url: string }
  | { type: 'cancel' | 'dismiss' | 'locked' | 'opened' };

/**
 * Opens `url` and resolves once the browser returns to `redirectUri`.
 *
 * A 'cancel'/'dismiss' result means the user closed the browser — which is
 * never proof of what happened on the far side, so callers ask the server
 * rather than assuming the payment or sign-in failed.
 */
export async function openRedirectSession(
  url: string,
  redirectUri: string,
): Promise<RedirectSessionResult> {
  // Compare against the redirect without its query string: the backend appends
  // its own parameters (tokens, `topup=`, `hire=`) to whatever it was given.
  const prefix = redirectUri.split('?')[0];

  let unsubscribe: (() => void) | undefined;
  const viaLinking = new Promise<RedirectSessionResult>((resolve) => {
    const subscription = Linking.addEventListener('url', ({ url: incoming }) => {
      if (!incoming.startsWith(prefix)) return;
      resolve({ type: 'success', url: incoming });
    });
    unsubscribe = () => subscription.remove();
  });

  try {
    const result = await Promise.race([
      WebBrowser.openAuthSessionAsync(url, redirectUri),
      viaLinking,
    ]);

    // The tab is still open when Linking delivered the redirect first.
    if (result.type === 'success') {
      await WebBrowser.dismissBrowser().catch(() => {});
    }

    return result as RedirectSessionResult;
  } finally {
    unsubscribe?.();
  }
}
