import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { subscribeToChatPushes } from '../lib/pushNotifications';

/** How often the Messages badge re-reads the unread count while the app is open. */
const POLL_MS = 30_000;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Calls `listener` whenever chat unread counts may have changed. */
export function subscribeChatUnread(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tell every badge to re-read now, e.g. after a chat is marked read. */
export function refreshChatUnread() {
  for (const listener of listeners) listener();
}

/**
 * Unread chat messages for the Messages tab badge (migration 0061). Refreshes
 * on a timer, when the app returns to the foreground, when a chat push
 * arrives, and when a chat screen marks a conversation read. Chat is kept out
 * of the Notifications screen, so this badge is how people see new messages.
 */
export function useChatUnread(enabled: boolean): number {
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    if (!enabled) return;
    api.chatUnread()
      .then((result) => setTotal(result.total))
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setTotal(0);
      return;
    }
    load();
    listeners.add(load);
    const timer = setInterval(load, POLL_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    let unsubscribePush: (() => void) | null = null;
    let disposed = false;
    void subscribeToChatPushes(load).then((unsubscribe) => {
      if (disposed) unsubscribe();
      else unsubscribePush = unsubscribe;
    });
    return () => {
      disposed = true;
      listeners.delete(load);
      clearInterval(timer);
      appState.remove();
      unsubscribePush?.();
    };
  }, [enabled, load]);

  return total;
}
